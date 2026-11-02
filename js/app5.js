/* app.js (5/6) —— 对标书样本库 + 人工创意 */
(function () {
  'use strict';
  var ML = window.ML, $ = ML.$, el = ML.el, DB = ML.DB, E = ML.Engine;
  var App = ML.App;

  function ensureBp(p) {
    if (!p.blueprint) p.blueprint = { samples: [], text: '', at: 0 };
    if (!p.blueprint.samples) p.blueprint.samples = [];
    if (!p.ideas) p.ideas = [];
    if (!p.setup) p.setup = {};
  }
  App.ensureBp = ensureBp;

  function mount(n) { var v = $('#view'); v.innerHTML = ''; v.appendChild(n); }

  /* ================= 对标书样本库 ================= */
  App.page_refs = function () {
    var p = App.cur;
    if (!p) { App.go('home'); return; }
    ensureBp(p);
    App.topbar([{ text: '←', cls: 'tb-icon', title: '返回工作台', onClick: function () { App.go('work', App.wnav || 'read'); } }]);
    var wrap = el('div', { class: 'scroller' });
    var box = el('div', { class: 'form-wrap' });

    var c0 = el('div', { class: 'card form-card' });
    c0.appendChild(el('h3', {}, ['对标书样本（' + p.blueprint.samples.length + ' 份）']));
    c0.appendChild(el('div', { class: 'muted', style: { lineHeight: '1.9', marginBottom: '12px' } },
      '把你看好的书的「结构类文档」贴进来——卷纲、章纲、爆点节奏拆解都行，可以贴多本。' +
      '程序会把它们提炼成一份「结构蓝图」，之后立意、卷纲、章纲、正文都按这个骨架来写。' +
      '只学结构不抄内容：卷怎么分、一章几个 beat、钩子放哪、爽点怎么排。'));
    var tools = el('div', { class: 'row wrap' });
    var add = el('button', { class: 'btn primary sm' }, '＋ 粘贴样本');
    add.addEventListener('click', function () { App.editSample(p, -1); });
    tools.appendChild(add);
    var up = el('button', { class: 'btn sm' }, '从文件导入（.md/.txt）');
    up.addEventListener('click', async function () {
      var f = await ML.pickFile('.md,.txt,text/plain,text/markdown');
      if (!f) return;
      p.blueprint.samples.push({ id: ML.uid('s'), name: f.name.replace(/\.[^.]+$/, ''), text: f.text });
      DB.saveProject(p);
      ML.toast('已添加：' + f.name);
      App.page_refs();
    });
    tools.appendChild(up);
    c0.appendChild(tools);
    box.appendChild(c0);

    if (p.blueprint.samples.length) {
      var list = el('div', { class: 'list', style: { marginBottom: '14px' } });
      p.blueprint.samples.forEach(function (s, i) {
        var it = el('div', { class: 'it' }, [
          el('div', { class: 'tx' }, [
            el('b', { text: s.name || ('样本 ' + (i + 1)) }),
            el('small', { text: ML.countWords(s.text) + ' 字 · ' + ML.clip(s.text.replace(/\s+/g, ' '), 46) })
          ])
        ]);
        var ed = el('button', { class: 'btn xs', text: '编辑' });
        ed.addEventListener('click', function () { App.editSample(p, i); });
        var del = el('button', { class: 'btn xs ghost danger', text: '删除' });
        del.addEventListener('click', async function () {
          var ok = await ML.confirm('删除样本', '「' + (s.name || '样本') + '」。已提炼的蓝图不会自动变化。', '删除');
          if (!ok) return;
          p.blueprint.samples.splice(i, 1); DB.saveProject(p); App.page_refs();
        });
        it.appendChild(ed); it.appendChild(del);
        list.appendChild(it);
      });
      box.appendChild(list);
    }

    var c1 = el('div', { class: 'card form-card' });
    c1.appendChild(el('h3', {}, ['结构蓝图']));
    if (!p.blueprint.samples.length) {
      c1.appendChild(el('div', { class: 'muted', text: '先添加至少一份样本再提炼。不贴也行——那就用程序默认的商业长篇结构。' }));
    } else {
      var run = el('button', { class: 'btn sm' }, p.blueprint.text ? '↻ 重新提炼' : '提炼结构蓝图');
      run.addEventListener('click', async function () {
        run.innerHTML = '<span class="spin"></span> 提炼中…';
        try {
          await E.buildBlueprint(p);
          ML.toast('结构蓝图已生成');
          App.page_refs();
        } catch (e) {
          ML.toast('提炼失败：' + e.message, true, 4500);
          run.textContent = '重新提炼';
        }
      });
      c1.appendChild(run);
      if (p.blueprint.at) c1.appendChild(el('span', { class: 'muted', style: { marginLeft: '10px' }, text: ML.fmtRel(p.blueprint.at) }));
    }
    if (p.blueprint.text) {
      c1.appendChild(el('div', { class: 'divider' }));
      c1.appendChild(el('div', { class: 'bd', style: { background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px', marginBottom: '10px', fontSize: '13px', maxHeight: '46vh', overflow: 'auto' }, text: p.blueprint.text }));
      var eBtns = el('div', { class: 'row wrap' });
      var e1 = el('button', { class: 'btn sm' }, '✎ 手动修改蓝图');
      e1.addEventListener('click', async function () {
        var nv = await ML.prompt('手动修改结构蓝图', '直接改数字规则，写得越具体后面越像对标书', p.blueprint.text);
        if (nv == null) return;
        p.blueprint.text = nv; p.blueprint.at = ML.now(); DB.saveProject(p); App.page_refs();
        ML.toast('已保存');
      });
      eBtns.appendChild(e1);
      var e2 = el('button', { class: 'btn sm ghost' }, '复制');
      e2.addEventListener('click', function () { navigator.clipboard.writeText(p.blueprint.text).then(function () { ML.toast('已复制'); }); });
      eBtns.appendChild(e2);
      c1.appendChild(eBtns);
    }
    box.appendChild(c1);

    wrap.appendChild(box);
    mount(wrap);
  };

  App.editSample = function (p, idx) {
    ensureBp(p);
    var s = idx >= 0 ? p.blueprint.samples[idx] : { name: '', text: '' };
    var nameIn = el('input', { class: 'inp', placeholder: '书名或文档名，例：某书 卷一章纲拆解', value: s.name || '' });
    var ta = el('textarea', { class: 'ta', style: { minHeight: '42vh', lineHeight: '1.7' } });
    ta.value = s.text || '';
    ta.placeholder = '把卷纲/章纲/节奏拆解原文贴进来，单份最多喂 9000 字，多本就分几条';
    var body = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: '名称' }), nameIn]),
      el('div', { class: 'field' }, [el('label', { text: '结构文档原文' }), ta])
    ]);
    ML.modal({
      size: 'md', title: idx >= 0 ? '编辑样本' : '添加对标样本', body: body,
      buttons: [
        { text: '取消' },
        {
          text: '保存', cls: 'primary', onClick: function () {
            var t = ta.value.trim();
            if (!t) { ML.toast('内容为空', true); return false; }
            if (idx >= 0) {
              p.blueprint.samples[idx].name = nameIn.value.trim() || p.blueprint.samples[idx].name;
              p.blueprint.samples[idx].text = t;
            } else {
              p.blueprint.samples.push({ id: ML.uid('s'), name: nameIn.value.trim() || ('样本 ' + (p.blueprint.samples.length + 1)), text: t });
            }
            DB.saveProject(p);
            App.page_refs();
          }
        }
      ]
    });
  };

  /* ================= 人工创意 ================= */
  App.page_ideas = function () {
    var p = App.cur;
    if (!p) { App.go('home'); return; }
    ensureBp(p);
    App.topbar([{ text: '←', cls: 'tb-icon', title: '返回工作台', onClick: function () { App.go('work', App.wnav || 'read'); } }]);
    var wrap = el('div', { class: 'scroller' });
    var box = el('div', { class: 'form-wrap' });

    var c0 = el('div', { class: 'card form-card' });
    c0.appendChild(el('h3', {}, ['全程创意（立项时定下的东西）']));
    c0.appendChild(el('div', { class: 'muted', style: { lineHeight: '1.9', marginBottom: '10px' } },
      '写你想让这本书一定发生的事：中期要拿到的店、某个名场面、必须有的反转、你讨厌的桥段。' +
      '这些会被当成「作者本人定的」，AI 不许改掉只能围绕它展开——立意、卷纲、章纲、正文都会带上。'));
    var ta = el('textarea', { class: 'ta', style: { minHeight: '170px', lineHeight: '1.8' } });
    ta.value = p.setup.creatives || '';
    ta.placeholder = '例：\n· 第 30 章前后，段谦第一次把亲戚的 12 万还清，方式是当众比厨\n· 中间一定要有「狗被城管抓走」的戏\n· 结局前必须有一次段谦想放弃、狗反过来救他的反转\n· 不要写主角开后宫';
    var save = el('button', { class: 'btn primary sm', style: { marginTop: '10px' } }, '保存全程创意');
    save.addEventListener('click', function () {
      p.setup.creatives = ta.value;
      DB.saveProject(p);
      ML.toast('已保存，之后生成的立意 / 卷纲 / 章纲都会带上');
    });
    c0.appendChild(ta);
    c0.appendChild(save);
    box.appendChild(c0);

    var c1 = el('div', { class: 'card form-card' });
    c1.appendChild(el('h3', {}, ['按章创意（' + p.ideas.length + ' 条）']));
    c1.appendChild(el('div', { class: 'muted', style: { lineHeight: '1.9', marginBottom: '10px' } },
      '挂在具体章号上的点子。写那一章前后（±2 章）时会自动塞进章纲与正文要求。章号留空 = 全程。'));
    var row = el('div', { class: 'row', style: { marginBottom: '10px' } });
    var numIn = el('input', { class: 'inp', type: 'number', placeholder: '章号', style: { width: '86px' } });
    var txtIn = el('input', { class: 'inp grow', placeholder: '这一章想要发生什么' });
    var addB = el('button', { class: 'btn sm primary' }, '添加');
    addB.addEventListener('click', function () {
      var t = txtIn.value.trim();
      if (!t) { ML.toast('写点内容', true); return; }
      p.ideas.push({ id: ML.uid('i'), at: parseInt(numIn.value) || 0, text: t, done: 0 });
      p.ideas.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      DB.saveProject(p);
      App.page_ideas();
    });
    row.appendChild(numIn); row.appendChild(txtIn); row.appendChild(addB);
    c1.appendChild(row);

    var list = el('div', { class: 'list' });
    if (!p.ideas.length) list.appendChild(el('div', { class: 'it' }, [el('div', { class: 'tx' }, '还没有按章创意')]));
    p.ideas.forEach(function (x, i) {
      var it = el('div', { class: 'it' }, [
        el('span', { class: 'pill ' + (x.at ? 'gold' : ''), text: x.at ? '第' + x.at + '章' : '全程' }),
        el('div', { class: 'tx' }, [el('b', { text: ML.clip(x.text, 60) })])
      ]);
      var ed = el('button', { class: 'btn xs', text: '改' });
      ed.addEventListener('click', async function () {
        var nv = await ML.prompt('修改创意', '第一行写章号（0 = 全程），其余是内容', (x.at || 0) + '\n' + x.text);
        if (nv == null) return;
        var parts = nv.split('\n');
        x.at = parseInt(parts[0]) || 0;
        x.text = parts.slice(1).join('\n').trim();
        DB.saveProject(p); App.page_ideas();
      });
      var del = el('button', { class: 'btn xs ghost danger', text: '删' });
      del.addEventListener('click', function () {
        p.ideas.splice(i, 1); DB.saveProject(p); App.page_ideas();
      });
      it.appendChild(ed); it.appendChild(del);
      list.appendChild(it);
    });
    c1.appendChild(list);
    box.appendChild(c1);

    wrap.appendChild(box);
    mount(wrap);
  };
})();
