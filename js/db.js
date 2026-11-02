/* db.js —— 数据层：项目、章节、设定、状态、日志
 * 存储：localStorage 索引 + 每项目独立 key，避免单 key 过大
 * 兼容：未支持 localStorage 大容量时降级为内存
 */
(function () {
  'use strict';
  var ML = window.ML;
  var KEY_INDEX = 'modn.index.v1';       // [projectId]
  var KEY_SET = 'modn.settings.v1';      // 全局设置（API 等）
  var P = function (id) { return 'modn.p.' + id; };

  var mem = {};                          // 兜底缓存

  function read(k, d) {
    if (mem[k] !== undefined) return JSON.parse(mem[k]);
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function write(k, v) {
    var s;
    try { s = JSON.stringify(v); } catch (e) { return false; }
    mem[k] = s;
    try { localStorage.setItem(k, s); return true; }
    catch (e) {
      ML.toast('本地存储写入失败（可能空间已满）', true);
      return false;
    }
  }
  function remove(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }

  var DB = {
    /* ---------- 全局设置 ---------- */
    getSettings: function () {
      return Object.assign({
        baseURL: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
        temperature: 0.9,
        concurrency: 2,
        retries: 3,
        chapterWords: 2200,
        targetChapters: 45,
        autoReviewFix: true,
        style: 'dark'
      }, read(KEY_SET, {}));
    },
    saveSettings: function (s) {
      write(KEY_SET, s);
    },

    /* ---------- 项目索引 ---------- */
    listProjects: function () {
      var ids = read(KEY_INDEX, []);
      var out = [];
      ids.forEach(function (id) {
        var p = DB.getProject(id);
        if (p) out.push(p.meta);
      });
      out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return out;
    },

    /* ---------- 项目 ---------- */
    newProject: function (meta, setup) {
      var id = ML.uid('p');
      var p = {
        meta: Object.assign({
          id: id, title: '未命名', genre: '', createdAt: ML.now(), updatedAt: ML.now(),
          status: 'setup', targetChapters: 45, chapterWords: 2200, logline: '', words: 0
        }, meta),
        setup: setup || {},
        /* bible */
        premise: '',          // 题材立意
        characters: [],       // [{name, role, desc, appear}]
        world: '',            // 世界观/设定
        styleGuide: '',       // 文风约束
        volumes: [],          // [{no, title, summary, fromCh, toCh, status}]
        /* chapters: [{no, title, status, words, outline, text, summary, review}] */
        chapters: [],
        /* 长期记忆 */
        stateFile: '',        // 状态文件全文
        summary: '',          // 全书梗概（滚动更新）
        hooks: [],            // 伏笔 [{text, plantedCh, status}]
        logs: [],             // 运行日志
        run: null,            // 当前运行状态（持久化以便恢复）
        stats: { written: 0, cost: 0, calls: 0, startedAt: 0 }
      };
      DB.saveProject(p);
      var ids = read(KEY_INDEX, []);
      if (ids.indexOf(id) < 0) { ids.push(id); write(KEY_INDEX, ids); }
      return p;
    },
    getProject: function (id) { return read(P(id), null); },
    saveProject: function (p) {
      p.meta.updatedAt = ML.now();
      p.meta.words = (p.chapters || []).reduce(function (a, c) { return a + (c.words || 0); }, 0);
      p.meta.done = (p.chapters || []).filter(function (c) { return c.text; }).length;
      write(P(p.meta.id), p);
    },
    deleteProject: function (id) {
      remove(P(id));
      var ids = read(KEY_INDEX, []).filter(function (x) { return x !== id; });
      write(KEY_INDEX, ids);
    },

    /* ---------- 章节便捷方法 ---------- */
    getChapter: function (p, no) {
      for (var i = 0; i < p.chapters.length; i++) if (p.chapters[i].no === no) return p.chapters[i];
      return null;
    },
    ensureChapter: function (p, no) {
      var c = DB.getChapter(p, no);
      if (!c) {
        c = { no: no, title: '', status: 'pending', words: 0, outline: '', text: '', summary: '', review: '', updatedAt: ML.now() };
        p.chapters.push(c);
        p.chapters.sort(function (a, b) { return a.no - b.no; });
      }
      return c;
    },

    /* ---------- 导出 / 导入 ---------- */
    exportProject: function (p) {
      return JSON.stringify({ app: 'modn', version: 1, project: p }, null, 1);
    },
    importProject: function (text) {
      var o = JSON.parse(text);
      var p = o.project || o;
      if (!p.meta || !p.meta.id) throw new Error('不是有效的项目备份文件');
      p.meta.id = ML.uid('p');
      p.meta.importedAt = ML.now();
      DB.saveProject(p);
      var ids = read(KEY_INDEX, []);
      ids.push(p.meta.id);
      write(KEY_INDEX, ids);
      return p;
    },
    exportMarkdown: function (p, opts) {
      opts = opts || {};
      var L = [];
      L.push('# ' + p.meta.title);
      L.push('');
      if (p.meta.logline) L.push('> ' + p.meta.logline);
      L.push('');
      if (opts.withBible) {
        if (p.premise) { L.push('## 立意'); L.push(p.premise); L.push(''); }
        if (p.world) { L.push('## 世界观'); L.push(p.world); L.push(''); }
        if (p.characters.length) {
          L.push('## 人物');
          p.characters.forEach(function (c) { L.push('- **' + c.name + '**（' + (c.role || '') + '）：' + (c.desc || '')); });
          L.push('');
        }
      }
      L.push('---'); L.push('');
      p.chapters.forEach(function (c) {
        if (!c.text) return;
        L.push('## 第' + c.no + '章 ' + (c.title || ''));
        L.push('');
        c.text.split(/\n+/).forEach(function (s) { if (s.trim()) { L.push(s.trim()); L.push(''); } });
      });
      return L.join('\n');
    },

    /* ---------- 全量备份 ---------- */
    exportAll: function () {
      var all = DB.listProjects().map(function (m) { return DB.getProject(m.id); });
      return JSON.stringify({ app: 'modn', version: 1, at: ML.now(), settings: DB.getSettings(), projects: all }, null, 1);
    },
    importAll: function (text, merge) {
      var o = JSON.parse(text);
      var n = 0;
      (o.projects || []).forEach(function (p) {
        if (!p.meta) return;
        p.meta.id = ML.uid('p');
        DB.saveProject(p);
        var ids = read(KEY_INDEX, []); ids.push(p.meta.id); write(KEY_INDEX, ids);
        n++;
      });
      return n;
    },
    storageUsage: function () {
      var total = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('modn.') === 0) total += (localStorage.getItem(k) || '').length * 2;
        }
      } catch (e) {}
      return total;
    }
  };

  Object.assign(ML, { DB: DB });
})();
