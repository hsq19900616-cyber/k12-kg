/* 共用数据层 + 页面渲染 */
const D = {};
const BOOKS = ['小学', '七上', '七下', '八上', '八下', '九上', '九下'];

async function loadAll() {
  const man = await fetch('data/index.json').then(r => r.json());
  if (man.packs) {
    const grab = u => fetch(u).then(r => r.json());
    const qp = man.packs.q[SUBJ] || man.packs.q[Object.keys(man.packs.q)[0]];
    const [tp, pe, qs] = await Promise.all([grab(man.packs.topics), grab(man.packs.prereq), grab(qp)]);
    D.topics = tp.topics || [];
    D.edges = pe.edges || [];
    D.questions = qs.questions || [];
    D.meta = tp.meta || (D.topics.find(x => x.meta) || {}).meta || {};
    D.packSubjects = Object.keys(man.packs.q);
  } else {
    const grab = list => Promise.all(list.map(f => fetch('data/' + f).then(r => r.json())));
    const [ts, ps, qs] = await Promise.all([grab(man.topics), grab(man.prereq), grab(man.questions)]);
    D.topics = ts.flatMap(x => x.topics || []);
    D.edges = ps.flatMap(x => x.edges || []);
    D.questions = qs.flatMap(x => x.questions || []);
    D.meta = (ts.find(x => x.meta) || {}).meta || {};
    D.packSubjects = null;
  }

  D.topics.forEach(t => {
    t.chapter = (t.chapter || '').replace(/^第[一二三四五六七八九十]+章\s*/, '');
    t.subject = t.subject || D.meta.subject || '数学';
    if (t.subject !== '数学') t.chapter = `${t.stage === '小学' ? '小学' : '初中'}·${t.chapter}`;
    t.book = `${({ 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二' })[t.grade] || t.grade}${t.term === 1 ? '上' : '下'}`;
  });
  D.bySubject = new Map();
  D.topics.forEach(t => {
    if (!D.bySubject.has(t.subject)) D.bySubject.set(t.subject, []);
    D.bySubject.get(t.subject).push(t);
  });
  D.subjects = (D.packSubjects && D.packSubjects.length) ? D.packSubjects.slice() : [...D.bySubject.keys()];
  D.byId = new Map(D.topics.map(x => [x.id, x]));
  D.pre = new Map(D.topics.map(x => [x.id, []]));
  D.post = new Map(D.topics.map(x => [x.id, []]));
  D.edges.forEach(e => {
    if (!D.byId.has(e.from) || !D.byId.has(e.to)) return;
    D.pre.get(e.to).push(e);
    D.post.get(e.from).push(e);
  });
  D.qByTopic = new Map();
  D.questions.forEach(q => {
    if (!D.qByTopic.has(q.topic)) D.qByTopic.set(q.topic, []);
    D.qByTopic.get(q.topic).push(q);
  });
  mountSubjectBar();
  initTheme();
  return D;
}

const order = t => (t.stage === '小学' ? 0 : 100) + t.grade * 10 + t.term;

/* ---------- 主题（浅色 / 深色） ---------- */
const TH = { K: 'kg.theme' };
function applyTheme(v) {
  document.documentElement.dataset.theme = v;
  try { localStorage.setItem(TH.K, v); } catch (e) {}
}
function initTheme() {
  let v = null;
  try { v = localStorage.getItem(TH.K); } catch (e) {}
  if (!v) v = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(v);
  const hd = document.querySelector('header');
  if (!hd || document.getElementById('themeBtn')) return;
  const b = document.createElement('button');
  b.id = 'themeBtn'; b.className = 'btn ghost theme';
  const paint = () => { b.textContent = document.documentElement.dataset.theme === 'dark' ? '☀ 浅色' : '☾ 深色'; };
  paint();
  b.onclick = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); paint(); };
  hd.appendChild(b);
}

/* 掌握度 → 颜色 */
const mColor = p => (p == null ? '#9aa7bd' : p < 0.4 ? '#dc2626' : p < 0.7 ? '#d97706' : '#12855c');
const mFill = p => (p == null ? '#ffffff' : p < 0.4 ? '#fee2e2' : p < 0.7 ? '#fef3c7' : '#dcfce7');

/* ---------- 轻量数学排版（上/下标、根号、分数） ---------- */
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n', '₊': '+' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const figHTML = q => (q && q.figure ? `<div class="fig">${q.figure}</div>` : '');
function fmt(s) {
  let h = esc(s);
  h = h.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, m => '<sup>' + [...m].map(c => SUP[c]).join('') + '</sup>');
  h = h.replace(/[₀₁₂₃₄₅₆₇₈₉ₙ₊]+/g, m => '<sub>' + [...m].map(c => SUB[c]).join('') + '</sub>');
  h = h.replace(/√(\([^)]*\)|[0-9A-Za-z]+)/g, (m, x) => '√<span class="rad">' + x + '</span>');
  h = h.replace(/(^|[^\w/])(\d+)\/(\d+)(?![\w/])/g, (m, p, a, b) => p + '<span class="frac"><span>' + a + '</span><span>' + b + '</span></span>');
  return h;
}

/* 离线（PWA）：本地服务器下才注册 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- 学科切换 ---------- */
const SUBJECTS = ['数学', '英语', '语文'];
let SUBJ = new URLSearchParams(location.search).get('subject') || localStorage.getItem('kg.subject') || '数学';
if (!SUBJECTS.includes(SUBJ)) SUBJ = '数学';
const topicsOf = s => D.topics.filter(t => t.subject === (s || SUBJ));
function setSubject(s) {
  try { localStorage.setItem('kg.subject', s); } catch (e) {}
  const u = new URL(location.href);
  u.searchParams.set('subject', s);
  location.href = u.toString();
}
function mountSubjectBar() {
  const nav = document.querySelector('header nav');
  if (!nav || nav.dataset.subj) return;
  nav.dataset.subj = '1';
  const list = (D.subjects && D.subjects.length ? D.subjects : SUBJECTS);
  const i = Math.max(0, list.indexOf(SUBJ));
  const next = list[(i + 1) % list.length];
  const a = document.createElement('a');
  a.href = '#';
  a.textContent = `学科：${SUBJ}（共 ${list.length} 科，点击切换）`;
  a.title = '切换到 ' + next;
  a.onclick = e => { e.preventDefault(); setSubject(next); };
  nav.appendChild(a);
}
const subjEdges = () => {
  const ids = new Set(topicsOf().map(t => t.id));
  return D.edges.filter(e => ids.has(e.from) && ids.has(e.to));
};
const subjQuestions = () => {
  const ids = new Set(topicsOf().map(t => t.id));
  return D.questions.filter(q => ids.has(q.topic));
};
const booksOf = () => {
  const m = new Map();
  topicsOf().forEach(t => {
    if (!m.has(t.book) || order(t) < m.get(t.book)) m.set(t.book, order(t));
  });
  return [...m].sort((a, b) => a[1] - b[1]).map(x => x[0]);
};
const sortTopics = arr => arr.slice().sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
const stageLabel = t => (t.stage === '小学' ? '小学' : t.book);

function chapters(list) {
  const m = new Map();
  (list || topicsOf()).forEach(t => {
    if (!m.has(t.chapter)) m.set(t.chapter, []);
    m.get(t.chapter).push(t);
  });
  return [...m].map(([name, l]) => ({ name, list: sortTopics(l) }))
    .sort((a, b) => order(a.list[0]) - order(b.list[0]));
}

