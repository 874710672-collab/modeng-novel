/* engine.js —— 全自动流水线引擎
 * 阶段: premise → characters → world → style → volumes → chapters（章纲→正文→质检→改稿→摘要→状态）→ done
 * 特点: 可暂停/继续/停止、断点恢复、无人工干预、每步落盘
 */
(function () {
  'use strict';
  var ML = window.ML, DB = ML.DB, P = ML.Prompts;

  var STAGES = [
    { k: 'premise', n: '立意', icon: '◆' },
    { k: 'characters', n: '人物', icon: '◆' },
    { k: 'world', n: '世界观', icon: '◆' },
    { k: 'style', n: '文风', icon: '◆' },
    { k: 'volumes', n: '卷纲', icon: '◆' },
    { k: 'chapters', n: '写章', icon: '◆' }
  ];

  var E = {
    STAGES: STAGES,
    running: false,
    paused: false,
    stopped: false,
    cur: null,
    listeners: [],
    on: function (fn) { E.listeners.push(fn); return function () { E.listeners = E.listeners.filter(function (f) { return f !== fn; }); }; },
    emit: function (type, data) {
      E.listeners.forEach(function (f) { try { f(type, data); } catch (e) { console.error(e); } });
    },
    log: function (p, text, kind) {
      var line = { t: ML.now(), text: text, kind: kind || '' };
      p.logs.push(line);
      if (p.logs.length > 400) p.logs.splice(0, p.logs.length - 400);
      E.emit('log', line);
    },

    /* ---------- 上下文构建 ---------- */
    ctx: function (p, extra) {
      var m = p.meta;
      var chars = (p.characters || []).map(function (c) {
        return '- ' + c.name + '（' + (c.role || '') + '）：' + (c.desc || '');
      }).join('\n');
      var vols = (p.volumes || []).map(function (v) {
        return '第' + v.no + '卷 ' + v.title + '（第' + v.fromCh + '-' + v.toCh + '章）主线：' + (v.summary || '');
      }).join('\n');
      var all = Object.assign({
        title: m.title, genre: m.genre, idea: p.setup.idea || '', expect: p.setup.expect || '',
        avoid: p.setup.avoid || '', cheat: p.setup.cheat || '', protagonist: p.setup.protagonist || '',
        target: p.setup.targetChapters || m.targetChapters || 45,
        targetChapters: p.setup.targetChapters || m.targetChapters || 45,
        chapterWords: p.setup.chapterWords || m.chapterWords || 2200,
        premise: (p.premise || '') + (p.premiseExtra ? '\n\n' + p.premiseExtra : ''),
        characters: chars || '（暂无）',
        world: p.world || '（暂无）',
        style: p.styleGuide || '（暂无）',
        volumes: vols || '（暂无）',
        state: p.stateFile || '（暂无，这是第一章）',
        summary: p.summary || '（暂无）'
      }, extra || {});
      return all;
    },

    /* 最近 n 章摘要 */
    recentSummaries: function (p, beforeNo, n) {
      var arr = (p.chapters || []).filter(function (c) { return c.no < beforeNo && c.summary; })
        .sort(function (a, b) { return b.no - a.no; }).slice(0, n || 3)
        .reverse();
      if (!arr.length) return '（暂无）';
      return arr.map(function (c) {
        return '【第' + c.no + '章】' + ML.clip(c.summary.replace(/\n+/g, ' '), 420);
      }).join('\n\n');
    },

    lastEnding: function (p, beforeNo, len) {
      var prev = DB.getChapter(p, beforeNo - 1);
      if (!prev || !prev.text) return '（暂无，本章是开篇）';
      var t = prev.text.replace(/\s+$/, '');
      return t.slice(-(len || 600));
    },

    /* ---------- 单步调用 ---------- */
    async step(p, promptKey, vars, opt) {
      opt = opt || {};
      var pr = P.get(promptKey, p);
      var sp = P.fill(pr.system, vars);
      var up = P.fill(pr.user, vars);
      E.emit('call', { promptKey: promptKey, phase: opt.phase || '' });
      var r = await ML.API.chatRetry({
        system: sp, user: up,
        temperature: opt.temperature == null ? undefined : opt.temperature,
        stream: !!opt.stream,
        onDelta: opt.onDelta,
        onRetry: function (n, msg, wait) { E.log(p, '  重试 ' + n + '：' + ML.clip(msg, 60) + '（' + Math.round(wait / 1000) + 's 后）', 'warn'); },
        signal: E._signal
      });
      return r.text.trim();
    },

    /* ---------- 清理输出 ---------- */
    clean: function (t) {
      t = String(t || '').trim();
      t = t.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '');
      t = t.replace(/^(好的|好，|以下是|下面是)[^\n]*\n+/, '');
      return t.trim();
    },

    /* ---------- 阶段执行 ---------- */
    async runStage(p, stage) {
      var m = p.meta;
      E.emit('stage', stage);
      if (stage === 'premise') {
        E.log(p, '立意：正在生成定位与卖点…');
        var t = E.clean(await E.step(p, 'premise', E.ctx(p), { stream: true, phase: '立意' }));
        p.premise = t;
        if (!m.logline) {
          var mm = t.match(/【一句话简介】([^\n]*)/);
          if (mm) m.logline = mm[1].trim();
        }
        p.stage = 'premise'; DB.saveProject(p); E.emit('update'); E.log(p, '立意完成', 'ok');
      }
      else if (stage === 'characters') {
        E.log(p, '人物：正在设计 8 个角色…');
        var t2 = E.clean(await E.step(p, 'characters', E.ctx(p), { stream: true, phase: '人物' }));
        p.charactersText = t2;
        p.characters = E.parseCharacters(t2);
        p.stage = 'characters'; DB.saveProject(p); E.emit('update'); E.log(p, '人物完成，共 ' + p.characters.length + ' 人', 'ok');
      }
      else if (stage === 'world') {
        E.log(p, '世界观：正在写规则与细节…');
        p.world = E.clean(await E.step(p, 'world', E.ctx(p), { stream: true, phase: '世界观' }));
        p.stage = 'world'; DB.saveProject(p); E.emit('update'); E.log(p, '世界观完成', 'ok');
      }
      else if (stage === 'style') {
        E.log(p, '文风：正在写写作规范…');
        p.styleGuide = E.clean(await E.step(p, 'style', E.ctx(p), { stream: true, phase: '文风' }));
        p.stage = 'style'; DB.saveProject(p); E.emit('update'); E.log(p, '文风完成', 'ok');
      }
      else if (stage === 'volumes') {
        E.log(p, '卷纲：正在拆分全书结构…');
        var tv = E.clean(await E.step(p, 'volumes', E.ctx(p), { stream: true, phase: '卷纲' }));
        p.volumes = E.parseVolumes(tv);
        p.volumesText = tv;
        if (!p.volumes.length) throw new Error('卷纲解析失败（没有识别到「### 第N卷」）');
        E.log(p, '卷纲完成：' + p.volumes.length + ' 卷，共 ' + p.volumes[p.volumes.length - 1].toCh + ' 章', 'ok');
        p.stage = 'volumes'; DB.saveProject(p); E.emit('update');
      }
    },

    /* ---------- 解析 ---------- */
    parseCharacters: function (t) {
      var out = [];
      var blocks = t.split(/\n(?=###\s)/);
      blocks.forEach(function (b) {
        var mm = b.match(/^###\s*(.+)$/m);
        if (!mm) return;
        var head = mm[1].trim();
        var nm = head.match(/^([^（(\s]+)/);
        var role = (head.match(/[（(]([^）)]*)[）)]/) || [])[1] || '';
        var desc = b.replace(/^###.*$/m, '').replace(/\n-?\s*/g, ' ').trim();
        out.push({ name: nm ? nm[1] : head, role: role, desc: ML.clip(desc, 400), appear: '' });
      });
      return out;
    },
    parseVolumes: function (t) {
      var out = [];
      var blocks = t.split(/\n(?=#+\s*第)/);
      blocks.forEach(function (b) {
        var mm = b.match(/^#+\s*第([零一二三四五六七八九十百\d]+)卷\s*(.*)$/m);
        if (!mm) return;
        var no = /^\d+$/.test(mm[1]) ? +mm[1] : E.cn2num(mm[1]);
        var range = b.match(/第\s*(\d+)\s*[-–—~到至]\s*(\d+)\s*章/);
        var goal = (b.match(/(?:本卷)?(?:主线目标|主线)[：:]\s*([^\n]+)/) || [])[1] || '';
        var summary = (b.replace(/^#+.*$/m, '').replace(/\s+/g, ' ')).trim();
        out.push({
          no: no, title: mm[2].trim(), fromCh: range ? +range[1] : 0, toCh: range ? +range[2] : 0,
          summary: ML.clip(summary, 500), goal: goal, status: 'pending'
        });
      });
      out.sort(function (a, b) { return a.no - b.no; });
      // 补齐缺省章节范围
      var last = 0;
      out.forEach(function (v, i) {
        if (!v.fromCh) v.fromCh = last + 1;
        if (!v.toCh) v.toCh = v.fromCh;
        last = v.toCh;
      });
      return out;
    },
    cn2num: function (s) {
      var map = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
      if (s.length === 1) return map[s] || 0;
      if (s.indexOf('十') === 0) return 10 + (map[s[1]] || 0);
      if (s.indexOf('十') === 1) return (map[s[0]] || 0) * 10 + (map[s[2]] || 0);
      return 0;
    },
    /* 解析章纲批量结果 */
    parseOutlines: function (t, fromCh, toCh) {
      var res = {};
      var re = /^#*\s*第\s*(\d+)\s*章\s*(.*)$/gm;
      var marks = [], mm;
      while ((mm = re.exec(t))) marks.push({ idx: mm.index, len: mm[0].length, n: +mm[1], title: mm[2].trim() });
      for (var i = 0; i < marks.length; i++) {
        var end = i + 1 < marks.length ? marks[i + 1].idx : t.length;
        var body = t.slice(marks[i].idx, end).replace(/^.*$/m, '').trim();
        var hk = (body.match(/结尾钩子[：:]\s*([^\n]+)/) || [])[1] || '';
        res[marks[i].n] = { title: marks[i].title.replace(/[（(]不超过.*?[）)]/g, '').trim(), outline: body, hook: hk };
      }
      return res;
    },

    /* ---------- 章纲准备 ---------- */
    outletched: function (p, no) {
      var c = DB.getChapter(p, no);
      return c && c.outline;
    },
    volFor: function (p, no) {
      for (var i = 0; i < p.volumes.length; i++) {
        var v = p.volumes[i];
        if (no >= v.fromCh && no <= v.toCh) return v;
      }
      return p.volumes[p.volumes.length - 1] || { title: '正篇', summary: '' };
    },
    /* 生成 no 起始的 batch 章章纲 */
    async ensureOutlines(p, fromNo, batch) {
      var toNo = Math.min(fromNo + batch - 1, p.targetChapters);
      var missing = [];
      for (var n = fromNo; n <= toNo; n++) {
        var c = DB.getChapter(p, n);
        if (!c || !c.outline) missing.push(n);
      }
      if (!missing.length) return;
      var m0 = missing[0], m1 = missing[missing.length - 1];
      var v = E.volFor(p, m0);
      E.log(p, '章纲：第 ' + m0 + '-' + m1 + ' 章（' + v.title + '）');
      var vars = E.ctx(p, {
        fromCh: m0, toCh: m1, batch: m1 - m0 + 1, n: m0,
        volTitle: v.title, volGoal: v.goal || v.summary || '',
        recentSummaries: E.recentSummaries(p, m0, 3),
        lastEnding: E.lastEnding(p, m0, 500)
      });
      var t = E.clean(await E.step(p, 'chapterOutline', vars, { stream: true, phase: '章纲 ' + m0 + '-' + m1 }));
      var got = E.parseOutlines(t, m0, m1);
      var cnt = 0;
      for (var i = m0; i <= m1; i++) {
        if (got[i]) {
          var ch = DB.ensureChapter(p, i);
          ch.title = got[i].title; ch.outline = got[i].outline; ch.hook = got[i].hook;
          ch.status = ch.text ? ch.status : 'outlined';
          cnt++;
        }
      }
      if (!cnt) throw new Error('章纲解析失败（AI 没按格式输出，见原文）');
      DB.saveProject(p); E.emit('update');
      E.log(p, '章纲就绪 ' + cnt + ' 章', 'ok');
    },

    /* ---------- 写一章 ---------- */
    async writeChapter(p, no, hooks) {
      var s = DB.getSettings();
      var c = DB.ensureChapter(p, no);
      var vars = E.ctx(p, {
        ch: no, outline: c.outline, chapterWords: p.meta.chapterWords || s.chapterWords,
        recentSummaries: E.recentSummaries(p, no, 3),
        lastEnding: E.lastEnding(p, no, 600)
      });

      c.status = 'writing'; c.updatedAt = ML.now();
      DB.saveProject(p); E.emit('update');
      E.log(p, '第' + no + '章 正文写作中…', '');

      var live = { text: '' };
      var r = await ML.API.chatRetry({
        system: P.fill(P.get('chapter', p).system, vars),
        user: P.fill(P.get('chapter', p).user, vars),
        stream: true,
        onDelta: function (piece, full) { live.text = full; E.emit('delta', { no: no, text: full }); },
        onRetry: function (n, msg, wait) { E.log(p, '  重试 ' + n + '：' + ML.clip(msg, 50), 'warn'); },
        signal: E._signal
      });
      var text = E.clean(r.text);
      // 去掉可能的 markdown 标题井号
      text = text.replace(/^#+\s*/, '');
      c.text = text;
      c.words = ML.countWords(text);
      c.status = 'written';
      c.model = r.model; c.ms = r.ms;
      c.updatedAt = ML.now();
      p.stats.written = (p.stats.written || 0) + c.words;
      DB.saveProject(p); E.emit('update');
      E.log(p, '第' + no + '章 完稿 ' + c.words + ' 字（' + ML.fmtDur(r.ms) + '）', 'ok');
      if (hooks && hooks.onChapterText) await hooks.onChapterText(c);
      return c;
    },

    /* ---------- 质检 + 定点改 ---------- */
    async reviewChapter(p, no, hooks) {
      var c = DB.getChapter(p, no);
      if (!c || !c.text) return;
      E.log(p, '第' + no + '章 质检中…');
      var vars = E.ctx(p, { outline: c.outline, text: c.text, chapterWords: p.meta.chapterWords });
      var rev = E.clean(await E.step(p, 'review', vars, { stream: true, phase: '质检 ' + no }));
      c.review = rev;
      var pass = /【结论】\s*通过/.test(rev) && !/【结论】\s*需修改/.test(rev);
      c.reviewPass = pass;
      DB.saveProject(p); E.emit('update');
      if (pass) { E.log(p, '第' + no + '章 质检通过', 'ok'); return; }

      var problemCount = (rev.match(/^\s*\d+\.\s*【/gm) || []).length;
      if (!DB.getSettings().autoReviewFix || problemCount === 0) {
        E.log(p, '第' + no + '章 质检有问题（' + problemCount + ' 条），已记录未改', 'warn');
        return;
      }
      E.log(p, '第' + no + '章 质检 ' + problemCount + ' 条问题，定点修改中…', 'warn');
      var fv = E.ctx(p, { review: rev, text: c.text, chapterWords: p.meta.chapterWords });
      var fixed = E.clean(await E.step(p, 'fix', fv, { stream: true, phase: '改稿 ' + no }));
      fixed = fixed.replace(/^#+\s*/, '');
      if (fixed.length > c.text.length * 0.6 && fixed.length < c.text.length * 1.8) {
        var before = c.words || ML.countWords(c.text);
        c.text = fixed;
        c.words = ML.countWords(fixed);
        c.status = 'fixed';
        c.updatedAt = ML.now();
        p.stats.written = (p.stats.written || 0) + (c.words - before);
        DB.saveProject(p); E.emit('update');
        E.log(p, '第' + no + '章 修改完成 ' + c.words + ' 字', 'ok');
      } else {
        c.status = 'fixed';
        E.log(p, '第' + no + '章 修改结果长度异常，已保留原稿', 'warn');
      }
      if (hooks && hooks.onChapterText) await hooks.onChapterText(c);
    },

    /* ---------- 记忆 ---------- */
    async memorize(p, no) {
      var c = DB.getChapter(p, no);
      if (!c || !c.text) return;
      var base = E.ctx(p, { text: c.text });
      E.log(p, '第' + no + '章 生成摘要…');
      var sum = E.clean(await E.step(p, 'summary', base, { stream: true, phase: '摘要 ' + no }));
      c.summary = sum;
      c.updatedAt = ML.now();
      DB.saveProject(p); E.emit('update');

      E.log(p, '第' + no + '章 更新状态文件…');
      var isFirst = !p.stateFile || p.stateFile.length < 40;
      var sv = E.ctx(p, {
        mode: isFirst ? '模式A 首次生成' : '模式B 按最新章更新',
        summary: sum
      });
      var st = E.clean(await E.step(p, 'state', sv, { stream: true, phase: '状态 ' + no }));
      if (st.length > 80) { p.stateFile = st; E.log(p, '状态文件已更新', 'ok'); }
      else E.log(p, '状态文件输出过短，已忽略', 'warn');

      // 滚动梗概：每 3 章压一次
      if (no % 3 === 0) {
        try {
          var dg = E.clean(await E.step(p, 'digest', E.ctx(p, {
            recentSummaries: E.recentSummaries(p, no + 1, 3), limit: 900
          }), { phase: '梗概' }));
          if (dg.length > 40) p.summary = dg;
        } catch (e) { E.log(p, '梗概更新失败：' + e.message, 'warn'); }
      }
      c.status = 'done';
      c.updatedAt = ML.now();
      DB.saveProject(p); E.emit('update');
    },

    /* ---------- 主循环 ---------- */
    async start(p, opt) {
      if (E.running) return;
      opt = opt || {};
      E.running = true; E.paused = false; E.stopped = false;
      E._signal = new AbortController().signal;
      p.meta.status = 'writing';
      p.targetChapters = p.meta.targetChapters || 45;
      p.stats.startedAt = p.stats.startedAt || ML.now();
      DB.saveProject(p);
      E.emit('start');
      E.log(p, '▶ 开工：目标 ' + p.targetChapters + ' 章 × ' + p.meta.chapterWords + ' 字', 'ok');

      var hooks = opt.hooks || {};
      try {
        /* 1. 前置五阶段 */
        for (var i = 0; i < 5; i++) {
          var st = STAGES[i].k;
          var done = (st === 'premise' && p.premise) || (st === 'characters' && p.characters.length) ||
            (st === 'world' && p.world) || (st === 'style' && p.styleGuide) ||
            (st === 'volumes' && p.volumes.length);
          if (done && !opt.redo) continue;
          await E.waitIfPaused();
          E.emit('stage', { key: st, name: STAGES[i].n, idx: i });
          await E.runStage(p, st);
          await ML.sleep(500);
        }
        E.emit('stage', { key: 'chapters', name: '写章', idx: 5 });

        /* 2. 逐章：每一章严格按 纲 → 文 → 检 → 改 → 忆 五步走完再进下一章 */
        var batch = 3;
        for (var no = 1; no <= p.targetChapters; no++) {
          if (!opt.rewrite) {
            var ex = DB.getChapter(p, no);
            if (ex && ex.status === 'done' && ex.text) continue;
          }
          E.cur = { no: no };
          await E.waitIfPaused();
          E.emit('chapter', { no: no, phase: 'outline' });
          await E.ensureOutlines(p, no, batch);
          await ML.sleep(300);

          await E.waitIfPaused();
          E.emit('chapter', { no: no, phase: 'write' });
          await E.writeChapter(p, no, hooks);

          if (DB.getSettings().autoReviewFix) {
            await E.waitIfPaused();
            E.emit('chapter', { no: no, phase: 'review' });
            try { await E.reviewChapter(p, no, hooks); }
            catch (e) { E.log(p, '质检出错（跳过）：' + e.message, 'warn'); }
          }

          await E.waitIfPaused();
          E.emit('chapter', { no: no, phase: 'memory' });
          try { await E.memorize(p, no); }
          catch (e) { E.log(p, '记忆更新出错（跳过）：' + e.message, 'warn'); }

          DB.saveProject(p);
          E.emit('chapterDone', { no: no });
          await ML.sleep(400);
        }
        p.meta.status = 'done';
        p.meta.finishedAt = ML.now();
        E.log(p, '■ 全部完成：' + p.targetChapters + ' 章，共 ' + E.progress(p).words + ' 字', 'ok');
      } catch (e) {
        if (E.stopped) {
          p.meta.status = 'stopped';
          E.log(p, '■ 已停止，进度已保存', 'warn');
        } else if (E.paused) {
          p.meta.status = 'paused';
          E.log(p, '⏸ 已暂停（可继续）', 'warn');
        } else {
          p.meta.status = 'error';
          E.log(p, '✕ 出错：' + e.message, 'err');
          p.lastError = { msg: e.message, at: ML.now(), no: E.cur && E.cur.no };
          E.emit('error', e);
        }
      } finally {
        E.running = false; E.cur = null;
        DB.saveProject(p);
        E.emit('end');
      }
    },
    /* 暂停 / 继续 / 停止 */
    waitIfPaused: async function () {
      while (E.paused && !E.stopped) await ML.sleep(400);
      if (E.stopped) throw new Error('已停止');
    },
    pause: function () { E.paused = true; E.emit('paused'); },
    resume: function () { E.paused = false; E.emit('resumed'); },
    stop: function () {
      E.stopped = true; E.paused = false;
      try { ML.API.abortAll(); } catch (e) {}
      E.emit('stopped');
    },

    /* 单独重写某章 */
    async rewriteChapter(p, no, hooks) {
      var c = DB.getChapter(p, no);
      if (!c || !c.outline) { await E.ensureOutlines(p, no, 1); }
      await E.writeChapter(p, no, hooks);
      if (DB.getSettings().autoReviewFix) {
        try { await E.reviewChapter(p, no, hooks); } catch (e) {}
      }
      await E.memorize(p, no);
      DB.saveProject(p);
    },

    progress: function (p) {
      var done = p.chapters.filter(function (c) { return c.text; }).length;
      var words = p.chapters.reduce(function (a, c) { return a + (c.words || 0); }, 0);
      return {
        done: done, total: p.targetChapters || 45,
        pct: Math.min(100, Math.round(done / (p.targetChapters || 45) * 1000) / 10),
        words: words
      };
    },
    stageIndex: function (p) {
      if (p.premise && p.characters.length && p.world && p.styleGuide && p.volumes.length) return 5;
      if (p.premise && p.characters.length && p.world && p.styleGuide) return 4;
      if (p.premise && p.characters.length && p.world) return 3;
      if (p.premise && p.characters.length) return 2;
      if (p.premise) return 1;
      return 0;
    }
  };

  Object.assign(ML, { Engine: E });
})();
