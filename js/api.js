/* api.js —— OpenAI 兼容接口，支持流式 / 非流式 / 重试 / 中断
 * 只用 system + user 两条消息（不依赖多轮能力），
 * 长篇小说靠「提示词里装上下文」而不是靠对话历史。
 */
(function () {
  'use strict';
  var ML = window.ML;

  function cfg() { return ML.DB.getSettings(); }

  function jsonLen(o) { try { return JSON.stringify(o).length; } catch (e) { return 0; } }

  var API = {
    aborters: new Set(),

    abortAll: function () {
      API.aborters.forEach(function (a) { try { a.abort(); } catch (e) {} });
      API.aborters.clear();
    },

    /* 一次请求
     * opt: {system, user, temperature, maxTokens, stream, onDelta, signal, timeoutMs}
     */
    // 请求通道：默认走 fetch；若被 CORS 拦截，可切到 ML.__bridge（原生桥）
    send: function (url, init, onSSE) {
      if (ML.__bridge) return ML.__bridge(url, init, onSSE);
      return API._fetchSSE(url, init, onSSE);
    },

    // 用 fetch 发请求并解析 SSE；返回 {status, text}
    _fetchSSE: async function (url, init, onSSE) {
      var res = await fetch(url, init);
      if (!res.ok) {
        var errTxt = '';
        try { errTxt = await res.text(); } catch (e) {}
        return { status: res.status, text: '', error: errTxt };
      }
      var ct = (res.headers.get('content-type') || '');
      if (!onSSE || (ct.indexOf('event-stream') < 0 && ct.indexOf('stream') < 0)) {
        var j = await res.text();
        return { status: res.status, text: j, json: true };
      }
      var reader = res.body.getReader();
      var dec = new TextDecoder('utf-8');
      var buf = '';
      while (true) {
        var rd = await reader.read();
        if (rd.done) break;
        buf += dec.decode(rd.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) onSSE(lines[i]);
      }
      if (buf.trim()) onSSE(buf);
      return { status: res.status, text: '', sse: true };
      // 说明：onSSE 逐行回调，外层函数（caller）负责累积与超时重置
    },

    chat: async function (opt) {
      var s = cfg();
      if (!s.apiKey) throw new Error('还没填 API Key（设置 → 接口）');
      var base = (s.baseURL || '').replace(/\/+$/, '');
      var url = base + '/chat/completions';

      var body = {
        model: opt.model || s.model,
        temperature: opt.temperature == null ? (s.temperature == null ? 0.9 : s.temperature) : opt.temperature,
        stream: opt.stream !== false,
        messages: [
          { role: 'system', content: opt.system || '你是一位职业网络小说作家。' },
          { role: 'user', content: opt.user || '' }
        ]
      };
      if (opt.maxTokens) body.max_tokens = opt.maxTokens;

      var ctrl = new AbortController();
      var signal = ctrl.signal;
      API.aborters.add(ctrl);
      var timer = null;
      // 流式时用「空闲超时」而不是整体超时
      var idleMs = opt.timeoutMs || (opt.stream !== false ? 90000 : 180000);
      function resetTimer() {
        clearTimeout(timer);
        timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, idleMs);
      }
      if (opt.signal) {
        if (opt.signal.aborted) { ctrl.abort(); }
        else opt.signal.addEventListener('abort', function () { try { ctrl.abort(); } catch (e) {} });
      }
      resetTimer();

      var t0 = Date.now();
      var text = '';
      function onSSE(line) {
        resetTimer();
        var ln = String(line || '').trim();
        if (!ln || ln.indexOf('data:') !== 0) return;
        var payload = ln.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          var obj = JSON.parse(payload);
          var d = obj.choices && obj.choices[0] && obj.choices[0].delta;
          if (d && d.content) { text += d.content; if (opt.onDelta) opt.onDelta(d.content, text); }
        } catch (e) { /* 忽略半行 */ }
      }
      try {
        var r = await API.send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
          body: JSON.stringify(body),
          signal: signal
        }, opt.stream !== false ? onSSE : null);
        resetTimer();
        if (r.status < 200 || r.status >= 300) {
          var msg = 'HTTP ' + r.status;
          try {
            var j = JSON.parse(r.error);
            if (j.error && j.error.message) msg += '：' + j.error.message;
            else if (j.message) msg += '：' + j.message;
          } catch (e) { if (r.error) msg += '：' + ML.clip(String(r.error), 160); }
          throw new Error(msg);
        }
        if (r.json) {
          var data = JSON.parse(r.text);
          text = API._pick(data);
          if (opt.onDelta) opt.onDelta(text, text);
        }
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('已中止');
        if (e.message && /Failed to fetch|Network request failed|Load failed/i.test(e.message)) {
          throw new Error('网络连不上接口（检查 Base URL / API Key / 网络 / 跨域）');
        }
        throw e;
      } finally {
        clearTimeout(timer);
        API.aborters.delete(ctrl);
      }

      var dt = Date.now() - t0;
      var p = ML.DB.getProject(ML.cur && ML.cur.meta ? ML.cur.meta.id : '');
      if (p) { p.stats.calls = (p.stats.calls || 0) + 1; }
      return { text: text, ms: dt, chars: text.length, model: body.model };
    },

    _pick: function (data) {
      if (data.choices && data.choices[0]) {
        var m = data.choices[0].message || data.choices[0].delta || {};
        return m.content || '';
      }
      if (data.content) return data.content;
      return '';
    },

    /* 带重试的调用，指数退避 */
    chatRetry: async function (opt) {
      var s = cfg();
      var tries = Math.max(1, s.retries || 3);
      var lastErr = null;
      for (var i = 0; i < tries; i++) {
        try {
          return await API.chat(opt);
        } catch (e) {
          lastErr = e;
          if (/已中止/.test(e.message)) throw e;
          if (!/HTTP 5|网络|Failed to fetch|timeout|timeout|Load failed/i.test(e.message + '') && i === 0) {
            // 非网络错误（如 401/400）不重试
            if (/HTTP 4/.test(e.message)) throw e;
          }
          if (i < tries - 1) {
            var wait = 1200 * Math.pow(2, i);
            if (opt.onRetry) opt.onRetry(i + 1, e.message, wait);
            await ML.sleep(wait);
          }
        }
      }
      throw lastErr;
    },

    /* 连通性测试 */
    test: async function (cfgOverride) {
      var s = Object.assign({}, cfg(), cfgOverride || {});
      if (!s.apiKey) throw new Error('还没填 API Key');
      var base = (s.baseURL || '').replace(/\/+$/, '');
      var r = await API.send(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
        body: JSON.stringify({
          model: s.model, stream: false, max_tokens: 16,
          messages: [{ role: 'user', content: '只回复两个字：可用' }]
        })
      }, null);
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + '：' + ML.clip(r.error || r.text, 200));
      try { return ML.clip(API._pick(JSON.parse(r.text)) || '（返回为空）', 60); }
      catch (e) { return ML.clip(r.text, 120); }
    }
  };

  Object.assign(ML, { API: API });
})();