/* ---------- 掌握度（BKT）+ 错题本 ---------- */
const BK = { pL0: 0.3, pT: 0.25, pG: 0.2, pS: 0.1, MK: 'kg.mastery', WK: 'kg.wrong' };
function loadMastery() { try { return JSON.parse(localStorage.getItem(BK.MK) || '{}'); } catch (e) { return {}; } }
function masteryOf(id) { const m = loadMastery(); return m[id] == null ? BK.pL0 : m[id]; }
/* ---------- 间隔复习（SM-2 简化版） ---------- */
const RV = { K: 'kg.review', DAY: 86400000 };
function loadReview() { try { return JSON.parse(localStorage.getItem(RV.K) || '{}'); } catch (e) { return {}; } }
function saveReview(m) { try { localStorage.setItem(RV.K, JSON.stringify(m)); } catch (e) {} }
function reviewOf(id) { return loadReview()[id] || null; }
function reviewUpdate(id, correct) {
  const m = loadReview();
  const r = m[id] || { reps: 0, ivl: 0, due: 0, lapses: 0 };
  if (correct) {
    r.reps++;
    r.ivl = r.reps === 1 ? 1 : r.reps === 2 ? 3 : Math.min(60, Math.round(r.ivl * 2.2));
    r.due = Date.now() + r.ivl * RV.DAY;
  } else {
    r.lapses++;
    r.reps = 0;
    r.ivl = 1;
    r.due = Date.now() + RV.DAY;
  }
  m[id] = r;
  saveReview(m);
  return r;
}
function dueTopics(now) {
  const m = loadReview();
  const t = now || Date.now();
  return Object.keys(m).filter(id => D.byId.has(id) && (D.qByTopic.get(id) || []).length && m[id].due <= t)
    .sort((a, b) => m[a].due - m[b].due);
}
const dayText = ms => {
  const d = Math.round(ms / RV.DAY);
  return d <= 0 ? '今天到期' : d === 1 ? '明天' : `${d} 天后`;
};

function bktUpdate(id, correct) {
  const m = loadMastery();
  let p = m[id] == null ? BK.pL0 : m[id];
  const num = correct ? p * (1 - BK.pS) : p * BK.pS;
  const den = correct ? num + (1 - p) * BK.pG : num + (1 - p) * (1 - BK.pG);
  p = den > 0 ? num / den : p;
  p = p + (1 - p) * BK.pT;
  m[id] = p;
  try { localStorage.setItem(BK.MK, JSON.stringify(m)); } catch (e) {}
  reviewUpdate(id, correct);
  return p;
}
function recordWrong(q, topicId) {
  try {
    const a = JSON.parse(localStorage.getItem(BK.WK) || '[]');
    const i = a.findIndex(x => x.qid === q.id);
    if (i >= 0) { a[i].n = (a[i].n || 1) + 1; a[i].at = Date.now(); }
    else a.unshift({ qid: q.id, topic: topicId, stem: q.stem, at: Date.now(), n: 1 });
    localStorage.setItem(BK.WK, JSON.stringify(a.slice(0, 300)));
  } catch (e) {}
}

