/* app.js (1/3) —— 路由、全局状态、首页、设置 */
(function () {
  'use strict';
  var ML = window.ML, $ = ML.$, el = ML.el, DB = ML.DB;
  var App = ML.App = {};
  var view = $('#view'), tbr = $('#tbr');

  App.cur = null;        // 当前项目
  App.route = 'home';
  App.unsub = null;

  /* ---------- 顶栏 ---------- */
  App.topbar = function (items) {
    tbr.innerHTML = '';
    (items || []).forEach(function (b) {
      var n = el('button', { class: 'tb-btn ' + (b.cls || ''), title: b.title || '' }, b.text);
      n.addEventListener('click', b.onClick);
      tbr.appendChild(n);
    });
  };

  /* ---------- 路由 ---------- */
  App.go = function (route, arg) {
    App.route = route;
    if (App.unsub) { App.unsub(); App.unsub = null; }
    view.innerHTML = '';
    var fn = App['page_' + route];
    if (!fn) { view.textContent = '404'; return; }
    fn(arg);
  };
  App.refresh = function () { App.go(App.route, App.arg); };
  App.pageArg = function (a) { App.arg = a; };

  /* ================= 首页 ================= */
  App.page_home = function () {
    App.topbar([
      { text: '＋ 新建长篇', cls: 'primary tb-btn', onClick: function () { App.go('new'); } },
      { text: '⚙︎', cls: 'tb-icon', title: '设置', onClick: function () { App.go('settings'); } }
    ]);
    var list = DB.listProjects();
    var wrap = el('div', { class: 'scroller' });
    var totalWords = list.reduce(function (a, m) { return a + (m.words || 0); }, 0);
    var head = el('div', { class: 'shelf-head' });
    head.appendChild(el('h2', { text: '我的长篇' }));
    head.appendChild(el('div', { class: 'muted', html: list.length + ' 本 · 共 ' + totalWords.toLocaleString() + ' 字' }));
    wrap.appendChild(head);

    if (!list.length) {
      var hero = el('div', { class: 'form-wrap' });
      hero.appendChild(el('div', {
        class: 'card', style: { padding: '38px 26px', textAlign: 'center' },
        html: '<div style="font-size:38px;margin-bottom:10px">墨</div>' +
          '<h2 style="font-size:19px;margin-bottom:8px">交给 AI，全自动写一部长篇</h2>' +
          '<p class="muted" style="line-height:2;margin:0 auto 20px;max-width:440px">' +
          '你只填一份设定，之后程序自己跑完：立意 → 人物 → 世界观 → 文风 → 卷纲 → 章纲 → 正文 → 质检改稿 → 摘要与状态文件。<br>' +
          '断了可以从断点继续，随时暂停，随时插手改。' +
          '</p>'
      }));
      var b = el('button', { class: 'btn primary', style: { margin: '18px auto 0', display: 'flex' } }, '＋ 新建一部长篇');
      b.addEventListener('click', function () { App.go('new'); });
      hero.appendChild(b);
      var ex = el('button', { class: 'btn ghost', style: { margin: '10px auto 0', display: 'flex' } }, '导入已有项目备份');
      ex.addEventListener('click', App.importProject);
      hero.appendChild(ex);
      wrap.appendChild(hero);
      view.appendChild(wrap);
      return;
    }

    var grid = el('div', { class: 'grid' });
    list.forEach(function (m) { grid.appendChild(App.projectCard(m)); });
    var nc = el('button', { class: 'newcard' }, [el('div', { class: 'plus', text: '＋' }), el('div', { text: '新建长篇' })]);
    nc.addEventListener('click', function () { App.go('new'); });
    grid.appendChild(nc);
    wrap.appendChild(grid);
    view.appendChild(wrap);
  };

  App.projectCard = function (m) {
    var p = DB.getProject(m.id);
    var done = p ? p.chapters.filter(function (c) { return c.text; }).length : 0;
    var total = m.targetChapters || 45;
    var pct = Math.min(100, Math.round(done / total * 100));
    var statusTx = { setup: '未开始', writing: '写作中', paused: '已暂停', stopped: '已停止', error: '出错', done: '已完成' }[m.status] || '未开始';
    var c = el('div', { class: 'pcard' });
    c.innerHTML =
      '<div class="pn">' + ML.esc(m.title || '未命名') +
      '<span class="pill ' + (m.status === 'writing' ? 'grn' : m.status === 'done' ? 'gold' : '') + '">' + statusTx + '</span></div>' +
      '<div class="pm"><span>' + ML.esc(m.genre || '未定类型') + '</span><span>' + done + '/' + total + ' 章</span><span>' + (m.words || 0).toLocaleString() + ' 字</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="pf"><span>' + pct + '%</span><span>更新于 ' + ML.fmtRel(m.updatedAt) + '</span></div>';
    c.addEventListener('click', function () {
      App.cur = DB.getProject(m.id);
      App.go('work');
    });
    return c;
  };

  App.importProject = async function () {
    var f = await ML.pickFile('.json');
    if (!f) return;
    try {
      var p = DB.importProject(f.text);
      ML.toast('导入成功：' + p.meta.title);
      App.page_home();
    } catch (e) { ML.toast('导入失败：' + e.message, true); }
  };

  /* ================= 新建项目 ================= */
  App.page_new = function () {
    App.topbar([{ text: '← 返回', onClick: function () { App.go('home'); } }]);
    var s = DB.getSettings();
    var form = {
      title: '', genre: '都市异能', idea: '', protagonist: '', cheat: '', expect: '', avoid: '',
      targetChapters: 45, chapterWords: 2200
    };
    var wrap = el('div', { class: 'scroller' });
    var box = el('div', { class: 'form-wrap' });

    var c1 = el('div', { class: 'card form-card' });
    c1.appendChild(el('h3', {}, [el('span', { class: 'n', text: '1' }), '基本信息']));
    c1.appendChild(App.field('书名（可留空，AI 会起）', 'input', '', function (v) { form.title = v; }, '例：《我家狗是厨神》'));
    var gchips = ['都市异能', '玄幻升级', '历史架空', '科幻末世', '悬疑推理', '西幻', '仙侠', '电竞竞技', '娱乐圈', '无限流'];
    var gWrap = el('div', { class: 'chips' });
    gchips.forEach(function (g) {
      var b = el('button', { class: 'chip' + (g === form.genre ? ' on' : ''), text: g });
      b.addEventListener('click', function () {
        form.genre = g;
        ML.$$('.chip', gWrap).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
      gWrap.appendChild(b);
    });
    c1.appendChild(el('div', { class: 'field' }, [el('label', { text: '类型' }), gWrap]));
    c1.appendChild(App.field('一句话点子（越具体越好）', 'textarea', '', function (v) { form.idea = v; },
      '例：夜市烤鸡腿的摊主捡到一只会说人话的哈士奇，狗身上带着厨神系统，把做菜技能转给他，代价是替他完成系统任务。'));
    box.appendChild(c1);

    var c2 = el('div', { class: 'card form-card' });
    c2.appendChild(el('h3', {}, [el('span', { class: 'n', text: '2' }), '主角与金手指']));
    c2.appendChild(App.field('主角（身份、性格、想要什么）', 'textarea', '', function (v) { form.protagonist = v; },
      '例：段谦，28 岁，夜市摊主，嘴硬心软，欠亲戚 12 万，最大的愿望是有个自己的店面。'));
    c2.appendChild(App.field('金手指 / 核心设定（规则与代价）', 'textarea', '', function (v) { form.cheat = v; },
      '例：狗是系统宿主，能把技能「借」给主角，每用一次扣除狗的体力，狗累了主角就断供。'));
    box.appendChild(c2);

    var c3 = el('div', { class: 'card form-card' });
    c3.appendChild(el('h3', {}, [el('span', { class: 'n', text: '3' }), '读者期待与禁区']));
    c3.appendChild(App.field('读者想看什么（爽点清单）', 'textarea', '', function (v) { form.expect = v; },
      '例：打脸看不起他的亲戚；靠手艺逆袭开店；狗与主角互相算计又彼此救场；每章末有钩子。'));
    c3.appendChild(App.field('绝对不要出现的东西', 'textarea', '', function (v) { form.avoid = v; },
      '例：不要无敌流、不要后宫、不要一章解决一个大反派、不要写系统面板说明书。'));
    box.appendChild(c3);

    var c4 = el('div', { class: 'card form-card' });
    c4.appendChild(el('h3', {}, [el('span', { class: 'n', text: '4' }), '规模']));
    var two = el('div', { class: 'two' });
    two.appendChild(App.field('总章数', 'input', '45', function (v) { form.targetChapters = Math.max(3, parseInt(v) || 45); }, '', 'number'));
    two.appendChild(App.field('单章字数', 'input', '2200', function (v) { form.chapterWords = Math.max(800, parseInt(v) || 2200); }, '', 'number'));
    c4.appendChild(two);
    var seed = el('div', { class: 'seed-tip' }, '45 章 × 2200 字 ≈ 10 万字。要 30-50 万字建议 150-220 章（全自动跑需要较长时间，可随时暂停）。');
    c4.appendChild(seed);
    box.appendChild(c4);

    var bottom = el('div', { class: 'bottom-bar' });
    var est = el('div', { class: 'muted grow', text: '' });
    var upd = function () {
      est.textContent = '预计 ' + form.targetChapters + ' 章 · 约 ' + Math.round(form.targetChapters * form.chapterWords / 10000 * 10) / 10 + ' 万字';
    };
    upd();
    var start = el('button', { class: 'btn primary' }, '创建并全自动开写 ▶');
    start.addEventListener('click', function () {
      if (!s.apiKey) { ML.toast('请先去设置里填写 API Key', true); App.go('settings'); return; }
      if (!form.idea && !form.title) { ML.toast('至少写一句话点子', true); return; }
      var p = DB.newProject({
        title: form.title || '未命名长篇', genre: form.genre, targetChapters: form.targetChapters,
        chapterWords: form.chapterWords, status: 'writing'
      }, {
        idea: form.idea, protagonist: form.protagonist, cheat: form.cheat,
        expect: form.expect, avoid: form.avoid, genre: form.genre
      });
      App.cur = p;
      App.go('work');
      ML.sleep(60).then(function () { App.startRun(p); });
    });
    bottom.appendChild(est);
    bottom.appendChild(start);
    wrap.appendChild(box);
    view.appendChild(wrap);
    view.appendChild(bottom);
  };

  /* 通用字段 */
  App.field = function (label, type, def, onInput, ph, inputmode) {
    var f = el('div', { class: 'field' });
    f.appendChild(el('label', { text: label }));
    var n = el(type === 'input' ? 'input' : 'textarea', { class: type === 'input' ? 'inp' : 'ta', placeholder: ph || '' });
    if (inputmode) n.type = 'number';
    n.value = def || '';
    n.addEventListener('input', function () { onInput(n.value); });
    f.appendChild(n);
    return f;
  };
})();
/* app.js (2/3) —— 工作台：运行面板、正文阅读、目录、设定、设置 */
(function () {
  'use strict';
  var ML = window.ML, $ = ML.$, el = ML.el, DB = ML.DB, E = ML.Engine;
  var App = ML.App;

  App.unsubWork = null;

  /* ================= 工作台 ================= */
  App.page_work = function (tab) {
    var p = App.cur;
    if (!p) { App.go('home'); return; }
    App.wnav = tab || App.wnav || 'read';
    App.topbar([
      { text: '←', cls: 'tb-icon', title: '返回书架', onClick: function () { App.cur = null; App.go('home'); } },
      { text: '导出 ▾', onClick: function () { App.exportMenu(p); } },
      { text: '⚙︎', cls: 'tb-icon', title: '项目设置', onClick: function () { App.projectSettings(p); } }
    ]);

    var ws = el('div', { class: 'ws' });
    /* 子导航 */
    var sub = el('div', { class: 'ws-sub' });
    var tabs = [
      ['read', '正文'], ['outline', '大纲与设定'], ['toc', '目录'], ['prompts', '提示词'], ['log', '日志']
    ];
    tabs.forEach(function (t) {
      var running = E.running && t[0] === 'read';
      var b = el('button', { class: 'tab' + (App.wnav === t[0] ? ' on' : '') + (running ? ' run' : '') }, [
        running ? el('span', { class: 'dot' }) : null, t[1]
      ]);
      b.addEventListener('click', function () { App.wnav = t[0]; App.redrawWork(); });
      sub.appendChild(b);
    });
    var titlePill = el('div', { class: 'pill gold', style: { marginLeft: 'auto' }, text: '《' + ML.clip(p.meta.title, 12) + '》' });
    sub.appendChild(titlePill);
    ws.appendChild(sub);

    /* 主体 */
    var body = el('div', { class: 'ws-body' });
    var paneL = el('div', { class: 'paneL', id: 'paneL' });
    var paneR = el('div', { class: 'paneR', id: 'paneR' });
    body.appendChild(paneL);
    body.appendChild(paneR);
    ws.appendChild(body);

    /* 心跳条 */
    var hb = el('div', { class: 'heartbeat', id: 'hbeat' });
    ws.appendChild(hb);
    view.appendChild(ws);

    App.paneL = paneL; App.paneR = paneR;
    App.renderLeft();
    App.renderRight();
    App.bindEngine();
  };

  App.redrawWork = function () {
    if (App.route !== 'work') return;
    App.go('work', App.wnav);
  };

  /* ---------- 左：运行面板 ---------- */
  App.renderLeft = function () {
    var p = App.cur, pane = App.paneL;
    if (!pane) return;
    pane.innerHTML = '';
    var head = el('div', { class: 'lhead' });
    var st = E.running ? (E.paused ? 'paused' : 'running') : (p.meta.status || 'idle');
    var stTx = { running: '写作中', paused: '已暂停', error: '出错', done: '已完成', stopped: '已停止', writing: '待继续', idle: '待开始' }[st] || '待开始';
    var row = el('div', { class: 'runstate ' + (st === 'writing' || st === 'idle' ? 'idle' : st) });
    row.appendChild(el('span', { class: 'led' }));
    row.appendChild(el('b', { text: stTx }));
    if (E.cur) row.appendChild(el('span', { class: 'sub', text: '第 ' + E.cur.no + ' 章' }));
    head.appendChild(row);

    var pr = E.progress(p);
    head.appendChild(el('div', { class: 'prog' }, [el('i', { style: { width: pr.pct + '%' } })]));
    head.appendChild(el('div', { class: 'prog-tx' }, [
      el('span', { text: pr.done + ' / ' + pr.total + ' 章 · ' + pr.pct + '%' }),
      el('span', { text: (pr.words || 0).toLocaleString() + ' 字' })
    ]));
    pane.appendChild(head);

    var sc = el('div', { class: 'lscroll' });

    /* 阶段队列 */
    var q = el('div', { class: 'stagequeue' });
    var si = E.stageIndex(p);
    E.STAGES.forEach(function (s, i) {
      var cls = 'sq' + (i < si || (s.k === 'chapters' && pr.done > 0) ? ' done' : '') + (E.running && (E.cur ? s.k === 'chapters' : si === i) ? ' cur' : '');
      q.appendChild(el('div', { class: cls }, [
        el('span', { class: 'n', text: (i < si || pr.done > 0) ? '✓' : String(i + 1) }),
        el('span', { class: 'grow', text: s.n }),
        i === 5 ? el('span', { class: 'muted', text: pr.done + '/' + pr.total }) : null
      ]));
    });
    sc.appendChild(q);

    /* 控制按钮 */
    var ctrl = el('div', { class: 'ctrl-grid' });
    if (!E.running) {
      var canResume = p.chapters.some(function (c) { return !c.text; }) || p.meta.status === 'paused' || p.meta.status === 'stopped' || p.meta.status === 'error' || p.meta.status === 'writing';
      var b1 = el('button', { class: 'btn primary' }, p.meta.status === 'done' ? '✓ 续写新章' : p.chapters.length ? '▶ 继续写' : '▶ 开始');
      b1.addEventListener('click', function () {
        if (p.meta.status === 'done') {
          ML.toast('已写到目标章数。用右边「＋ 续写 10 章」或在项目设置里调高总章数');
          return;
        }
        App.startRun(p, { resume: true });
      });
      ctrl.appendChild(b1);
      var b2 = el('button', { class: 'btn' }, '＋ 续写 10 章');
      b2.addEventListener('click', function () { p.targetChapters += 10; p.meta.targetChapters = p.targetChapters; DB.saveProject(p); App.startRun(p, { resume: true }); });
      ctrl.appendChild(b2);
    } else if (E.paused) {
      var r1 = el('button', { class: 'btn primary' }, '▶ 继续');
      r1.addEventListener('click', function () { E.resume(); App.renderLeft(); });
      ctrl.appendChild(r1);
      var r2 = el('button', { class: 'btn danger' }, '■ 停止');
      r2.addEventListener('click', function () { E.stop(); });
      ctrl.appendChild(r2);
    } else {
      var p1 = el('button', { class: 'btn' }, '⏸ 暂停');
      p1.addEventListener('click', function () { E.pause(); App.renderLeft(); });
      ctrl.appendChild(p1);
      var p2 = el('button', { class: 'btn danger' }, '■ 停止');
      p2.addEventListener('click', function () { E.stop(); });
      ctrl.appendChild(p2);
    }
    sc.appendChild(ctrl);

    /* 统计 */
    var st2 = el('div', { style: { marginTop: '14px' } });
    var totalW = (p.stats.written || 0);
    st2.innerHTML = '<div class="kv">' +
      '<span class="k">已写</span><span>' + pr.done + ' 章</span>' +
      '<span class="k">字数</span><span>' + pr.words.toLocaleString() + '</span>' +
      '<span class="k">接口调用</span><span>' + (p.stats.calls || 0) + ' 次</span>' +
      '<span class="k">单章均时</span><span>' + App.avgTime(p) + '</span>' +
      '</div>';
    sc.appendChild(st2);

    if (p.lastError) {
      sc.appendChild(el('div', { class: 'seed-tip', style: { borderColor: 'rgba(229,101,95,.3)', background: 'rgba(229,101,95,.07)', color: '#e08a86', marginTop: '10px' } },
        '上次出错：' + ML.clip(p.lastError.msg, 120)));
    }

    /* 运行日志 */
    var lg = el('div', { class: 'logbox' });
    lg.appendChild(el('h4', { text: '运行日志' }));
    var logs = p.logs.slice(-40);
    if (!logs.length) lg.appendChild(el('div', { class: 'muted', text: '还没有运行记录' }));
    logs.forEach(function (l) {
      lg.appendChild(el('div', { class: 'logline ' + l.kind }, [
        el('span', { class: 't', text: ML.fmtTime(l.t) + ' ' }),
        l.text
      ]));
    });
    sc.appendChild(lg);
    pane.appendChild(sc);
    E._logBox = sc;
    App.renderHB();
  };

  App.avgTime = function (p) {
    var arr = p.chapters.filter(function (c) { return c.ms; });
    if (!arr.length) return '--';
    var avg = arr.reduce(function (a, c) { return a + c.ms; }, 0) / arr.length;
    return ML.fmtDur(avg);
  };

  App.renderHB = function () {
    var hb = $('#hbeat');
    if (!hb) return;
    var p = App.cur, pr = E.progress(p);
    var total = (p.targetChapters || 45) * (p.meta.chapterWords || 2200);
    var eta = '';
    var arr = p.chapters.filter(function (c) { return c.ms; });
    if (arr.length && pr.done < pr.total) {
      var avg = arr.reduce(function (a, c) { return a + c.ms; }, 0) / arr.length;
      var remain = (pr.total - pr.done) * avg * 1.6;  // 含质检/摘要
      eta = '预计还需 ' + ML.fmtDur(remain);
    }
    hb.className = 'heartbeat' + (E.running && !E.paused ? ' on' : '');
    hb.innerHTML = '';
    hb.appendChild(el('span', { class: 'hb' }, [el('span', { class: 'live' }), E.running ? (E.paused ? '已暂停' : '自动运行中') : '空闲']));
    hb.appendChild(el('span', { class: 'sep', text: '|' }));
    hb.appendChild(el('span', { text: '总进度 ' + pr.pct + '% · ' + (pr.words / 10000).toFixed(1) + '/' + (total / 10000).toFixed(0) + ' 万字' }));
    if (eta) { hb.appendChild(el('span', { class: 'sep', text: '|' })); hb.appendChild(el('span', { text: eta })); }
    if (E.running && E._phase) { hb.appendChild(el('span', { class: 'sep', text: '|' })); hb.appendChild(el('span', { text: E._phase })); }
  };

  /* ---------- 引擎事件 ---------- */
  App.bindEngine = function () {
    if (App.unsubWork) App.unsubWork();
    App.unsubWork = E.on(function (type, data) {
      if (type === 'log') {
        var sc = E._logBox;
        if (sc) {
          var lg = sc.querySelector('.logbox');
          if (lg) {
            lg.appendChild(el('div', { class: 'logline ' + (data.kind || '') }, [
              el('span', { class: 't', text: ML.fmtTime(data.t) + ' ' }), data.text
            ]));
            while (lg.children.length > 45) lg.removeChild(lg.children[1]);
          }
          sc.scrollTop = sc.scrollHeight;
        }
        if (data.text.indexOf('■') === 0 || data.text.indexOf('✕') === 0 || data.text.indexOf('⏸') === 0) {
          setTimeout(function () { if (App.route === 'work') App.redrawWork(); }, 120);
        }
      } else if (type === 'chapter') {
        E._phase = { outline: '写章纲', write: '写正文', review: '质检改稿', memory: '记忆归档' }[data.phase] + ' 第' + data.no + '章';
        var cur = $('#paneL .runstate .sub');
        if (cur) cur.textContent = '第 ' + data.no + ' 章';
        if (data.phase === 'write' && App.wnav === 'read') App.openChapterLive(data.no);
        App.renderHB();
      } else if (type === 'delta') {
        App.liveDelta(data);
      } else if (type === 'chapterDone') {
        if (App.wnav === 'read' && App.viewChapterNo === data.no) App.renderRight();
        if (App.wnav === 'toc') App.renderRight();
      } else if (type === 'stage' || type === 'start' || type === 'end' || type === 'paused' || type === 'resumed' || type === 'stopped') {
        if (App.route === 'work') { App.renderLeft(); }
      } else if (type === 'error') {
        ML.toast('自动写作出错：' + data.message, true, 5000);
      }
    });
  };

  /* ---------- 启动 / 继续 ---------- */
  App.startRun = function (p, opt) {
    App.cur = p;
    opt = opt || {};
    if (opt.resume) {
      // 找第一个还没写完的章
      var firstMissing = 1;
      for (var i = 0; i < p.chapters.length; i++) {
        if (!p.chapters[i].text) { firstMissing = p.chapters[i].no; break; }
      }
    }
    App.wnav = App.wnav || 'read';
    if (App.route !== 'work') App.go('work');
    App.renderLeft();
    E.start(p, { hooks: { onChapterText: function (c) { if (App.viewChapterNo === c.no) App.renderRight(); } } })
      .then(function () { if (App.route === 'work') App.renderLeft(); });
  };

  App.openChapterLive = function (no) {
    App.viewChapterNo = no;
    App.renderRight();
  };

  App.liveDelta = function (data) {
    if (App.viewChapterNo !== data.no) return;
    var n = $('#liveProse');
    if (!n) return;
    var paras = data.text.split(/\n+/).filter(function (s) { return s.trim(); });
    n.innerHTML = '';
    paras.forEach(function (s) { n.appendChild(el('p', { text: s.trim() })); });
    var r = n.closest('.reader');
    if (r) r.scrollTop = r.scrollHeight;
  };
})();
/* app.js (3/3) —— 右栏：正文 / 大纲设定 / 目录 / 提示词 / 日志，以及弹窗 */
(function () {
  'use strict';
  var ML = window.ML, $ = ML.$, el = ML.el, DB = ML.DB, E = ML.Engine;
  var App = ML.App;

  /* ================= 右栏分发 ================= */
  App.renderRight = function () {
    var pane = App.paneR;
    if (!pane) return;
    pane.innerHTML = '';
    var t = App.wnav;
    if (t === 'read') App.rvRead(pane);
    else if (t === 'outline') App.rvOutline(pane);
    else if (t === 'toc') App.rvToc(pane);
    else if (t === 'prompts') App.rvPrompts(pane);
    else if (t === 'log') App.rvLog(pane);
  };

  /* ================= 正文视图 ================= */
  App.rvRead = function (pane) {
    var p = App.cur;
    var no = App.viewChapterNo || 0;
    var c = no ? DB.getChapter(p, no) : null;
    if (!c) {
      // 默认展示最新一章
      var done = p.chapters.filter(function (x) { return x.text; });
      if (done.length) { c = done[done.length - 1]; no = c.no; App.viewChapterNo = no; }
      else { c = p.chapters[0]; no = c ? c.no : 1; App.viewChapterNo = no; }
    }
    if (!c) {
      pane.appendChild(el('div', { class: 'empty', html: '<span class="big">✒︎</span>还没有章节<br>点左边「▶ 开始」交给 AI 全自动开写' }));
      return;
    }
    var head = el('div', { class: 'chaphead' });
    var ttl = el('div', { class: 'ct' }, [
      el('h2', { text: '第' + no + '章 ' + (c.title || '') }),
      c.status === 'writing' ? el('span', { class: 'pill grn', text: '写作中' }) : null,
      c.status === 'done' ? el('span', { class: 'pill grn', text: '完成' }) : null,
      c.status === 'fixed' ? el('span', { class: 'pill gold', text: '已改稿' }) : null,
      c.reviewPass === false ? el('span', { class: 'pill red', text: '质检有问题' }) : null
    ]);
    head.appendChild(ttl);
    var meta = el('div', { class: 'meta' });
    meta.appendChild(el('span', { text: (c.words || 0) + ' 字' }));
    if (c.ms) meta.appendChild(el('span', { text: '用时 ' + ML.fmtDur(c.ms) }));
    if (c.summary) meta.appendChild(el('span', { text: '摘要已生成' }));
    if (c.title) meta.appendChild(el('span', { text: '更新 ' + ML.fmtRel(c.updatedAt) }));
    head.appendChild(meta);

    var tools = el('div', { class: 'tools' });
    var bEdit = el('button', { class: 'btn xs', text: '✎ 编辑' });
    bEdit.addEventListener('click', function () { App.editChapter(p, no); });
    var bRe = el('button', { class: 'btn xs', text: '↻ 重写本章' });
    bRe.addEventListener('click', async function () {
      if (E.running) { ML.toast('正在自动运行时不能单独重写', true); return; }
      var ok = await ML.confirm('重写第' + no + '章', '会覆盖当前正文，并按新内容更新摘要与状态文件。继续？', '重写');
      if (!ok) return;
      App.renderRight();
      ML.toast('开始重写第' + no + '章…');
      await E.rewriteChapter(p, no, { onChapterText: function () { App.renderRight(); } });
      App.renderRight(); App.renderLeft();
      ML.toast('第' + no + '章 重写完成');
    });
    var bCp = el('button', { class: 'btn xs', text: '复制' });
    bCp.addEventListener('click', function () {
      navigator.clipboard.writeText(c.text || '').then(function () { ML.toast('已复制'); });
    });
    var bRev = el('button', { class: 'btn xs', text: '质检' });
    bRev.addEventListener('click', function () { App.showReview(c); });
    tools.appendChild(bEdit); tools.appendChild(bRe); tools.appendChild(bRev); tools.appendChild(bCp);
    head.appendChild(tools);
    pane.appendChild(head);

    var rd = el('div', { class: 'reader' });
    var inner = el('div', { class: 'inner' });
    var text = c.text || '';
    if (text) {
      text.split(/\n+/).forEach(function (s) { if (s.trim()) inner.appendChild(el('p', { text: s.trim() })); });
      inner.id = 'liveProse';
      rd.appendChild(inner);
    } else if (c.status === 'writing' || (E.running && E.cur && E.cur.no === no)) {
      inner.id = 'liveProse';
      rd.appendChild(inner);
      inner.appendChild(el('p', { class: 'muted', html: '<span class="spin"></span> AI 正在写这一章…' }));
    } else {
      rd.appendChild(el('div', { class: 'empty', html: '这一章还没有正文<br><span class="muted">本章章纲：</span><div class="muted" style="text-align:left;margin-top:14px;white-space:pre-wrap">' + ML.esc(c.outline || '（还没生成）') + '</div>' }));
    }
    pane.appendChild(rd);
    App._readerEl = rd;
  };

  /* ================= 大纲与设定 ================= */
  App.rvOutline = function (pane) {
    var p = App.cur;
    var flow = el('div', { class: 'flow' });
    var inner = el('div', { class: 'inner' });
    function blk(title, key, val, rows) {
      var b = el('div', { class: 'blk' });
      var h = el('h4', {}, [title]);
      var edit = el('button', { class: 'btn xs', style: { marginLeft: 'auto' }, text: '编辑' });
      edit.addEventListener('click', async function () {
        var nv = await ML.prompt('编辑：' + title, '支持 {{占位符}} 的提示词请去「提示词」页改', val || '');
        if (nv == null) return;
        if (key === 'premise') p.premise = nv;
        else if (key === 'world') p.world = nv;
        else if (key === 'styleGuide') p.styleGuide = nv;
        else if (key === 'stateFile') p.stateFile = nv;
        else if (key === 'summary') p.summary = nv;
        DB.saveProject(p); App.renderRight();
      });
      h.appendChild(edit);
      b.appendChild(h);
      b.appendChild(el('div', { class: 'bd', text: val || '（暂无）' }));
      return b;
    }
    inner.appendChild(blk('立意', 'premise', p.premise));
    if (p.characters.length) {
      var cb = el('div', { class: 'blk' });
      cb.appendChild(el('h4', {}, ['人物（' + p.characters.length + '）']));
      p.characters.forEach(function (c) {
        cb.appendChild(el('div', { class: 'bd', style: { marginBottom: '8px' } }, [
          el('b', { text: c.name }), el('span', { class: 'muted', text: ' ' + (c.role || '') }),
          el('div', { text: c.desc })
        ]));
      });
      inner.appendChild(cb);
    }
    inner.appendChild(blk('世界观', 'world', p.world));
    inner.appendChild(blk('文风基线', 'styleGuide', p.styleGuide));
    if (p.volumes.length) {
      var vb = el('div', { class: 'blk' });
      vb.appendChild(el('h4', {}, ['卷纲（' + p.volumes.length + ' 卷）']));
      p.volumes.forEach(function (v) {
        vb.appendChild(el('div', { class: 'bd', style: { marginBottom: '8px' } }, [
          el('b', { text: '第' + v.no + '卷 ' + v.title }),
          el('span', { class: 'muted', text: '  第' + v.fromCh + '-' + v.toCh + '章' }),
          el('div', { text: ML.clip(v.summary, 260) })
        ]));
      });
      inner.appendChild(vb);
    }
    inner.appendChild(blk('当前状态文件', 'stateFile', p.stateFile));
    inner.appendChild(blk('全书梗概', 'summary', p.summary));
    flow.appendChild(inner);
    pane.appendChild(flow);
  };

  /* ================= 目录 ================= */
  App.rvToc = function (pane) {
    var p = App.cur;
    var flow = el('div', { class: 'flow' });
    var inner = el('div', { class: 'inner' });
    var maxNo = Math.max(p.targetChapters || 45, p.chapters.length ? p.chapters[p.chapters.length - 1].no : 1);
    var toc = el('div', { class: 'toc' });
    for (var n = 1; n <= maxNo; n++) {
      if (n > (p.targetChapters || 45) && !DB.getChapter(p, n)) break;
      var c = DB.getChapter(p, n);
      var item = el('div', { class: 'ch' + (App.viewChapterNo === n ? ' on' : '') }, [
        el('span', { class: 'no', text: String(n) }),
        el('span', { class: 'nm', text: c && c.title ? c.title : (c && c.outline ? '（有纲无文）' : '未生成') }),
        el('span', { class: 'st ' + (c && c.text ? 'done' : c && c.outline ? 'draft' : c && c.status === 'writing' ? 'draft' : '') + (c && c.reviewPass === false ? ' bad' : ''),
          text: c && c.text ? (c.words + ' 字') : c && c.outline ? '有纲' : '' })
      ]);
      (function (no) {
        item.addEventListener('click', function () { App.viewChapterNo = no; App.wnav = 'read'; App.redrawWork(); });
      })(n);
      toc.appendChild(item);
    }
    inner.appendChild(toc);
    flow.appendChild(inner);
    pane.appendChild(flow);
  };

  /* ================= 提示词 ================= */
  App.rvPrompts = function (pane) {
    var p = App.cur;
    var flow = el('div', { class: 'flow' });
    var inner = el('div', { class: 'inner' });
    inner.appendChild(el('div', { class: 'muted', style: { marginBottom: '14px', lineHeight: '1.8' } },
      '改这里的提示词只影响本项目。占位符如 {{title}} {{premise}} {{characters}} {{state}} {{outline}} {{text}} 会由程序自动填充，删除会导致上下文丢失。'));
    Object.keys(ML.Prompts.DEFAULTS).forEach(function (k) {
      var item = ML.Prompts.get(k, p);
      var row = el('div', { class: 'blk', style: { display: 'flex', alignItems: 'center', gap: '10px' } });
      row.appendChild(el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '14px' } }, [item.name, item.isCustom ? el('span', { class: 'pill gold', style: { marginLeft: '8px' }, text: '已修改' }) : null]),
        el('div', { class: 'muted', text: item.desc || '' })
      ]));
      var e = el('button', { class: 'btn xs', text: '编辑' });
      e.addEventListener('click', function () { App.editPrompt(p, k); });
      row.appendChild(e);
      if (item.isCustom) {
        var r = el('button', { class: 'btn xs ghost', text: '恢复' });
        r.addEventListener('click', function () {
          delete p.promptOverrides[k]; DB.saveProject(p); App.renderRight(); ML.toast('已恢复默认');
        });
        row.appendChild(r);
      }
      inner.appendChild(row);
    });
    flow.appendChild(inner);
    pane.appendChild(flow);
  };

  App.editPrompt = function (p, key) {
    var cur = ML.Prompts.get(key, p);
    var sysTa = el('textarea', { class: 'ta', style: { minHeight: '90px' } });
    sysTa.value = cur.system;
    var userTa = el('textarea', { class: 'ta', style: { minHeight: '260px' } });
    userTa.value = cur.user;
    var body = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'System 提示词' }), sysTa]),
      el('div', { class: 'field' }, [el('label', { text: 'User 提示词（含占位符）' }), userTa])
    ]);
    ML.modal({
      title: cur.name, body: body,
      buttons: [
        { text: '取消' },
        { text: '恢复默认', onClick: function () { delete p.promptOverrides[key]; DB.saveProject(p); App.renderRight(); } },
        {
          text: '保存', cls: 'primary', onClick: function () {
            p.promptOverrides = p.promptOverrides || {};
            p.promptOverrides[key] = { system: sysTa.value, user: userTa.value };
            DB.saveProject(p); App.renderRight(); ML.toast('已保存');
          }
        }
      ]
    });
  };

  /* ================= 日志 ================= */
  App.rvLog = function (pane) {
    var p = App.cur;
    var flow = el('div', { class: 'flow' });
    var inner = el('div', { class: 'inner' });
    if (!p.logs.length) { inner.appendChild(el('div', { class: 'empty', text: '暂无日志' })); }
    p.logs.slice().reverse().forEach(function (l) {
      inner.appendChild(el('div', { class: 'logline ' + l.kind }, [
        el('span', { class: 't', text: ML.fmtTime(l.t) + ' ' }), l.text
      ]));
    });
    flow.appendChild(inner);
    pane.appendChild(flow);
  };
})();
/* app.js (4/5) —— 弹窗：章节目录编辑、导出、项目设置、设置页 */
(function () {
  'use strict';
  var ML = window.ML, $ = ML.$, el = ML.el, DB = ML.DB, E = ML.Engine;
  var App = ML.App;

  /* ---------- 编辑章节 ---------- */
  App.editChapter = function (p, no) {
    var c = DB.getChapter(p, no);
    if (!c) return;
    var titleIn = el('input', { class: 'inp', value: c.title || '' });
    var ta = el('textarea', { class: 'ta', style: { minHeight: '46vh', lineHeight: '1.9' } });
    ta.value = c.text || '';
    var body = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '章节标题' }), titleIn]),
      el('div', { class: 'field' }, [el('label', { text: '正文（空行分段）' }), ta])
    ]);
    ML.modal({
      title: '第' + no + '章 · 手动编辑', body: body,
      buttons: [
        { text: '取消' },
        {
          text: '保存', cls: 'primary', onClick: function () {
            c.title = titleIn.value.trim();
            c.text = ta.value.replace(/\r/g, '');
            c.words = ML.countWords(c.text);
            if (c.status !== 'done') c.status = c.text ? 'done' : c.status;
            c.manual = true; c.updatedAt = ML.now();
            p.stats.written = p.chapters.reduce(function (a, x) { return a + (x.words || 0); }, 0);
            DB.saveProject(p);
            App.renderRight(); App.renderLeft();
            ML.toast('已保存（第' + no + '章 ' + c.words + ' 字）');
          }
        }
      ]
    });
  };

  App.showReview = function (c) {
    if (!c.review) {
      ML.modal({ size: 'md', title: '质检报告', body: el('div', { class: 'muted', text: '这一章还没有质检记录。质检会在自动写作时进行，也可以打开项目设置里的「自动质检改稿」。' }), buttons: [{ text: '知道了', cls: 'primary' }] });
      return;
    }
    ML.modal({
      size: 'md', title: '质检报告 · 第' + c.no + '章',
      body: el('div', { class: 'bd', text: c.review }),
      buttons: [{ text: '关闭', cls: 'primary' }]
    });
  };

  /* ---------- 导出 ---------- */
  App.exportMenu = function (p) {
    var body = el('div', {});
    var items = [
      ['导出全本 Markdown（含设定）', function () {
        ML.download(safeName(p.meta.title) + '.md', DB.exportMarkdown(p, { withBible: true }), 'text/markdown;charset=utf-8');
      }],
      ['导出全本纯文本', function () {
        var t = DB.exportMarkdown(p, { withBible: false }).replace(/^#+\s*/gm, '').replace(/\n---\n/g, '\n');
        ML.download(safeName(p.meta.title) + '.txt', t);
      }],
      ['导出状态文件与梗概', function () {
        var t = '【状态文件】\n' + (p.stateFile || '') + '\n\n【全书梗概】\n' + (p.summary || '');
        ML.download(safeName(p.meta.title) + '_状态.md', t, 'text/markdown;charset=utf-8');
      }],
      ['导出项目备份（.json，可再导入）', function () {
        ML.download('backup_' + safeName(p.meta.title) + '.json', DB.exportProject(p), 'application/json');
      }]
    ];
    items.forEach(function (it) {
      var b = el('div', { class: 'it', style: { display: 'flex', gap: '10px', padding: '14px 8px', borderBottom: '1px solid var(--line)', cursor: 'pointer' } }, it[0]);
      b.addEventListener('click', function () { m.close(); it[1](); });
      body.appendChild(b);
    });
    var m = ML.modal({ size: 'sm', title: '导出', body: body });
  };
  function safeName(s) { return String(s || 'novel').replace(/[\\/:*?"<>|\s]+/g, '_'); }
  App.safeName = safeName;

  /* ---------- 项目设置 ---------- */
  App.projectSettings = function (p) {
    var titleIn = el('input', { class: 'inp', value: p.meta.title });
    var genreIn = el('input', { class: 'inp', value: p.meta.genre || '' });
    var chapIn = el('input', { class: 'inp', type: 'number', value: p.meta.chapterWords });
    var totIn = el('input', { class: 'inp', type: 'number', value: p.targetChapters });
    var idea = el('textarea', { class: 'ta', style: { minHeight: '70px' } }); idea.value = p.setup.idea || '';
    var avoid = el('textarea', { class: 'ta', style: { minHeight: '60px' } }); avoid.value = p.setup.avoid || '';
    var extra = el('textarea', { class: 'ta', style: { minHeight: '70px' } }); extra.value = p.premiseExtra || '';
    var body = el('div', {}, [
      el('div', { class: 'two' }, [
        el('div', { class: 'field' }, [el('label', { text: '书名' }), titleIn]),
        el('div', { class: 'field' }, [el('label', { text: '类型' }), genreIn])
      ]),
      el('div', { class: 'two' }, [
        el('div', { class: 'field' }, [el('label', { text: '单章字数' }), chapIn]),
        el('div', { class: 'field' }, [el('label', { text: '总章数' }), totIn])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '一句话点子' }), idea]),
      el('div', { class: 'field' }, [el('label', { text: '追加要求（会拼到立意后面，影响后续章纲）' }), extra]),
      el('div', { class: 'field' }, [el('label', { text: '禁止元素' }), avoid]),
      el('div', { class: 'divider' }),
      el('div', { class: 'muted', style: { lineHeight: '2' } },
        '· 修改「追加要求」后，新写的章节会立刻采用，已写的不会自动重写。<br>' +
        '· 增加总章数后点「继续写」即可接着写。')
    ]);
    ML.modal({
      title: '项目设置', body: body,
      buttons: [
        {
          text: '删除项目', cls: 'danger', onClick: async function () {
            var ok = await ML.confirm('删除《' + p.meta.title + '》', '会永久删除本项目的全部设定、正文与日志，无法恢复。建议先导出备份。', '永久删除');
            if (!ok) return false;
            DB.deleteProject(p.meta.id);
            App.cur = null;
            ML.toast('已删除');
            App.go('home');
          }
        },
        {
          text: '保存', cls: 'primary', onClick: function () {
            p.meta.title = titleIn.value.trim() || p.meta.title;
            p.meta.genre = genreIn.value.trim();
            p.meta.chapterWords = Math.max(600, parseInt(chapIn.value) || 2200);
            p.targetChapters = Math.max(1, parseInt(totIn.value) || 45);
            p.meta.targetChapters = p.targetChapters;
            p.setup.idea = idea.value;
            p.setup.avoid = avoid.value;
            p.premiseExtra = extra.value;
            DB.saveProject(p);
            App.redrawWork();
            ML.toast('已保存');
          }
        }
      ]
    });
  };

  /* ---------- 设置页 ---------- */
  App.page_settings = function () {
    App.topbar([{ text: '← 返回', onClick: function () { App.go('home'); } }]);
    var s = DB.getSettings();
    var wrap = el('div', { class: 'scroller' });
    var box = el('div', { class: 'form-wrap' });

    var c1 = el('div', { class: 'card form-card' });
    c1.appendChild(el('h3', {}, ['接口（OpenAI 兼容）']));
    c1.appendChild(App.field('Base URL', 'input', s.baseURL, function (v) { s.baseURL = v; }, 'https://api.openai.com/v1'));
    var keyF = el('div', { class: 'field' });
    keyF.appendChild(el('label', { text: 'API Key（只存在本机）' }));
    var keyIn = el('input', { class: 'inp', type: 'password', placeholder: 'sk-...' });
    keyIn.value = s.apiKey || '';
    keyIn.addEventListener('input', function () { s.apiKey = keyIn.value.trim(); });
    keyF.appendChild(keyIn);
    c1.appendChild(keyF);
    var two = el('div', { class: 'two' });
    two.appendChild(App.field('模型', 'input', s.model, function (v) { s.model = v; }, 'gpt-4o-mini / deepseek-chat'));
    two.appendChild(App.field('温度（0-1.5，长篇建议 0.85-1.0）', 'input', String(s.temperature), function (v) { s.temperature = parseFloat(v) || 0.9; }, '', 'number'));
    c1.appendChild(two);
    var row = el('div', { class: 'row' });
    var testB = el('button', { class: 'btn sm' }, '测试连接');
    testB.addEventListener('click', async function () {
      testB.innerHTML = '<span class="spin"></span> 测试中';
      try { var r = await ML.API.test(s); ML.toast('连接正常：' + ML.clip(r, 40)); }
      catch (e) { ML.toast('失败：' + e.message, true, 4500); }
      testB.textContent = '测试连接';
    });
    row.appendChild(testB);
    row.appendChild(el('div', { class: 'muted', text: '常见：DeepSeek / 通义 / 智谱 都是 /v1 结尾的兼容地址' }));
    c1.appendChild(row);
    box.appendChild(c1);

    var c2 = el('div', { class: 'card form-card' });
    c2.appendChild(el('h3', {}, ['写作行为']));
    var t2 = el('div', { class: 'two' });
    t2.appendChild(App.field('失败重试次数', 'input', String(s.retries), function (v) { s.retries = Math.max(1, parseInt(v) || 3); }, '', 'number'));
    t2.appendChild(App.field('默认单章字数', 'input', String(s.chapterWords), function (v) { s.chapterWords = Math.max(600, parseInt(v) || 2200); }, '', 'number'));
    c2.appendChild(t2);
    var chk = el('label', { class: 'row', style: { cursor: 'pointer', padding: '6px 0' } });
    var cb = el('input', { type: 'checkbox' });
    cb.checked = !!s.autoReviewFix;
    cb.addEventListener('change', function () { s.autoReviewFix = cb.checked; });
    chk.appendChild(cb);
    chk.appendChild(el('span', { text: '自动质检 + 定点改稿（更稳，但每章多 2 次接口调用）' }));
    c2.appendChild(chk);
    box.appendChild(c2);

    var c3 = el('div', { class: 'card form-card' });
    c3.appendChild(el('h3', {}, ['数据']));
    var list = el('div', { class: 'list' });
    list.appendChild(App.setItem('导出全部备份', '把所有项目写成 .json 存到「文件」App', function () {
      ML.download('墨灯_全部备份_' + ML.fmtDate(ML.now()) + '.json', DB.exportAll(), 'application/json');
    }));
    list.appendChild(App.setItem('导入备份', '会追加为新项目', async function () {
      var f = await ML.pickFile('.json');
      if (!f) return;
      try { var n = DB.importAll(f.text, true); ML.toast('已导入 ' + n + ' 个项目'); App.page_settings(); }
      catch (e) { ML.toast('导入失败：' + e.message, true); }
    }));
    list.appendChild(App.setItem('存储占用', Math.round(DB.storageUsage() / 1024) + ' KB', null));
    c3.appendChild(list);
    box.appendChild(c3);

    var save = el('div', { class: 'bottom-bar' });
    var b = el('button', { class: 'btn primary', style: { minWidth: '160px' } }, '保存设置');
    b.addEventListener('click', function () { DB.saveSettings(s); ML.toast('已保存'); });
    var s2 = el('button', { class: 'btn ghost' }, '首页');
    s2.addEventListener('click', function () { DB.saveSettings(s); App.go('home'); });
    save.appendChild(s2); save.appendChild(b);
    wrap.appendChild(box);
    view.appendChild(wrap);
    view.appendChild(save);
  };

  App.setItem = function (title, sub, fn) {
    var it = el('button', { class: 'it' });
    it.appendChild(el('div', { class: 'tx' }, [
      el('b', { text: title }),
      sub ? el('small', { text: sub }) : null
    ]));
    if (fn) { it.appendChild(el('span', { class: 'arr', text: '›' })); it.addEventListener('click', fn); }
    return it;
  };

  /* ---------- 启动 ---------- */
  App.boot = function () {
    var s = DB.getSettings();
    if (!s._seenTip) {
      s._seenTip = true; DB.saveSettings(s);
      setTimeout(function () {
        ML.modal({
          size: 'md', title: '使用前两步',
          body: el('div', { class: 'bd', style: { lineHeight: '2' } }, [
            el('div', { text: '1. 先在「设置」里填 OpenAI 兼容接口的 Base URL、API Key、模型。' }),
            el('div', { text: '2. 新建长篇 → 填一份设定 → 点「创建并全自动开写」。' }),
            el('div', { class: 'divider' }),
            el('div', { class: 'muted', text: '全自动 = 立意 → 人物 → 世界观 → 文风 → 卷纲 → 每章的 章纲 / 正文 / 质检改稿 / 摘要 / 状态文件，全程无需你点。随时可暂停、停止；关掉 App 后的进度也会保存。' })
          ]),
          buttons: [{ text: '去填接口', onClick: function () { App.go('settings'); } }, { text: '知道了', cls: 'primary' }]
        });
      }, 400);
    }
    App.go('home');
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  };
  /* 启动 */
  try { App.boot(); }
  catch (e) { console.error(e); document.getElementById('view').innerHTML = '<div class="empty">启动出错：' + ML.esc(e.message) + '</div>'; }
})();
