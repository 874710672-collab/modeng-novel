/* core.js —— 基础工具：DOM、存储、Toast、弹窗、路由 */
(function () {
  'use strict';
  var ML = window.ML = window.ML || {};

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 存储 ---------- */
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { ML.toast('存储空间不足，请导出备份后清理旧项目', true); return false; }
    },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- 时间 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function now() { return Date.now(); }
  function fmtTime(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function fmtDate(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtRel(ts) {
    if (!ts) return '--';
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
    return fmtDate(ts);
  }
  function fmtDur(ms) {
    if (!ms || ms < 0) return '0秒';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + '秒';
    var m = Math.floor(s / 60);
    if (m < 60) return m + '分' + (s % 60) + '秒';
    return Math.floor(m / 60) + '时' + (m % 60) + '分';
  }
  function cnNum(n) {
    var d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n <= 10) return n === 10 ? '十' : d[n];
    if (n < 20) return '十' + d[n % 10];
    if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
    return String(n);
  }
  function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }

  /* ---------- 文本 ---------- */
  function countWords(s) {
    if (!s) return 0;
    // 中文按字计，英文按词计
    var cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = (s.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
    return cn + en;
  }
  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg, isErr, ms) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, ms || (isErr ? 3600 : 2000));
  }

  /* ---------- Modal ---------- */
  function modal(opt) {
    var root = $('#modalRoot');
    var mask = el('div', { class: 'mask' });
    var box = el('div', { class: 'modal ' + (opt.size || '') });
    var mh = el('div', { class: 'mh' }, [el('h3', { text: opt.title || '' })]);
    var x = el('button', { class: 'tb-btn tb-icon', title: '关闭', onclick: close }, '✕');
    mh.appendChild(x);
    var mb = el('div', { class: 'mb' });
    if (typeof opt.body === 'string') mb.innerHTML = opt.body; else if (opt.body) mb.appendChild(opt.body);
    box.appendChild(mh); box.appendChild(mb);
    var mf = null;
    if (opt.buttons && opt.buttons.length) {
      mf = el('div', { class: 'mf' });
      opt.buttons.forEach(function (b) {
        var btn = el('button', { class: 'btn ' + (b.cls || '') }, b.text);
        btn.addEventListener('click', function () {
          Promise.resolve(b.onClick ? b.onClick({ close: close, body: mb }) : null).then(function (r) {
            if (r !== false) close();
          });
        });
        mf.appendChild(btn);
      });
      box.appendChild(mf);
    }
    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask && !opt.sticky) close(); });
    root.appendChild(mask);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    if (opt.autoCloseMs) setTimeout(close, opt.autoCloseMs);
    return { close: close, body: mb, box: box };
  }

  function confirmBox(title, msg, okText) {
    return new Promise(function (res) {
      modal({
        size: 'sm', title: title, body: el('div', { class: 'muted', style: { lineHeight: '1.8', color: 'var(--tx2)' } }, msg),
        buttons: [
          { text: '取消', onClick: function () { res(false); } },
          { text: okText || '确定', cls: 'primary', onClick: function () { res(true); } }
        ]
      });
    });
  }
  function promptBox(title, label, def) {
    return new Promise(function (res) {
      var ta = el('textarea', { class: 'ta', style: { minHeight: '80px' } });
      ta.value = def || '';
      var wrap = el('div', {}, [el('div', { class: 'field' }, [el('label', { text: label || '' }), ta])]);
      modal({
        size: 'md', title: title, body: wrap,
        buttons: [
          { text: '取消', onClick: function () { res(null); } },
          { text: '确定', cls: 'primary', onClick: function () { res(ta.value); } }
        ]
      });
      setTimeout(function () { ta.focus(); }, 50);
    });
  }

  /* ---------- 下载 / 导入 ---------- */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function pickFile(accept) {
    return new Promise(function (res) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept || '.json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return res(null);
        var fr = new FileReader();
        fr.onload = function () { res({ name: f.name, text: String(fr.result) }); };
        fr.readAsText(f, 'utf-8');
      };
      inp.click();
    });
  }

  ML.$ = $; ML.$$ = $$; ML.el = el; ML.esc = esc; ML.LS = LS;
  ML.now = now; ML.fmtTime = fmtTime; ML.fmtDate = fmtDate; ML.fmtRel = fmtRel;
  ML.fmtDur = fmtDur; ML.cnNum = cnNum; ML.pad3 = pad3; ML.pad = pad;
  ML.countWords = countWords; ML.clip = clip; ML.sleep = sleep; ML.uid = uid;
  ML.toast = toast; ML.modal = modal; ML.confirm = confirmBox; ML.prompt = promptBox;
  ML.download = download; ML.pickFile = pickFile;
})();