/* ---------- 错因自评 ---------- */
const EK = 'kg.errlog';
const CAUSES = [
  { k: 'concept', t: '概念没懂' },
  { k: 'calc', t: '计算失误' },
  { k: 'read', t: '看错题' },
  { k: 'none', t: '完全不会' }
];
function logCause(qid, topic, cause) {
  try {
    const a = JSON.parse(localStorage.getItem(EK) || '[]');
    a.unshift({ qid, topic, cause, at: Date.now() });
    localStorage.setItem(EK, JSON.stringify(a.slice(0, 500)));
  } catch (e) {}
}
function causeStats(topicId) {
  try {
    const a = JSON.parse(localStorage.getItem(EK) || '[]');
    const c = {};
    a.filter(x => !topicId || x.topic === topicId).forEach(x => { c[x.cause] = (c[x.cause] || 0) + 1; });
    return c;
  } catch (e) { return {}; }
}
const causeName = k => (CAUSES.find(c => c.k === k) || {}).t || k;
function causeRow(qid, topic, scope, onPick) {
  const html = `<div class="causes"><span class="meta">错在哪？</span>` +
    CAUSES.map(c => `<button class="chip cause" data-c="${c.k}">${c.t}</button>`).join('') + '</div>';
  const root = document.querySelector(scope);
  if (!root) return html;
  root.insertAdjacentHTML('beforeend', html);
  const bar = root.querySelector('.causes:last-child');
  bar.querySelectorAll('.cause').forEach(b => b.onclick = () => {
    logCause(qid, topic, b.dataset.c);
    bar.querySelectorAll('.cause').forEach(x => { x.disabled = true; x.classList.remove('picked'); });
    b.classList.add('picked');
    if (onPick) onPick(b.dataset.c);
  });
  return '';
}
function renderWrong() {
  const box = document.getElementById('list');
  const a = JSON.parse(localStorage.getItem(BK.WK) || '[]');
  const bar = document.getElementById('wbar');
  if (!a.length) {
    if (bar) bar.innerHTML = '';
    box.innerHTML = '<div class="card meta">还没有错题。先去<a href="diagnose.html">诊断</a>几个知识点。</div>';
    return;
  }
  const byTopic = new Map();
  a.forEach(x => { if (!byTopic.has(x.topic)) byTopic.set(x.topic, []); byTopic.get(x.topic).push(x); });
  const groups = [...byTopic].filter(([tid]) => D.byId.has(tid))
    .sort((x, y) => masteryOf(x[0]) - masteryOf(y[0]));
  if (bar) bar.innerHTML = `<div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
    <span><b>${a.length}</b> 道错题 · <b>${groups.length}</b> 个知识点</span>
    <span style="flex:1"></span>
    <a class="btn" href="drill.html">重练全部错题</a>
    <button class="btn ghost" onclick="exportWrong()">导出 Markdown</button>
    <button class="btn ghost" onclick="clearWrong()">清空</button></div>`;
  box.innerHTML = groups.map(([tid, items]) => {
    const t = D.byId.get(tid);
    const p = masteryOf(tid);
    const rows = items.slice(0, 6).map(x => {
      const q = (D.questions || []).find(y => y.id === x.qid);
      const opts = q ? q.options.map((o, i) =>
        `<li class="${i === q.answer ? 'right' : ''}">${'ABCD'[i]}. ${fmt(o)}${i === q.answer ? ' ✓' : ''}</li>`).join('') : '';
      return `<div class="wq"><div class="wstem">${fmt(x.stem)}${x.n > 1 ? ` <span class="meta">错 ${x.n} 次</span>` : ''}</div>
        ${q ? `<ul class="wopts">${opts}</ul>` : ''}
        ${q && q.explain ? `<div class="meta">解析：${fmt(q.explain)}</div>` : ''}</div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h3 style="margin:0;font-size:16px">${t.name}</h3><span class="tag">${t.book}</span>
        <span class="meta">掌握度 <b style="color:${mColor(p)}">${Math.round(p * 100)}%</b> · 错题 ${items.length} 道</span>
        ${(() => { const cs = causeStats(tid); const top = Object.entries(cs).sort((a, b) => b[1] - a[1])[0];
          return top ? `<span class="tag off">主要错因：${causeName(top[0])} ${top[1]} 次</span>` : ''; })()}
      </div>
      <div style="margin-top:8px">${rows}${items.length > 6 ? `<div class="meta">还有 ${items.length - 6} 道…</div>` : ''}</div>
      <p style="margin:10px 0 0"><a class="btn" href="drill.html?topic=${tid}">重练这 ${items.length} 道</a>
        <a class="btn ghost" href="diagnose.html?target=${tid}">重新诊断这个知识点</a></p></div>`;
  }).join('');
}
function wrongText() {
  const a = JSON.parse(localStorage.getItem(BK.WK) || '[]');
  const byTopic = new Map();
  a.forEach(x => { if (!byTopic.has(x.topic)) byTopic.set(x.topic, []); byTopic.get(x.topic).push(x); });
  let md = `# 错题本\n\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  [...byTopic].forEach(([tid, items]) => {
    const t = D.byId.get(tid);
    if (!t) return;
    md += `## ${t.name}（${t.book} · ${t.chapter}）　掌握度 ${Math.round(masteryOf(tid) * 100)}%\n\n`;
    items.forEach((x, i) => {
      const q = (D.questions || []).find(y => y.id === x.qid);
      md += `${i + 1}. ${x.stem}\n`;
      if (q) {
        q.options.forEach((o, j) => { md += `   - ${'ABCD'[j]}. ${o}${j === q.answer ? ' ✅' : ''}\n`; });
        if (q.explain) md += `   - 解析：${q.explain}\n`;
      }
      md += '\n';
    });
  });
  return md;
}
function exportWrong() {
  const blob = new Blob([wrongText()], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  const d = new Date();
  a.download = `错题本_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.md`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function clearWrong() {
  if (!confirm('确定清空全部错题？')) return;
  localStorage.removeItem(BK.WK);
  renderWrong();
}

/* ---------- 首页 ---------- */
function renderIndex() {
  const T = topicsOf();
  const scope = document.getElementById('scope');
  if (scope) scope.textContent = T.length + ' 个知识点 · ' + subjEdges().length + ' 条先修关系 · ' + subjQuestions().length + ' 道题';

  const raw = loadMastery();
  const tested = T.filter(t => raw[t.id] != null);
  const avg = tested.length ? tested.reduce((s, t) => s + raw[t.id], 0) / tested.length : 0;
  const weak = tested.filter(t => raw[t.id] < 0.7).sort((a, b) => raw[a.id] - raw[b.id]).slice(0, 3);
  const due = dueTopics();

  const mBox = document.getElementById('mastery');
  if (mBox) {
    mBox.innerHTML = tested.length
      ? '<div class="sumline"><span>掌握度 <b style="color:' + mColor(avg) + '">' + Math.round(avg * 100) + '%</b></span>'
        + '<span>已测 ' + tested.length + '/' + T.length + '</span>'
        + '<span>待复习 <b>' + due.length + '</b> 个</span></div>'
        + (weak.length ? '<div class="weakrow">最该补：' + weak.map(t =>
            '<a class="chip" href="diagnose.html?target=' + t.id + '">' + t.name + ' ' + Math.round(raw[t.id] * 100) + '%</a>').join('') + '</div>' : '')
      : '<div class="meta">还没测过。点上面「开始诊断」，选一个最近学得吃力的知识点。</div>';
  }

  const rv = document.getElementById('reviewtip');
  if (rv) {
    rv.innerHTML = due.length
      ? '<a class="card entry" href="review.html"><b>今天有 ' + due.length + ' 个点该复习</b><span>去复习 →</span></a>'
      : '';
  }

  const wrongs = JSON.parse(localStorage.getItem(BK.WK) || '[]');
  const hist = loadHistory();
  const last = hist[0] && D.byId.get(hist[0].targetId);
  const eBox = document.getElementById('entries');
  if (eBox) {
    eBox.innerHTML = [
      last ? '<a class="card entry" href="diagnose.html?target=' + last.id + '"><b>继续上次</b><span>' + last.name + '</span></a>' : '',
      '<a class="card entry" href="wrong.html"><b>错题本</b><span>' + wrongs.length + ' 道</span></a>',
      '<a class="card entry" href="lab.html"><b>3D 实验</b><span>54 门</span></a>'
    ].filter(Boolean).join('');
  }
  renderDataTools();
}

/* ---------- 学习卡片（讲解） ---------- */
let GEO3D = null;
function loadGeo3D() {
  if (GEO3D) return Promise.resolve(GEO3D);
  return fetch('data/geo3d.json').then(r => r.json())
    .then(d => (GEO3D = d.map || {})).catch(() => (GEO3D = {}));
}
function renderLearn() {
  const box = document.getElementById('learn');
  const id = new URLSearchParams(location.search).get('topic');
  const t = id && D.byId.get(id);
  if (!t) {
    box.innerHTML = '<div class="card"><b>没有指定知识点</b><p class="meta">从图谱或诊断结果里点「讲解」进入。</p></div>';
    return;
  }
  document.title = `讲解 · ${t.name}`;
  const p = masteryOf(t.id);
  const rv = reviewOf(t.id);
  const pre = (D.pre.get(t.id) || []).map(e => D.byId.get(e.from)).filter(Boolean);
  const post = (D.post.get(t.id) || []).map(e => D.byId.get(e.to)).filter(Boolean);
  const qs = (D.qByTopic.get(t.id) || []).slice().sort((a, b) => (a.level || 1) - (b.level || 1));
  const q = qs.find(x => x.figure) || qs[0];
  const more = qs.filter(x => x !== q).slice(0, 2);

  box.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
        <h2 style="margin:0;font-size:22px">${t.name}</h2>
        <span class="tag">${t.book} · ${t.chapter}</span>
      </div>
      <div class="meta" style="margin-top:8px">掌握度 <b style="color:${mColor(p)}">${Math.round(p * 100)}%</b>
        ${rv ? ` · 下次复习：${dayText(rv.due - Date.now())}` : ' · 还没安排复习'}</div>
      <p style="font-size:16px;line-height:1.8;margin:14px 0 0">${t.desc ? fmt(t.desc) : '（暂无概念描述）'}</p>
    </div>

    <div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 8px;font-size:15px">教材定位</h3>
      <div class="meta">${t.book} · ${t.chapter}</div>
      <div class="chips" style="margin-top:8px">${(chapters(topicsOf().filter(x => x.chapter === t.chapter))[0] || { list: [] }).list.slice(0, 14).map(x =>
        `<a class="chip" href="learn.html?topic=${x.id}"${x.id === t.id ? ' style="border-color:var(--primary);color:var(--primary);font-weight:600"' : ''}>${x.name}</a>`).join('')}</div>
      <p class="meta" style="margin:8px 0 0">同章知识点按教材先后排列；页码需对照纸质教材核实，暂不标注。</p>
    </div>

    ${pre.length ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px;font-size:15px">先确认这几点（先修）</h3>
      <div class="chips">${pre.map(x => `<a class="chip" href="learn.html?topic=${x.id}">${x.name}
        <span style="color:${mColor(masteryOf(x.id))}">${Math.round(masteryOf(x.id) * 100)}%</span></a>`).join('')}</div>
      <p class="meta" style="margin:8px 0 0">任一个低于 50%，建议先看那个点的讲解。</p></div>` : ''}

    ${q ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 10px;font-size:15px">例题（先自己想一想，再看答案）</h3>
      <div class="stem">${fmt(q.stem)}</div>
      ${figHTML(q)}
      <div class="opts">${q.options.map((o, i) => `<div class="opt static${i === q.answer ? ' ok' : ''}">${'ABCD'[i]}. ${fmt(o)}${i === q.answer ? ' ✓' : ''}</div>`).join('')}</div>
      ${q.explain ? `<div class="fb ok" style="margin-top:10px">解析：${fmt(q.explain)}</div>` : ''}
    </div>` : '<div class="card" style="margin-top:12px"><span class="meta">这个点还没有例题。</span></div>'}

    ${more.length ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px;font-size:15px">再练两题</h3>
      ${more.map(x => `<div class="wq"><div class="wstem">${fmt(x.stem)}</div>
        <div class="meta">答案：${'ABCD'[x.answer]}. ${fmt(x.options[x.answer])}${x.explain ? ' · ' + fmt(x.explain) : ''}</div></div>`).join('')}</div>` : ''}

    <div class="card" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <a class="btn" href="diagnose.html?target=${t.id}">学完就测（自适应诊断）</a>
      <span id="geo3dSlot"></span>
      ${post.length ? `<span class="meta">接下来会学：${post.slice(0, 4).map(x =>
        `<a href="learn.html?topic=${x.id}">${x.name}</a>`).join('、')}</span>` : ''}
    </div>`;

  loadGeo3D().then(map => {
    const g = map[t.id];
    const slot = document.getElementById('geo3dSlot');
    if (!g || !slot) return;
    if (g.kind === 'local') {
      slot.innerHTML = `<a class="btn ghost" href="demo3d/?scene=${g.scene}&topic=${t.id}" target="_blank" rel="noreferrer">看 3D 演示</a>`;
    } else {
      slot.innerHTML = `<a class="btn ghost" href="https://www.geogebra.org/search/${encodeURIComponent(g.term)}"
        target="_blank" rel="noreferrer">去 GeoGebra 找演示</a>`;
    }
  });
}

/* ---------- 今日复习 ---------- */
const RQ = { list: [], i: 0, ok: 0, bad: 0, locked: false };

function renderReview() {
  const bar = document.getElementById('rbar');
  const box = document.getElementById('rbox');
  const m = loadReview();
  const due = dueTopics();
  const all = Object.keys(m).filter(id => D.byId.has(id)).sort((a, b) => m[a].due - m[b].due);
  const soon = all.filter(id => m[id].due > Date.now()).slice(0, 5);
  if (!all.length) {
    bar.innerHTML = '';
    box.innerHTML = `<div class="card"><b>还没有复习安排</b>
      <p class="meta">做过诊断或练习后，每个知识点会自动进入复习队列（答对：1→3→7→15 天；答错：1 天后重来）。</p>
      <p><a class="btn" href="diagnose.html">先做一次诊断</a></p></div>`;
    return;
  }
  bar.innerHTML = `<div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
    <b style="font-size:18px">今天到期 ${due.length} 个点</b>
    <span class="meta">队列共 ${all.length} 个点</span><span style="flex:1"></span>
    ${due.length ? '<button class="btn" id="rstart">开始复习</button>' : ''}</div>`;
  box.innerHTML = (due.length ? due : soon).map(id => {
    const t = D.byId.get(id), r = m[id], p = masteryOf(id);
    const late = r.due <= Date.now();
    return `<a class="card chap" href="learn.html?topic=${id}" style="margin-bottom:8px">
      <span class="n">${t.name}<small class="meta" style="display:block">${t.book} · ${t.chapter}</small></span>
      <span class="c">${late ? `<b style="color:${p < 0.5 ? 'var(--bad)' : 'var(--warn)'}">${r.due <= Date.now() ? '已到期' : ''}</b>` : dayText(r.due - Date.now())}
        · 掌握度 ${Math.round(p * 100)}%</span></a>`;
  }).join('');
  if (due.length) document.getElementById('rstart').onclick = () => startReview(due);
}

function startReview(ids) {
  const seen = new Set();
  RQ.list = [];
  ids.forEach(id => {
    const qs = (D.qByTopic.get(id) || []).slice().sort((a, b) => Math.random() - 0.5);
    const q = qs.find(x => !seen.has(x.id));
    if (q) { seen.add(q.id); RQ.list.push(q); }
  });
  RQ.i = 0; RQ.ok = 0; RQ.bad = 0;
  document.getElementById('rbar').innerHTML = '';
  document.getElementById('rbox').innerHTML = '';
  nextReview();
}

function nextReview() {
  const box = document.getElementById('rbox');
  if (RQ.i >= RQ.list.length) {
    box.innerHTML = `<div class="card"><h3 style="margin-top:0">复习完成</h3>
      <p>共 ${RQ.list.length} 题：对 <b class="ok">${RQ.ok}</b>，错 <b class="bad">${RQ.bad}</b>。</p>
      <p class="meta">答对的点间隔会拉长，答错的点明天再来。</p>
      <p><a class="btn" href="review.html">返回复习列表</a><a class="btn ghost" href="index.html" style="margin-left:8px">回首页</a></p></div>`;
    return;
  }
  RQ.locked = false;
  const q = RQ.list[RQ.i], t = D.byId.get(q.topic);
  const map = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  const opts = map.map(i => q.options[i]);
  const correct = map.indexOf(q.answer);
  box.innerHTML = `<div class="pbar"><i style="width:${Math.round(RQ.i / RQ.list.length * 100)}%"></i></div>
    <div class="meta">第 ${RQ.i + 1} / ${RQ.list.length} 题 · ${t.name}</div>
    <div class="card" data-qid="${q.id}" style="margin-top:8px"><div class="stem">${fmt(q.stem)}</div>
      ${figHTML(q)}
      <div class="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}">${'ABCD'[i]}. ${fmt(o)}</button>`).join('')}</div>
      <div class="fb" id="rfb"></div></div>`;
  const pick = i => {
    if (RQ.locked) return;
    RQ.locked = true;
    const ok = i === correct;
    box.querySelectorAll('.opt').forEach((b, j) => {
      b.disabled = true;
      if (j === correct) b.classList.add('ok');
      if (j === i && !ok) b.classList.add('bad');
    });
    bktUpdate(q.topic, ok);
    if (ok) RQ.ok++; else { RQ.bad++; recordWrong(q, q.topic); }
    const r = reviewOf(q.topic);
    const fb = document.getElementById('rfb');
    fb.className = 'fb ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = (ok ? '对' : '错') + `（正确：${'ABCD'[correct]}）` +
      (q.explain ? `<br><span class="meta">${fmt(q.explain)}</span>` : '') +
      `<br><span class="meta">下次复习：${r ? dayText(r.due - Date.now()) : '-'}</span>` +
      `<br><button class="btn" id="rnext" style="margin-top:8px">${RQ.i + 1 < RQ.list.length ? '下一题 →' : '看结果'}</button>`;
    if (!ok) causeRow(q.id, q.topic, '#rbox .card');
    document.getElementById('rnext').onclick = () => { RQ.i++; nextReview(); };
  };
  box.querySelectorAll('.opt').forEach(b => b.onclick = () => pick(+b.dataset.i));
}

/* ---------- 3D 实验资源库（铜匠实验室，外链引用） ---------- */
const LAB = { all: [], subj: '全部', book: '全部', kw: '' };

function renderLab() {
  const listBox = document.getElementById('lablist');
  const subjBox = document.getElementById('labsubj');
  const bookSel = document.getElementById('labbook');
  const qBox = document.getElementById('labq');
  if (!listBox) return;

  fetch('data/lab.json').then(r => r.json()).then(data => {
    LAB.all = (data.courses || []).slice();
    const subjs = ['全部', ...new Set(LAB.all.map(c => c.subject))];
    subjBox.innerHTML = subjs.map(s => `<span class="chip labsubj${s === LAB.subj ? ' sel' : ''}" data-s="${s}">${s}</span>`).join('');
    subjBox.querySelectorAll('.labsubj').forEach(el => el.onclick = () => {
      LAB.subj = el.dataset.s; LAB.book = '全部';
      subjBox.querySelectorAll('.labsubj').forEach(x => x.classList.toggle('sel', x === el));
      paintBooks(); paint();
    });
    qBox.oninput = () => { LAB.kw = qBox.value.trim(); paint(); };

    function paintBooks() {
      const pool = LAB.all.filter(c => LAB.subj === '全部' || c.subject === LAB.subj);
      const books = ['全部', ...new Set(pool.map(c => c.book).filter(Boolean))];
      bookSel.innerHTML = books.map(b => `<option value="${b}">${b === '全部' ? '全部册别' : b}</option>`).join('');
      bookSel.value = books.includes(LAB.book) ? LAB.book : '全部';
      bookSel.onchange = () => { LAB.book = bookSel.value; paint(); };
    }

    function paint() {
      const kw = LAB.kw;
      const rows = LAB.all.filter(c =>
        (LAB.subj === '全部' || c.subject === LAB.subj) &&
        (LAB.book === '全部' || c.book === LAB.book) &&
        (!kw || [c.title, c.chapter, c.section, c.question, c.type].join(' ').includes(kw)));
      if (!rows.length) { listBox.innerHTML = '<div class="card meta">没有匹配的课件。</div>'; return; }
      listBox.innerHTML = rows.map(c => `
        <div class="card labcard" data-slug="${c.slug}">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
            <b style="font-size:15.5px">${c.title}</b>
            <span class="tag">${c.subject} · ${c.steps} 步</span>
          </div>
          <div class="meta" style="margin-top:4px">${c.book} · ${c.chapter}${c.section ? ' · ' + c.section : ''}</div>
          ${c.question ? `<div class="meta" style="margin-top:6px">主线问题：${c.question}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn labprev">在本页预览</button>
            <a class="btn ghost" href="${c.online}" target="_blank" rel="noreferrer">新窗口打开</a>
          </div>
          <div class="labframe"></div>
        </div>`).join('');
      listBox.querySelectorAll('.labcard').forEach(card => {
        const c = rows.find(x => x.slug === card.dataset.slug);
        card.querySelector('.labprev').onclick = e => {
          const f = card.querySelector('.labframe');
          if (f.dataset.on === '1') { f.innerHTML = ''; f.dataset.on = '0'; e.target.textContent = '在本页预览'; return; }
          f.innerHTML = `<div class="pbar"><i style="width:60%"></i></div><iframe src="${c.online}" loading="lazy" allow="fullscreen" referrerpolicy="no-referrer"></iframe>`;
          f.dataset.on = '1'; e.target.textContent = '关闭预览';
        };
      });
    }

    paintBooks(); paint();
  }).catch(e => { listBox.textContent = '课件清单加载失败：' + e.message; });
}

/* ---------- 学习档案导出 / 导入 ---------- */
const DATA_KEYS = ['kg.mastery', 'kg.wrong', 'kg.review', 'kg.errlog', 'kg.diag.history', 'kg.lastReport', 'kg.subject', 'kg.theme'];
function exportData() {
  const obj = { app: 'k12-kg', version: '3.2', exportedAt: new Date().toISOString(), data: {} };
  DATA_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v != null) obj.data[k] = v; });
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.download = `知识图谱档案_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      if (!obj || obj.app !== 'k12-kg' || !obj.data) throw new Error('不是本应用的备份文件');
      const n = Object.keys(obj.data).length;
      if (!confirm(`将覆盖当前学习数据（${n} 项），确定？`)) return;
      DATA_KEYS.forEach(k => localStorage.removeItem(k));
      Object.entries(obj.data).forEach(([k, v]) => localStorage.setItem(k, v));
      alert('已恢复，页面将重新加载。');
      location.reload();
    } catch (e) {
      alert('导入失败：' + e.message);
    }
  };
  fr.readAsText(file, 'utf-8');
}
function resetData() {
  if (!confirm('确定清空全部学习数据（掌握度/错题/复习/错因）？建议先导出备份。')) return;
  DATA_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}
function renderDataTools() {
  const box = document.getElementById('datatools');
  if (!box) return;
  const m = loadMastery(), w = JSON.parse(localStorage.getItem('kg.wrong') || '[]'),
    r = loadReview(), e = JSON.parse(localStorage.getItem('kg.errlog') || '[]');
  const cs = causeStats();
  const top = Object.entries(cs).sort((a, b) => b[1] - a[1])[0];
  box.innerHTML = `<div class="card">
    <h3 style="margin:0 0 8px;font-size:15px">学习档案</h3>
    <div class="stat" style="margin:0 0 10px">
      <div class="card"><b>${Object.keys(m).length}</b><span>答题过的点</span></div>
      <div class="card"><b>${w.length}</b><span>错题</span></div>
      <div class="card"><b>${Object.keys(r).length}</b><span>复习队列</span></div>
    </div>
    ${top ? `<p class="meta" style="margin:0 0 10px">主要错因：<b>${causeName(top[0])}</b>（${top[1]} 次）——比起刷题，先针对这个原因改。</p>` : ''}
    <p class="meta" style="margin:0 0 10px">数据只存在本机浏览器，换设备或清缓存会丢。建议每周导出一次备份。</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="dExport">导出备份</button>
      <button class="btn ghost" id="dImport">导入恢复</button>
      <button class="btn ghost" id="dReset">清空全部</button>
    </div>
    <input type="file" id="dFile" accept="application/json,.json" style="display:none"></div>`;
  document.getElementById('dExport').onclick = exportData;
  document.getElementById('dReset').onclick = resetData;
  const f = document.getElementById('dFile');
  document.getElementById('dImport').onclick = () => f.click();
  f.onchange = () => { if (f.files && f.files[0]) importData(f.files[0]); f.value = ''; };
}


/* ---------- 图谱 ---------- */
function renderExplore() {
  const qs = new URLSearchParams(location.search);
  const ids = qs.get('ids');
  const sel = document.getElementById('vol');
  if (sel && !sel.dataset.init) {
    sel.innerHTML = ['全部', ...booksOf()].map(b => `<option value="${b}">${b}</option>`).join('');
    sel.dataset.init = '1';
    if (qs.get('vol')) sel.value = qs.get('vol');
    sel.onchange = () => {
      history.replaceState(null, '', 'explore.html?vol=' + encodeURIComponent(sel.value));
      draw();
    };
  }
  const qbox = document.getElementById('q');
  if (qbox && !qbox.dataset.init) {
    qbox.dataset.init = '1';
    let tmr = null;
    qbox.oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 180); };
  }

  function draw() {
    const vol = ids ? '' : (sel ? sel.value : '全部');
    let nodes = ids ? D.topics.filter(t => ids.split(',').includes(t.id))
      : (vol && vol !== '全部' ? topicsOf().filter(t => t.book === vol) : topicsOf());
    const kw = ((document.getElementById('q') || {}).value || '').trim();
    if (kw) nodes = nodes.filter(t => t.name.includes(kw) || (t.desc || '').includes(kw));

    const byCh = chapters(nodes);
    const maxRows = Math.max(1, ...byCh.map(c => c.list.length));
    const gapY = 34, gapX = 235, padX = 20, padY = 54;
    const W = padX * 2 + gapX * (byCh.length - 1) + 250;
    const H = padY + maxRows * gapY + 30;
    const pos = new Map();
    byCh.forEach((c, ci) => c.list.forEach((t, ri) =>
      pos.set(t.id, { x: padX + 80 + ci * gapX, y: padY + ri * gapY })));

    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g id="vp">`;
    byCh.forEach((c, ci) => {
      const x = padX + 80 + ci * gapX;
      svg += `<text x="${x - 70}" y="24" style="font-weight:700;fill:#111">${c.name}</text>`;
      svg += `<text x="${x - 70}" y="40" style="fill:#9aa3af;font-size:11px">${c.list[0].book}</text>`;
    });
    D.edges.forEach((e, i) => {
      if (!pos.has(e.from) || !pos.has(e.to)) return;
      const a = pos.get(e.from), b = pos.get(e.to);
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
      const d = `M${a.x + 8},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x - 8},${b.y}`;
      svg += `<path class="edge" data-i="${i}" data-from="${e.from}" data-to="${e.to}" d="${d}"
        style="opacity:${e.type === 'hard' ? .95 : .45};${e.type === 'soft' ? 'stroke-dasharray:4 4' : ''}"/>`;
    });
    byCh.forEach(c => c.list.forEach(t => {
      const p = pos.get(t.id);
      const mp = loadMastery()[t.id];
      svg += `<g class="node" data-id="${t.id}" transform="translate(${p.x},${p.y})">
        <circle r="6" fill="${mp == null ? (t.stage === '小学' ? '#fef3c7' : '#fff') : mFill(mp)}" stroke="${mp == null ? '#9aa7bd' : mColor(mp)}"></circle>
        <text x="-2" y="-10" style="cursor:pointer">${t.name}</text></g>`;
    }));
    svg += '</g></svg>';

    const wrap = document.getElementById('graphwrap');
    const panel = document.getElementById('detail');
    wrap.innerHTML = svg;
    bindPanZoom(wrap, W, H);

    const show = id => {
      const t = D.byId.get(id);
      wrap.querySelectorAll('.node').forEach(n => n.classList.toggle('sel', n.dataset.id === id));
      const pre = D.pre.get(id).map(e => [e, D.byId.get(e.from)]);
      const post = D.post.get(id).map(e => [e, D.byId.get(e.to)]);
      wrap.querySelectorAll('.node').forEach(n => {
        n.classList.remove('pre', 'post');
        if (pre.some(x => x[1].id === n.dataset.id)) n.classList.add('pre');
        if (post.some(x => x[1].id === n.dataset.id)) n.classList.add('post');
      });
      wrap.querySelectorAll('.edge').forEach(p => {
        const hot = p.dataset.to === id || p.dataset.from === id;
        p.classList.toggle('hot', hot);
      });
      panel.innerHTML = `<div class="card side">
        <h3>${t.name} <span class="tag">${stageLabel(t)}</span></h3>
        <div class="meta">${t.book} · ${t.chapter} · 掌握度 ${Math.round(masteryOf(t.id) * 100)}% · <code>${t.id}</code></div>
        <p>${t.desc ? fmt(t.desc) : ''}</p>
        <div class="row"><b>先修（${pre.length}）</b>
          <div class="chips">${pre.map(([e, x]) =>
            `<span class="chip" data-go="${x.id}">${x.name}${e.type === 'soft' ? ' ·软' : ''}</span>`).join('') || '<span class="meta">无</span>'}</div></div>
        <div class="row"><b>后继（${post.length}）</b>
          <div class="chips">${post.map(([e, x]) =>
            `<span class="chip" data-go="${x.id}">${x.name}${e.type === 'soft' ? ' ·软' : ''}</span>`).join('') || '<span class="meta">无</span>'}</div></div>
        <p><a class="btn" href="diagnose.html?target=${t.id}">诊断这个知识点</a>
          <a class="btn ghost" href="learn.html?topic=${t.id}">看讲解</a></p></div>`;
      panel.querySelectorAll('[data-go]').forEach(el => el.onclick = () => show(el.dataset.go));
    };
    wrap.querySelectorAll('.node').forEach(n => n.onclick = () => show(n.dataset.id));

    // 窄屏（手机）：改用按章折叠列表，避免横向拖动
    if (window.innerWidth < 760) {
      wrap.innerHTML = chapters(nodes).map(c => `<div class="mchap">
        <h4>${c.name} <span class="meta">${c.list[0].book}</span></h4>
        ${c.list.map(t => `<div class="mrow" data-id="${t.id}">
          <span>${t.name}</span><span class="meta">${Math.round(masteryOf(t.id) * 100)}%</span></div>`).join('')}
      </div>`).join('');
      wrap.querySelectorAll('.mrow').forEach(r => r.onclick = () => {
        show(r.dataset.id);
        document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    if (qs.get('id') && D.byId.has(qs.get('id'))) show(qs.get('id'));
    else panel.innerHTML = `<div class="card side meta">共 ${nodes.length} 个知识点。点节点看它的先修与后继：橙=先修，绿=后继，虚线=软先修。</div>`;
  }
  draw();
}

/* ---------- 图谱缩放 / 拖拽 ---------- */
function bindPanZoom(wrap, W, H) {
  const svg = wrap.querySelector('svg');
  const vp = svg && svg.querySelector('#vp');
  if (!vp) return;
  let s = 1, tx = 0, ty = 0;
  const apply = () => vp.setAttribute('transform', `translate(${tx},${ty}) scale(${s})`);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    s = Math.min(2.4, Math.max(0.5, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    apply();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, tx, ty };
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    tx = drag.tx + (e.clientX - drag.x); ty = drag.ty + (e.clientY - drag.y);
    apply();
  });
  window.addEventListener('mouseup', () => { drag = null; svg.style.cursor = ''; });
  svg.addEventListener('dblclick', () => { s = 1; tx = ty = 0; apply(); });
}

/* ---------- 错题重练 ---------- */
const DR = { qs: [], i: 0, ok: 0, bad: 0, done: new Set(), locked: false };

function dropWrong(qid) {
  try {
    const a = JSON.parse(localStorage.getItem(BK.WK) || '[]').filter(x => x.qid !== qid);
    localStorage.setItem(BK.WK, JSON.stringify(a));
  } catch (e) {}
}

function renderDrill() {
  const qs = new URLSearchParams(location.search);
  const topic = qs.get('topic');
  const wrong = JSON.parse(localStorage.getItem(BK.WK) || '[]')
    .filter(x => D.byId.has(x.topic) && (!topic || x.topic === topic));
  const seen = new Set();
  DR.qs = wrong.map(x => (D.questions || []).find(q => q.id === x.qid)).filter(q => q && !seen.has(q.id) && seen.add(q.id));
  for (let i = DR.qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [DR.qs[i], DR.qs[j]] = [DR.qs[j], DR.qs[i]];
  }
  const box = document.getElementById('dbox');
  const bar = document.getElementById('dbar');
  if (!DR.qs.length) {
    bar.innerHTML = '';
    box.innerHTML = `<div class="card"><b>没有可重练的错题</b>
      <p class="meta">先去做一次<a href="diagnose.html">诊断</a>，答错的题会自动进错题本。</p>` +
      (topic && D.byId.get(topic) ? `<p><a class="btn ghost" href="diagnose.html?target=${topic}">诊断「${D.byId.get(topic).name}」</a></p>` : '') +
      `</div>`;
    return;
  }
  document.title = topic ? `重练 · ${D.byId.get(topic).name}` : '重练错题';
  nextDrill();
}

function nextDrill() {
  const box = document.getElementById('dbox');
  const bar = document.getElementById('dbar');
  DR.locked = false;
  if (DR.i >= DR.qs.length) return drillEnd();
  const q = DR.qs[DR.i];
  const t = D.byId.get(q.topic);
  bar.innerHTML = `<div class="pbar"><i style="width:${Math.round(DR.i / DR.qs.length * 100)}%"></i></div>
    <div class="meta">第 ${DR.i + 1} / ${DR.qs.length} 题 · 已对 ${DR.ok} · 还错 ${DR.bad}</div>`;
  const map = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  const opts = map.map(i => q.options[i]);
  const correct = map.indexOf(q.answer);
  box.innerHTML = `<div class="card" data-qid="${q.id}"><div class="meta">${t ? t.name + ' · ' + t.book : ''}</div>
    <div class="stem">${fmt(q.stem)}</div>
    ${figHTML(q)}
    <div class="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}">${'ABCD'[i]}. ${fmt(o)}</button>`).join('')}</div>
    <div class="fb" id="dfb"></div></div>`;
  const pick = i => {
    if (DR.locked) return;
    DR.locked = true;
    const ok = i === correct;
    box.querySelectorAll('.opt').forEach((b, j) => {
      b.disabled = true;
      if (j === correct) b.classList.add('ok');
      if (j === i && !ok) b.classList.add('bad');
    });
    bktUpdate(q.topic, ok);
    if (ok) { DR.ok++; DR.done.add(q.id); dropWrong(q.id); }
    else { DR.bad++; recordWrong(q, q.topic); }
    const fb = document.getElementById('dfb');
    fb.className = 'fb ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = (ok ? '答对了，已移出错题本' : '又错了，保留在错题本') + `（正确：${'ABCD'[correct]}）` +
      (q.explain ? `<br><span class="meta">${fmt(q.explain)}</span>` : '') +
      `<br><button class="btn" id="dnext" style="margin-top:8px">${DR.i + 1 < DR.qs.length ? '下一题 →' : '看结果'}</button>`;
    if (!ok) causeRow(q.id, q.topic, '#dbox .card');
    document.getElementById('dnext').onclick = () => { DR.i++; nextDrill(); };
  };
  box.querySelectorAll('.opt').forEach(btn => btn.onclick = () => pick(+btn.dataset.i));
}

function drillEnd() {
  const total = DR.qs.length;
  document.getElementById('dbar').innerHTML = '';
  document.getElementById('dbox').innerHTML = `<div class="card"><h3 style="margin-top:0">重练完成</h3>
    <p>共 ${total} 道：答对 <b class="ok">${DR.ok}</b> 道，仍错 <b class="bad">${DR.bad}</b> 道。</p>
    <p class="meta">答对的题已自动移出错题本，掌握度也同步更新。</p>
    <p><a class="btn" href="wrong.html">回错题本</a>
    <button class="btn ghost" onclick="location.reload()">再来一轮</button>
    <a class="btn ghost" href="index.html">回首页</a></p></div>`;
}

/* ---------- 诊断 ---------- */
const DG = { target: null, asked: 0, log: [], passed: new Set(), used: new Set(), root: null, done: false, MAX: 12 };

function pickQ(id, forceLevel) {
  const all = D.qByTopic.get(id) || [];
  if (!all.length) return null;
  const fresh = all.filter(q => !DG.used.has(q.id));
  const pool = (fresh.length ? fresh : all).slice();
  const p = masteryOf(id);
  const want = forceLevel || (p < 0.4 ? 1 : p < 0.7 ? 2 : 3);
  pool.sort((a, b) => Math.abs((a.level || 1) - want) - Math.abs((b.level || 1) - want));
  return pool[0];
}

function hardPre(id) {
  return D.pre.get(id).filter(e => e.type === 'hard').map(e => D.byId.get(e.from)).filter(Boolean);
}

function bfsPath(from, to) {
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    (D.post.get(cur) || []).forEach(e => {
      if (!prev.has(e.to)) { prev.set(e.to, cur); q.push(e.to); }
    });
  }
  if (!prev.has(to)) return [D.byId.get(from), D.byId.get(to)];
  const path = [];
  for (let c = to; c != null; c = prev.get(c)) path.unshift(D.byId.get(c));
  return path;
}

function dgReset() {
  DG.asked = 0; DG.log = []; DG.passed = new Set(); DG.used = new Set(); DG.root = null; DG.done = false;
  document.getElementById('result').innerHTML = '';
  document.getElementById('progress').textContent = '';
}

function beginDiagnose(targetId) {
  DG.target = targetId;
  dgReset();
  document.getElementById('picker').style.display = 'none';
  document.getElementById('qbox').style.display = 'block';
  dgNode(targetId).then(() => {
    if (DG.passed.has(targetId)) return dgFinish('mastered');
    dgFinish(DG.root ? 'root' : 'limit');
  });
}

/* 递归下钻：某点答错 → 逐个硬先修往下测；先修都过 → 该点即根因 */
async function dgNode(id) {
  if (DG.asked >= DG.MAX) return false;
  const q = pickQ(id);
  let ok = false, confirmed = false;
  if (q) {
    ok = await dgAsk(q, D.byId.get(id));
    // 二次确认：该点还有别的题时，再问一题，两题都对才算会，降低单题误判
    if (!ok && (D.qByTopic.get(id) || []).length > 1 && DG.asked < DG.MAX) {
      const q2 = pickQ(id, true);
      if (q2) ok = await dgAsk(q2, D.byId.get(id));
      confirmed = ok;
    }
    DG.log.push({ id, ok, confirmed });
  }
  if (ok) { DG.passed.add(id); return true; }

  const pres = hardPre(id).filter(p => !DG.passed.has(p.id));
  let allPass = true;
  for (const p of pres) {
    if (DG.asked >= DG.MAX) { allPass = false; break; }
    const okp = await dgNode(p.id);
    if (!okp) { allPass = false; break; }
  }
  if (allPass && !DG.root) DG.root = id;
  return false;
}

function dgAsk(q, topic) {
  return new Promise(resolve => {
    DG.asked++;
    DG.used.add(q.id);
    document.getElementById('progress').innerHTML =
      `第 ${DG.asked} 题 · 正在测：<b>${topic.name}</b> <span class="tag">${topic.book}</span>`;
    // 选项乱序：避免靠选项位置蒙对、避免答案集中在 A
    const map = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
    const opts = map.map(i => q.options[i]);
    const correct = map.indexOf(q.answer);
    const box = document.getElementById('qbox');
    box.innerHTML = `<div class="card" data-qid="${q.id}"><div class="meta">${topic.chapter}</div>
      <div class="stem">${fmt(q.stem)}</div>
      ${figHTML(q)}
      <div class="opts">${opts.map((o, i) =>
        `<button class="opt" data-i="${i}">${'ABCD'[i]}. ${fmt(o)}</button>`).join('')}</div>
      <div class="meta" style="margin-top:8px">按 1—4 可直接作答</div>
      <div class="fb" id="fb"></div></div>`;
    let locked = false;
    const pick = i => {
      if (locked) return;
      locked = true;
      document.removeEventListener('keydown', onKey);
      const ok = i === correct;
      box.querySelectorAll('.opt').forEach((b, j) => {
        b.disabled = true;
        if (j === correct) b.classList.add('ok');
        if (j === i && !ok) b.classList.add('bad');
      });
      const p = bktUpdate(topic.id, ok);
      if (!ok) recordWrong(q, topic.id);
      const fb = document.getElementById('fb');
      fb.className = 'fb ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = (ok ? '答对了' : '答错了') + `（正确：${'ABCD'[correct]}）` +
        (q.explain ? `<br><span class="meta">${fmt(q.explain)}</span>` : '') +
        `<br><span class="meta">该知识点掌握度 ${Math.round(p * 100)}%</span>`;
      let settled = false;
      const done = () => { if (settled) return; settled = true; resolve(ok); };
      if (!ok) causeRow(q.id, topic.id, '#qbox .card', done);
      setTimeout(done, ok ? 650 : 3000);
    };
    const onKey = e => {
      const n = +e.key;
      if (n >= 1 && n <= opts.length) pick(n - 1);
    };
    document.addEventListener('keydown', onKey);
    box.querySelectorAll('.opt').forEach(btn => btn.onclick = () => pick(+btn.dataset.i));
  });
}

function dgFinish(kind) {
  DG.done = true;
  document.getElementById('qbox').style.display = 'none';
  const t = D.byId.get(DG.target);
  let html = '';
  if (kind === 'mastered') {
    html = `<div class="card"><h3>结论：这个知识点你已经掌握</h3>
      <p>共 ${DG.log.length} 题全部答对，没有发现需要回补的先修。可以直接看后继：</p>
      <div class="chips">${(D.post.get(t.id) || []).map(e =>
        `<a class="chip" href="diagnose.html?target=${e.to}">${D.byId.get(e.to).name}</a>`).join('') || '<span class="meta">暂无</span>'}</div>
      <p><button class="btn ghost" onclick="exportReport()">保存报告图片</button>
      <a class="btn" href="report.html">打开正式报告</a>
      <a class="btn ghost" href="learn.html?topic=${t.id}">看讲解</a></p>
      <p class="note">若仍觉得吃力，可能是抽到的题偏简单，可换同章其他点再测。</p></div>`;
  } else {
    const root = D.byId.get(DG.root || t.id);
    const path = bfsPath(root.id, t.id);
    html = `<div class="card"><h3>根因：${root.name} <span class="tag">${root.book}</span></h3>
      <p>${root.desc ? fmt(root.desc) : ''}</p>
      <div class="meta">共测 ${DG.log.length} 题，答错 ${DG.log.filter(l => !l.ok).length} 题 · 该点掌握度 ${Math.round(masteryOf(t.id) * 100)}%${kind === 'limit' ? '（已达题量上限，结论可能不完整）' : ''}</div>
      <h3 style="margin-top:18px;font-size:16px">建议学习顺序（${path.length} 步）</h3>
      <ol class="path">${path.map(x =>
        `<li><div><b>${x.name}</b><small>${x.book} · ${x.chapter}</small></div>
        <a class="meta" style="margin-left:auto" href="learn.html?topic=${x.id}">讲解</a></li>`).join('')}</ol>
      <p><a class="btn" href="explore.html?id=${root.id}">在图谱里看它的位置</a>
      <a class="btn" href="report.html">打开正式报告</a>
      <button class="btn ghost" onclick="exportReport()">保存报告图片</button>
      <button class="btn ghost" onclick="location.reload()">重测</button></p></div>`;
  }
  document.getElementById('progress').innerHTML =
    `排查路径：${DG.log.map(l => `${D.byId.get(l.id).name}${l.ok ? (l.confirmed ? '✓(复核)' : '✓') : '✗'}`).join(' → ')}`;
  document.getElementById('result').innerHTML = html;
  saveHistory(kind === 'mastered' ? null : (DG.root || t.id), t.id);
  saveLastReport(kind === 'mastered');
}

function saveLastReport(mastered) {
  try {
    const t = D.byId.get(DG.target);
    const root = DG.root ? D.byId.get(DG.root) : null;
    const rec = {
      at: Date.now(),
      subject: SUBJ,
      target: t.id,
      root: mastered ? null : (root ? root.id : t.id),
      mastered: !!mastered,
      asked: DG.log.length,
      wrong: DG.log.filter(l => !l.ok).length,
      path: mastered ? [t.id] : bfsPath((root ? root.id : t.id), t.id).map(x => x.id),
      log: DG.log.map(l => ({ id: l.id, ok: l.ok, confirmed: !!l.confirmed }))
    };
    localStorage.setItem('kg.lastReport', JSON.stringify(rec));
  } catch (e) {}
}

/* ---------- 报告导出（纯 canvas，无依赖） ---------- */
function exportReport() {
  const t = D.byId.get(DG.target);
  const mastered = DG.passed.has(DG.target);
  const root = mastered ? t : D.byId.get(DG.root || t.id);
  const path = mastered ? [t] : bfsPath(root.id, t.id);
  const wrong = DG.log.filter(l => !l.ok).length;
  const W = 900, H = 300 + path.length * 52 + 70;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2563eb'; g.fillRect(0, 0, W, 8);
  g.fillStyle = '#1f2328'; g.font = 'bold 30px "Microsoft YaHei",sans-serif';
  g.fillText('数学学习断层诊断报告', 48, 76);
  g.font = '15px "Microsoft YaHei",sans-serif'; g.fillStyle = '#6b7280';
  g.fillText(new Date().toLocaleString('zh-CN'), 48, 106);
  g.fillText(`共测 ${DG.log.length} 题，答错 ${wrong} 题`, 48, 130);

  g.fillStyle = '#f1f5fb'; g.fillRect(36, 152, W - 72, 96);
  g.fillStyle = '#6b7280'; g.font = '14px "Microsoft YaHei",sans-serif';
  g.fillText('诊断目标', 56, 180);
  g.fillStyle = '#1f2328'; g.font = 'bold 20px "Microsoft YaHei",sans-serif';
  g.fillText(`${t.name}（${t.book}·${t.chapter}）`, 56, 208);
  g.fillStyle = '#c2410c'; g.font = 'bold 22px "Microsoft YaHei",sans-serif';
  g.fillText(mastered ? '根因：未发现断层（该点已掌握）' : `根因：${root.name}（${root.book}）`, 56, 236);

  g.fillStyle = '#1f2328'; g.font = 'bold 18px "Microsoft YaHei",sans-serif';
  g.fillText(`建议学习顺序（${path.length} 步）`, 48, 292);
  let y = 328;
  path.forEach((x, i) => {
    g.fillStyle = '#2563eb'; g.font = 'bold 16px "Microsoft YaHei",sans-serif';
    g.fillText(`${i + 1}.`, 52, y);
    g.fillStyle = '#1f2328'; g.font = '16px "Microsoft YaHei",sans-serif';
    g.fillText(x.name, 80, y);
    g.fillStyle = '#9aa3af'; g.font = '13px "Microsoft YaHei",sans-serif';
    g.fillText(`${x.book} · ${x.chapter}`, 80, y + 20);
    g.strokeStyle = '#e3e6ea'; g.beginPath();
    g.moveTo(48, y + 32); g.lineTo(W - 48, y + 32); g.stroke();
    y += 52;
  });
  g.fillStyle = '#9aa3af'; g.font = '13px "Microsoft YaHei",sans-serif';
  g.fillText('依据先修关系生成，仅作补学顺序参考，不替代教师判断。', 48, H - 30);

  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.download = `诊断报告_${t.name}_${stamp}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

/* ---------- 本地存档 ---------- */
const HK = 'kg.diag.history';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HK) || '[]'); } catch (e) { return []; }
}
function saveHistory(rootId, targetId) {
  try {
    const a = loadHistory();
    a.unshift({ rootId, targetId, at: Date.now() });
    localStorage.setItem(HK, JSON.stringify(a.slice(0, 20)));
  } catch (e) { /* 隐私模式忽略 */ }
}

function initPicker() {
  const sel = document.getElementById('target');
  const byBook = new Map();
  chapters().forEach(c => {
    const b = c.list[0].book;
    if (!byBook.has(b)) byBook.set(b, []);
    byBook.get(b).push(c);
  });
  sel.innerHTML = [...byBook].map(([b, cs]) =>
    `<optgroup label="${b}">${cs.map(c =>
      `<optgroup label="　${c.name}">${c.list.map(t =>
        `<option value="${t.id}">${t.name}</option>`).join('')}</optgroup>`).join('')}</optgroup>`).join('');
  document.getElementById('start').onclick = () => beginDiagnose(sel.value);
}
