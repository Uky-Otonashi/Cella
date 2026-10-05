/* Cella 前端: 虚拟滚动表格 + 冻结行列 + 列拖序/显隐 + 多条件筛选(含颜色) + 双主题 */
'use strict';

/* ================= utils ================= */
const $ = (s) => document.querySelector(s);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function esc(s) { return String(s); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const mctx = document.createElement('canvas').getContext('2d');
const FONT = '12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
const FONT_B = '600 12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
function textW(s, bold) {
  mctx.font = bold ? FONT_B : FONT;
  return mctx.measureText(s).width;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;
  const s = String(v).replace(/[,，\s]/g, '');
  return /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
}
function toast(msg, kind) {
  const nd = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
  $('#toasts').appendChild(nd);
  setTimeout(() => nd.remove(), 3600);
}

/* ================= bridge ================= */
let HAS_BRIDGE = false;
function callApi(name, ...args) {
  if (HAS_BRIDGE && window.pywebview && window.pywebview.api && window.pywebview.api[name]) {
    return window.pywebview.api[name](...args);
  }
  return null;
}
window.addEventListener('pywebviewready', () => { HAS_BRIDGE = true; console.log('[xv] bridge ready'); });
// --selftest 自检通道: 验证 js_api 桥是否真正可用
window.addEventListener('pywebviewready', () => {
  if (!/selftest/.test(location.hash + location.search)) return;
  setTimeout(async () => {
    try {
      const keys = Object.keys(window.pywebview.api || {});
      console.log('[selftest] api methods: [' + keys.join(',') + ']');
      const r = await Promise.race([
        window.pywebview.api.selftest_report('PING'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT-5s')), 5000)),
      ]);
      console.log('[selftest] bridge OK, echo=' + r);
    } catch (e) {
      console.log('[selftest] bridge FAIL: ' + e.message);
    }
  }, 800);
});
setTimeout(() => {
  if (!window.pywebview) {
    // 浏览器 dev 模式
    $('#btn-mock').style.display = '';
    $('#btn-open').disabled = true;
    $('#btn-theme').style.display = 'none';
  }
}, 600);

/* ================= state ================= */
let FILES = [];            // 已打开文件会话: [{data(后端load返回), si(当前sheet), views(每sheet视图)}]
let FI = 0;                // 当前文件索引
let visRows = [];         // 筛选后可见行索引(原行号)
let rowH = [];            // 行高缓存(全部行, 含冻结行)
let rowTops = [];         // 非冻结区行前缀和
let dirtyHeights = true;  // 行高缓存失效标记

function curFile() { return FILES[FI] || null; }
function sheet() { const f = curFile(); return f ? f.data.sheets[f.si] : null; }
function view() { const f = curFile(); return f ? f.views[f.si] : null; }
function visibleCols() { const v = view(); return v.order.filter((c) => !v.hiddenSet.has(c)); }
function rowSeq() {
  const v = view(), sh = sheet();
  if (!v.rowOrder || v.rowOrder.length !== sh.rows.length) {
    v.rowOrder = Array.from({ length: sh.rows.length }, (_, i) => i);
  }
  if (v.titleRow != null) {
    // 标题行永远置顶显示。不物化进 rowOrder(取消标题行才能自动归位);
    // 排序物化后 rowOrder[0] 已是标题行, 走幂等分支
    if (v.rowOrder[0] === v.titleRow) return v.rowOrder;
    return [v.titleRow].concat(v.rowOrder.filter((ri) => ri !== v.titleRow));
  }
  return v.rowOrder;
}
function colIsNumeric(origIdx) {
  const sh = sheet();
  let num = 0, tot = 0;
  const n = Math.min(sh.rows.length, 800);
  for (let i = 0; i < n; i++) {
    const v = sh.rows[i][origIdx][0];
    if (v === '' || v === null) continue;
    tot++;
    if (typeof v === 'number' || !isNaN(toNum(v))) num++;
  }
  return tot > 0 && num / tot >= 0.6;
}

function excelColLetter(ci) {
  let i = ci + 1, s = '';
  while (i > 0) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
function cleanHeadName(s) {
  // 列头文本清洗: 去换行/制表/控制符/零宽字符(空格原样保留), 供下拉/标签显示完整列名
  return String(s).replace(/[\x00-\x1f\u200b-\u200d\ufeff]/g, '');
}
function headRowOf(v) {
  // 当前作为表头(列名来源/表头样式)的原始行号: 手动标题行 > 首行
  return v.titleRow != null ? v.titleRow : 0;
}
function isHeadRow(ri) {
  const v = view();
  return v ? (v.titleRow != null ? ri === v.titleRow : ri === 0) : ri === 0;
}
function frozenRows(v) {
  // 显示上冻结的行数(常规冻结 + 标题行)
  return v.freezeRow + (v.titleRow != null ? 1 : 0);
}
function firstContentRow() {
  const v = view();
  return v.titleRow != null ? v.titleRow : (v.hasHeader ? 1 : 0);
}
function rowNumLabel(ri) {
  // 行号显示: 有标题行时它不计号(总行数-1), 其余行跳过它连续编号; 标题行自身显示 ▤
  const v = view();
  if (v.titleRow != null) {
    if (ri === v.titleRow) return '▤';
    return String(ri > v.titleRow ? ri : ri + 1);
  }
  return String(ri + 1);
}
function colName(ci) {
  // 列名: 表头行文本(去控制符/零宽字符)优先, 空才退回字母。
  // 不再依赖 v.hasHeader——T015 起自动判定已删, 普通有表头文件 hasHeader=false,
  // 若走字母会让筛选/排序下拉等全部退化为 A-Z(第十批反馈 5)
  const v = view(), sh = sheet();
  if (v && sh && sh.rows.length) {
    const s = cleanHeadName(String(sh.rows[headRowOf(v)][ci] ? sh.rows[headRowOf(v)][ci][0] : ''));
    if (s) return s;
  }
  return excelColLetter(ci);
}

function newView(sh) {
  // 冻结范围只来自文件自带(不做首行表头自动判定); 表头语义(hasHeader)只来自手动"设为标题行"
  return {
    order: sh.nCols ? Array.from({ length: sh.nCols }, (_, i) => i) : [],
    hiddenSet: new Set(),
    colW: {},                       // origIdx -> px
    freezeRow: sh.freezeRow || 0,
    freezeCol: sh.freezeCol || 0,
    hasHeader: false,               // 仅手动标题行; 未设时首行是普通数据行(列名显示字母)
    filters: {},                    // origIdx -> {conds:[{op,val}], colors:[], values:{include:[...]}|null}
    align: {},                      // origIdx -> 'left'|'center'|'right'
    rowH: {},                       // rowIdx(原行号) -> px 手动行高(优先于估算)
    measuredH: {},                  // rowIdx(原行号) -> px 实测修正(渲染后测量, 持久)
    rowOrder: null,                  // 行显示顺序(原行号数组), null=原序
    rowAlign: {},                   // rowIdx -> 'left'|'center'|'right' (优先于列对齐)
    numCols: {},                    // origIdx -> bool 缓存
    colNatW: {},                    // origIdx -> px 列内容单行自然宽(压缩判定用, 缓存)
    lastW: {},                      // origIdx -> px 拖拽隐藏前的宽度(拉出时备用)
    selCell: null,                  // {ri, ci} 选中的单元格(多选时的锚点)
    colSel: new Set(),              // 多选列头(origIdx), 批量拖拽排序用
    selRanges: null,                // 多选矩形 [{r1,c1,r2,c2}](原始行列号闭区间; 离散格=单格矩形)
    sorts: [],                      // 多级排序 [{col, dir:'asc'|'desc'}](结果物化进 rowOrder, 此处仅作指示/清除恢复)
    rowOrderPreSort: null,          // 首次排序前的行序(清除排序时恢复), null=原序
    titleRow: null,                 // 手动标题行(原始行号): 永久置顶冻结/不计行号/列名来源
    titlePre: null,                 // 设标题行前的 {freezeRow, hasHeader, took}(取消时按 took 逆转转入)
    frozenMoved: null,              // Set<原行号>: "加入冻结区"移动过的行(取消冻结时仅这些归位, 原地冻结的保持现位)
    frozenColMoved: null,           // Set<origIdx>: 同上(列)
  };
}

/* ================= 度量 ================= */
const ROWNUM_W = 46;
const COLW_MIN = 40, COLW_MAX = 460, ROWH_MIN = 18, ROWH_MAX = 320;
const SVG_MIN = '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M0.5 5.5 H10.5" stroke="currentColor" stroke-width="1.1"/></svg>';
const SVG_MAX = '<svg width="11" height="11" viewBox="0 0 11 11"><rect x="0.5" y="0.5" width="10" height="10" fill="none" stroke="currentColor"/></svg>';
const SVG_RESTORE = '<svg width="11" height="11" viewBox="0 0 11 11"><rect x="0.5" y="2.5" width="8" height="8" fill="none" stroke="currentColor"/><path d="M2.5 2.5 V0.5 H10.5 V8.5 H8.5" fill="none" stroke="currentColor"/></svg>';
const SVG_CLOSE = '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" stroke-width="1.1"/></svg>';
const MIN_W = 72, MAX_W = 420, PAD_X = 26;
const COMPRESS_RATIO = 0.55;   // 列宽低于内容自然宽的此比例 → 压缩态(头...尾省略)
const DRAG_DEAD = 3;           // 尺寸拖拽提交死区(px): 死区内视为点击, 不提交
function colNatWidth(origIdx) {
  // 列内容单行自然宽度(含首行粗体), 不夹紧; 压缩判定与自适应列宽共用
  const v = view();
  if (!(origIdx in v.colNatW)) {
    const sh = sheet();
    let w = 0;
    const n = Math.min(sh.rows.length, 3000);
    for (let i = 0; i < n; i++) {
      const val = sh.rows[i][origIdx][0];
      if (val === '' || val === null) continue;
      for (const line of String(val).split('\n')) {
        const lw = textW(line, isHeadRow(i));
        if (lw > w) w = lw;
      }
    }
    v.colNatW[origIdx] = Math.ceil(w) + PAD_X;
  }
  return v.colNatW[origIdx];
}
function autoColWidth(origIdx) {
  return clamp(colNatWidth(origIdx), MIN_W, MAX_W);
}
function isCompressed(origIdx) {
  return colWidth(origIdx) < Math.max(MIN_W, Math.min(colNatWidth(origIdx), MAX_W)) * COMPRESS_RATIO;
}
function midTrunc(s, avail) {
  // 中间省略: 头部 + … + 尾部, 按可用宽度 62/38 分配(极窄时尾部收缩到 0, 保证有头部)
  if (!s || textW(s) <= avail) return s;
  const ell = '…';
  const body = Math.max(0, avail - textW(ell));
  const fit = (make, w) => {
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (textW(make(m)) <= w) lo = m; else hi = m - 1;
    }
    return make(lo);
  };
  return fit((n) => s.slice(0, n), body * 0.62) + ell + fit((n) => (n > 0 ? s.slice(-n) : ''), body * 0.38);
}
function colWidth(origIdx) {
  const v = view();
  if (!(origIdx in v.colW)) v.colW[origIdx] = autoColWidth(origIdx);
  const w = v.colW[origIdx];
  return Number.isFinite(w) && w > 0 ? w : 90;
}
function estLines(text, availW) {
  const lines = String(text).split('\n');
  let total = 0;
  for (const line of lines) {
    if (!line) { total++; continue; }
    total += Math.max(1, Math.ceil(textW(line, false) / Math.max(12, availW)));
  }
  return Math.min(total, 40);
}
function calcRowHeight(ri) {
  const sh = sheet();
  const row = sh.rows[ri];
  const cols = visibleCols();
  let maxLines = 1;
  for (const ci of cols) {
    if (isCompressed(ci)) continue;   // 压缩列单行省略显示, 不参与行高估算
    const v = row[ci][0];
    if (v === '' || v === null) continue;
    maxLines = Math.max(maxLines, estLines(v, colWidth(ci) - 20));
  }
  const bold = isHeadRow(ri) ? 1 : 0;
  return Math.max(30, Math.ceil(maxLines * (17.5 + bold)) + 13);
}
function ensureHeights() {
  const sh = sheet();
  if (!dirtyHeights && rowH.length === sh.rows.length) return;
  const v = view();
  rowH = new Array(sh.rows.length);
  for (let i = 0; i < sh.rows.length; i++) {
    const manual = v.rowH[i];
    const est = (Number.isFinite(manual) && manual >= ROWH_MIN) ? manual : calcRowHeight(i);
    const meas = v.measuredH[i] || 0;
    rowH[i] = Math.max(est, meas);
  }
  dirtyHeights = false;
}

function resetHeights(v) {
  // 列宽/显隐/顺序变化: 估算基础变了, 实测修正缓存随之失效
  v.measuredH = {};
  dirtyHeights = true;
}
function frozenHeight() {
  const v = view();
  ensureHeights();
  const seq = rowSeq();
  const n = Math.min(frozenRows(v), seq.length);
  let h = 0;
  for (let k = 0; k < n; k++) h += rowH[seq[k]];
  return h;
}

/* ================= 筛选 ================= */
function matchCond(c, v) {
  const s = v === null || v === undefined ? '' : String(v);
  const val = c.val == null ? '' : String(c.val);
  switch (c.op) {
    case 'contains': return s.toLowerCase().includes(val.toLowerCase());
    case 'not_contains': return !s.toLowerCase().includes(val.toLowerCase());
    case 'equals': {
      const n1 = toNum(v), n2 = toNum(val);
      if (!isNaN(n1) && !isNaN(n2) && val.trim() !== '') return n1 === n2;
      return s === val;
    }
    case 'not_equals': {
      const n1 = toNum(v), n2 = toNum(val);
      if (!isNaN(n1) && !isNaN(n2) && val.trim() !== '') return n1 !== n2;
      return s !== val;
    }
    case 'starts': return s.toLowerCase().startsWith(val.toLowerCase());
    case 'ends': return s.toLowerCase().endsWith(val.toLowerCase());
    case 'empty': return s.trim() === '';
    case 'not_empty': return s.trim() !== '';
    case 'gt': case 'lt': case 'gte': case 'lte': case 'eq': case 'ne': {
      const n1 = toNum(v), n2 = toNum(val);
      if (isNaN(n1) || isNaN(n2)) return false;
      switch (c.op) {
        case 'gt': return n1 > n2; case 'lt': return n1 < n2;
        case 'gte': return n1 >= n2; case 'lte': return n1 <= n2;
        case 'eq': return n1 === n2; case 'ne': return n1 !== n2;
      }
    }
  }
  return true;
}
function applyFilters() {
  const sh = sheet(), v = view();
  if (!sh || !v) { visRows = []; return; }
  visRows = computeVisRows(sh, v);
}

function computeVisRows(sh, v) {
  // 按 view 的筛选与行序计算可见行(供当前 sheet 渲染与跨 sheet 搜索复用)
  const active = Object.entries(v.filters).filter(([, f]) => (f.conds && f.conds.length) || (f.colors && f.colors.length) || (f.values && f.values.include));
  const seq = (v.rowOrder && v.rowOrder.length === sh.rows.length)
    ? v.rowOrder : Array.from({ length: sh.rows.length }, (_, i) => i);
  const hasSel = v.selRanges && v.selRanges.length;
  if (!active.length && v.titleRow == null) {
    return seq.slice();
  }
  const out = [];
  for (const i of seq) {
    if (v.titleRow === i) { out.push(i); continue; }   // 标题行不参与筛选, 恒显示
    if (!active.length) { out.push(i); continue; }     // 无筛选条件: 选区不限显示(仅限搜索/复制)
    if (hasSel && !inSelRows(v, i)) continue;          // 有筛选+有选区: 仅选中行参与筛选
    let pass = true;
    for (const [colKey, f] of active) {
      const ci = Number(colKey);
      const cell = sh.rows[i][ci];
      if (f.conds) for (const c of f.conds) { if (!matchCond(c, cell[0])) { pass = false; break; } }
      if (!pass) break;
      if (f.colors && f.colors.length) {
        const color = cell[1] >= 0 ? sh.palette[cell[1]] : 'none';
        if (!f.colors.includes(color)) { pass = false; break; }
      }
      const inc = f.values && f.values.include;
      if (inc && inc.length) {
        const sv = cell[0] === null || cell[0] === undefined ? '' : String(cell[0]);
        if (!inc.includes(sv)) { pass = false; break; }
      }
    }
    if (pass) out.push(i);
  }
  return out;
}

/* ================= 选区(框选/多选) ================= */
function normRect(r1, c1, r2, c2) {
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}
function inSelRows(v, ri) {
  for (const rg of v.selRanges) {
    if (ri >= rg.r1 && ri <= rg.r2) return true;
  }
  return false;
}
function inSelCell(v, ri, ci) {
  if (!v.selRanges) return false;
  for (const rg of v.selRanges) {
    if (ri >= rg.r1 && ri <= rg.r2 && ci >= rg.c1 && ci <= rg.c2) return true;
  }
  return false;
}
function selCellCount(v) {
  let n = 0;
  for (const rg of (v.selRanges || [])) n += (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1);
  return n;
}
function clearSelAll() {
  const v = view();
  if (!v) return;
  const hadSel = v.selCell || (v.selRanges && v.selRanges.length);
  v.selRanges = null;
  setSelCell(null);
  if (hadSel) {
    document.querySelectorAll('.cell.msel').forEach((c) => c.classList.remove('msel', 'm-e-t', 'm-e-b', 'm-e-l', 'm-e-r'));
    updateStatus();
  }
}
function refreshSelDom() {
  // 重渲染后恢复多选高亮(基于原始行列号, 行序变化选择跟行走)。
  // 边框: 每格按"四邻是否也在选区"加 m-e-* 类, ::before 四边虚线仅边界边显色
  // —— 连续区域只画最外层虚线框, 内部不重复描边; 单格=四边全画。
  document.querySelectorAll('.cell.msel').forEach((c) => c.classList.remove('msel', 'm-e-t', 'm-e-b', 'm-e-l', 'm-e-r'));
  const v = view();
  if (!v || !v.selRanges || !v.selRanges.length) return;
  const cols = visibleCols();
  // 边缘自动滚会让选区扩到几千行且每帧刷新: 渲染行/列映射一次建好,
  // 未渲染行 O(1) 跳过(原先每格一次 querySelector+indexOf, 大选区拖滚必卡)
  const diOf = new Map();
  cols.forEach((ci, i) => diOf.set(ci, i));
  const rowEls = {};
  document.querySelectorAll('.vrow[data-ri]').forEach((r) => { rowEls[r.dataset.ri] = r; });
  for (const rg of v.selRanges) {
    for (let ri = rg.r1; ri <= rg.r2; ri++) {
      const rowEl = rowEls[ri];
      if (!rowEl) continue;
      for (let ci = rg.c1; ci <= rg.c2; ci++) {
        const di = diOf.get(ci);
        if (di === undefined) continue;
        const c = rowEl.querySelector('.cell[data-di="' + di + '"]');
        if (!c || c.classList.contains('hcell') || c.classList.contains('rownum')) continue;
        c.classList.add('msel');
        if (!inSelCell(v, ri - 1, ci)) c.classList.add('m-e-t');
        if (!inSelCell(v, ri + 1, ci)) c.classList.add('m-e-b');
        if (!inSelCell(v, ri, ci - 1)) c.classList.add('m-e-l');
        if (!inSelCell(v, ri, ci + 1)) c.classList.add('m-e-r');
      }
    }
  }
}

function removePointRect(ranges, ri, ci) {
  // 移除恰好等于该单格的矩形(ctrl 减选离散格; 大矩形内部的格不拆分)
  const out = (ranges || []).filter((rg) => !(rg.r1 === ri && rg.r2 === ri && rg.c1 === ci && rg.c2 === ci));
  return out.length ? out : null;
}

function syncColSelToRanges() {
  // 列头选择(colSel, 为批量拖拽排序服务)映射为整列内容选区(不含标题行/表头行)
  const v = view();
  const sh = sheet();
  if (!v || !sh) return;
  if (!v.colSel.size) { v.selRanges = null; return; }
  const fR = firstContentRow();
  const lR = sh.rows.length - 1;
  if (lR < fR) { v.selRanges = null; return; }
  v.selRanges = Array.from(v.colSel).map((ci) => ({ r1: fR, c1: ci, r2: lR, c2: ci }));
}

/* ---- 框选拖拽(marquee) ---- */
let marquee = null;   // {mode:'cell'|'row', aRi, aCi, base(按下时的 ranges 快照), x0, y0}
let marqueeRaf = false;
let marqueePt = null;        // 拖拽中最近一次鼠标位置: 边缘自动滚期间无 mousemove, 靠它反查落点
let marqueeAutoOn = false;   // 边缘自动滚 rAF 循环在跑(离开边缘/松手/滚到边界自然停)
const EDGE_ZONE = 24, EDGE_SPD_MIN = 6, EDGE_SPD_MAX = 18;   // 边缘判定宽度(px)/滚动速度(px/帧, 越近越快)
let downPt = null;    // 最近一次 grid mousedown 坐标: click 与 mousedown 偏移>4px = 拖拽结束的
                      // 合成 click(target 是公共祖先/落点格), 不得当"点击"处理(否则框选被误杀)
function isDragEndClick(e) {
  return !!(downPt && (Math.abs(e.clientX - downPt.x) > 4 || Math.abs(e.clientY - downPt.y) > 4));
}
// 任何 mousedown 都刷新落点(capture): click 判定"是否拖拽结束"必须用本次按下的坐标,
// 用过期坐标会把普通按钮点击误判成拖拽
document.addEventListener('mousedown', (e) => { downPt = { x: e.clientX, y: e.clientY }; }, true);
function marqueeDomUpdate() {
  if (marqueeRaf) return;
  marqueeRaf = true;
  requestAnimationFrame(() => { marqueeRaf = false; refreshSelDom(); updateStatus(); });
}
function marqueeAnchorScreen() {
  // 锚点格(按下格)的当前屏幕位置: 滚动后预览矩形仍贴住锚点格, 而不是留在按下时的屏幕点
  const g = grid(), gr = g.getBoundingClientRect();
  const v = view();
  ensureHeights();
  const seq = rowSeq();
  const posOf = {};
  seq.forEach((r, i) => { posOf[r] = i; });
  const nF = Math.min(frozenRows(v), seq.length);
  let y;
  if (posOf[marquee.aRi] !== undefined && posOf[marquee.aRi] < nF) {
    y = 0;
    for (let k = 0; k < posOf[marquee.aRi]; k++) y += rowH[seq[k]];
  } else {
    const body = visRows.filter((r) => (posOf[r] !== undefined ? posOf[r] : -1) >= nF);
    const bi = body.indexOf(marquee.aRi);
    if (bi < 0) return { x: marquee.x0, y: marquee.y0 };   // 行不在可见序列(防御): 退回按下点
    y = frozenHeight();
    for (let i = 0; i < bi; i++) y += rowH[body[i]];
  }
  let x = ROWNUM_W;
  if (marquee.mode !== 'row') {
    const cols = visibleCols();
    for (let j = 0; j < cols.length; j++) {
      if (cols[j] === marquee.aCi) break;
      x += colWidth(cols[j]);
    }
  }
  return { x: gr.left + x - g.scrollLeft, y: gr.top + y - g.scrollTop };
}
function marqueePreview(px, py) {
  // 拖拽范围预览: 锚点格到鼠标当前位置的虚线矩形(fixed 层, 不参与命中)
  let pv = $('#sel-preview');
  if (!pv) {
    pv = el('div');
    pv.id = 'sel-preview';
    document.body.appendChild(pv);
  }
  const a = marqueeAnchorScreen();
  pv.style.display = 'block';
  pv.style.left = Math.min(a.x, px) + 'px';
  pv.style.top = Math.min(a.y, py) + 'px';
  pv.style.width = Math.abs(px - a.x) + 'px';
  pv.style.height = Math.abs(py - a.y) + 'px';
}
function cellFromPointEl(target) {
  const cellEl = target && target.closest ? target.closest('.cell') : null;
  if (!cellEl) return null;
  const row = cellEl.closest('.vrow');
  if (!row || row.dataset.ri === undefined) return null;
  return { cellEl, ri: Number(row.dataset.ri) };
}
function topVisibleBodyRow(body, g) {
  // 视口顶部露出的首个正文行(部分露出也算): 上方向自动滚时目标行随滚动上移
  let acc = 0;
  for (let i = 0; i < body.length; i++) {
    acc += rowH[body[i]];
    if (g.scrollTop < acc) return body[i];
  }
  return body[body.length - 1];
}
function marqueeHitXY(x, y) {
  // 坐标反查(数学法): 自动滚当帧滚动后新行尚未渲染, elementFromPoint 会落空,
  // 故按 前缀和+列宽累积 直接算落点行/列。视口坐标先过 sticky 冻结区(行/列),
  // 冻结区以视口坐标判定, 正文区换内容坐标; 越界钳制到最近的行/列。
  const g = grid(), gr = g.getBoundingClientRect();
  const v = view(), sh = sheet();
  if (!v || !sh || !sh.rows.length) return null;
  ensureHeights();
  const seq = rowSeq();
  const posOf = {};
  seq.forEach((r, i) => { posOf[r] = i; });
  const nF = Math.min(frozenRows(v), seq.length);
  const fH = frozenHeight();
  const body = visRows.filter((r) => (posOf[r] !== undefined ? posOf[r] : -1) >= nF);
  // 行: 视口 y 在冻结区内 → sticky 冻结行(视口坐标); 否则正文前缀和(内容坐标)
  const vy = y - gr.top;
  let ri;
  if (vy < fH && nF > 0) {
    let acc = 0;
    ri = seq[nF - 1];
    for (let k = 0; k < nF; k++) { acc += rowH[seq[k]]; if (vy < acc) { ri = seq[k]; break; } }
    if (isHeadRow(ri)) {
      // 落在表头: 表头不参与选区, 钳到表头下首个可见行
      // (有冻结数据行=seq[1] 恒可见; 否则=视口顶部露出的首个正文行, 随上滚上移)
      ri = nF > 1 ? seq[1] : topVisibleBodyRow(body, g);
    }
  } else {
    const yBody = vy - fH + g.scrollTop;
    let acc = 0, found = -1;
    for (let i = 0; i < body.length; i++) { acc += rowH[body[i]]; if (yBody < acc) { found = i; break; } }
    ri = found >= 0 ? body[found] : body[body.length - 1];
  }
  if (ri === undefined || isHeadRow(ri)) return null;
  if (marquee.mode === 'row') return { ri };
  // 列: 视口 x 在冻结列区内 → sticky 冻结列(视口坐标); 否则内容坐标走列宽累积
  const cols = visibleCols();
  if (!cols.length) return null;
  const vfc = Math.min(v.freezeCol, cols.length);
  let bx = ROWNUM_W;   // 正文列内容起点 = 行号宽 + 冻结列总宽
  for (let j = 0; j < vfc; j++) bx += colWidth(cols[j]);
  const cx = x - gr.left;
  let ci;
  if (cx < bx) {
    if (cx < ROWNUM_W) {
      // 行号槽: 钳到当前最左可见列(有冻结列=首列恒可见; 否则随左滚左移)
      ci = vfc > 0 ? cols[0] : leftVisibleBodyCol(cols, vfc, g);
    } else {
      let acc = ROWNUM_W;
      ci = cols[vfc - 1];
      for (let j = 0; j < vfc; j++) { acc += colWidth(cols[j]); if (cx < acc) { ci = cols[j]; break; } }
    }
  } else {
    const xr = cx + g.scrollLeft;
    let acc = bx;
    ci = cols[cols.length - 1];
    for (let j = vfc; j < cols.length; j++) { acc += colWidth(cols[j]); if (xr < acc) { ci = cols[j]; break; } }
  }
  return { ri, ci };
}
function leftVisibleBodyCol(cols, vfc, g) {
  // 视口左侧露出的首个正文列(部分露出也算): 左方向自动滚时目标列随滚动左移
  let bx = ROWNUM_W;
  for (let j = 0; j < vfc; j++) bx += colWidth(cols[j]);
  let acc = bx;
  for (let j = vfc; j < cols.length; j++) {
    acc += colWidth(cols[j]);
    if (g.scrollLeft < acc) return cols[j];
  }
  return cols[cols.length - 1];
}
function marqueeApplyHit(hit) {
  const v = view(), sh = sheet();
  if (!v || !sh) return;
  let rect;
  if (marquee.mode === 'row') {
    if (isHeadRow(hit.ri)) return;
    rect = normRect(marquee.aRi, 0, hit.ri, sh.nCols - 1);
  } else {
    rect = normRect(marquee.aRi, marquee.aCi, hit.ri, hit.ci);
  }
  v.selRanges = marquee.base.concat([rect]);
  marqueeDomUpdate();
}
function marqueeAutoScroll() {
  // 每帧: 由鼠标距边缘距离定速度(越近越快) → 滚一格 → 坐标反查新落点 → 扩展选区
  marqueeAutoOn = false;
  if (!marquee || !marqueePt || !FILES.length) return;
  const g = grid();
  if (!g) return;
  const gr = g.getBoundingClientRect();
  const spd = (d) => EDGE_SPD_MIN + (1 - Math.max(0, d) / EDGE_ZONE) * (EDGE_SPD_MAX - EDGE_SPD_MIN);
  let dx = 0, dy = 0;
  if (marquee.mode !== 'row') {   // 行号拖拽只纵向
    const dl = marqueePt.x - gr.left, dr = gr.right - marqueePt.x;
    if (dl < EDGE_ZONE && dl <= dr) dx = -spd(dl);
    else if (dr < EDGE_ZONE) dx = spd(dr);
  }
  const dt = marqueePt.y - gr.top, db = gr.bottom - marqueePt.y;
  if (dt < EDGE_ZONE && dt <= db) dy = -spd(dt);
  else if (db < EDGE_ZONE) dy = spd(db);
  if (!dx && !dy) return;   // 不在边缘区: 循环停, mousemove 再进边缘会重启
  const sl = g.scrollLeft, st = g.scrollTop;
  if (dx) g.scrollLeft = sl + dx;
  if (dy) g.scrollTop = st + dy;
  if (g.scrollLeft === sl && g.scrollTop === st) return;   // 已滚到边界
  const hit = marqueeHitXY(marqueePt.x, marqueePt.y);
  if (hit) {
    marqueeApplyHit(hit);
    marqueePreview(marqueePt.x, marqueePt.y);
  }
  marqueeAutoOn = true;
  requestAnimationFrame(marqueeAutoScroll);
}
function onGridSelectMouseDown(e) {
  if (e.button !== 0 || !FILES.length) return;
  const v = view();
  const hit = cellFromPointEl(e.target);
  if (!hit) return;
  const { cellEl, ri } = hit;
  if (cellEl.classList.contains('rownum')) {
    // 行号格: 选中整行, 拖动扩展连续多行
    if (e.target.closest('.row-resizer') || isHeadRow(ri)) return;
    const cN = sheet().nCols;
    const before = v.selRanges;   // 按下前的选区(marquee 拖拽在其上追加)
    if (e.ctrlKey || e.metaKey) {
      v.selRanges = (before || []).concat([{ r1: ri, c1: 0, r2: ri, c2: cN - 1 }]);
      setSelCell(null);
    } else if (e.shiftKey && v.selCell) {
      v.selRanges = [normRect(v.selCell.ri, 0, ri, cN - 1)];
    } else {
      v.selRanges = [{ r1: ri, c1: 0, r2: ri, c2: cN - 1 }];
      setSelCell(null);
    }
    marquee = { mode: 'row', aRi: ri, base: (before || []).slice(), x0: e.clientX, y0: e.clientY };
    marqueeDomUpdate();
    e.preventDefault();
    return;
  }
  if (cellEl.classList.contains('hcell')) return;   // 列头交给表头逻辑(单击选列在 mouseup 同步整列选区)
  const ci = visibleCols()[Number(cellEl.dataset.di)];
  if (ci === undefined) return;
  // 文字上普通按下 = 原生文本选择(不框选); ctrl/shift 时仍走选区逻辑
  if (e.target.closest('.cell-txt') && !e.ctrlKey && !e.metaKey && !e.shiftKey) return;
  if (e.ctrlKey || e.metaKey) {
    // ctrl: 单击已选单格=移除; 否则追加(拖动则追加矩形)
    const asSingle = (v.selRanges || []).some((rg) => rg.r1 === ri && rg.r2 === ri && rg.c1 === ci && rg.c2 === ci);
    if (asSingle) {
      v.selRanges = removePointRect(v.selRanges, ri, ci);
      setSelCell(null);
      marqueeDomUpdate();
      e.preventDefault();
      return;
    }
    const before = v.selRanges;
    v.selRanges = (before || []).concat([{ r1: ri, c1: ci, r2: ri, c2: ci }]);
    setSelCell({ ri, ci });
    marquee = { mode: 'cell', aRi: ri, aCi: ci, base: (before || []).slice(), x0: e.clientX, y0: e.clientY };
  } else if (e.shiftKey && v.selCell) {
    // shift: 锚点到目标格的连续区(同行=行内段, 同列=列内段, 异行异列=矩形)
    v.selRanges = [normRect(v.selCell.ri, v.selCell.ci, ri, ci)];
    setSelCell({ ri, ci });
  } else {
    // 空白处普通按下: 开始框选(松手无位移=单格)
    v.selRanges = [{ r1: ri, c1: ci, r2: ri, c2: ci }];
    setSelCell({ ri, ci });
    marquee = { mode: 'cell', aRi: ri, aCi: ci, base: [], x0: e.clientX, y0: e.clientY };
  }
  marqueeDomUpdate();
  e.preventDefault();
}
document.addEventListener('mousemove', (e) => {
  if (!marquee || !FILES.length) return;
  if (!(e.buttons & 1)) {
    // 按键防线: 拖到窗外松手时 mouseup 会丢, 指针回到窗内后悬停移动不得继续改选区
    marquee = null;
    marqueePt = null;   // 自动滚循环下帧自行退出
    const pv = $('#sel-preview');
    if (pv) pv.style.display = 'none';
    return;
  }
  marqueePt = { x: e.clientX, y: e.clientY };
  // 边缘自动滚: 先于落点判定(落点可能落在渲染缓冲区外/落空, 但边缘滚不受影响)
  if (!marqueeAutoOn) {
    const gr = grid().getBoundingClientRect();
    const nearV = e.clientY - gr.top < EDGE_ZONE || gr.bottom - e.clientY < EDGE_ZONE;
    const nearH = marquee.mode !== 'row' && (e.clientX - gr.left < EDGE_ZONE || gr.right - e.clientX < EDGE_ZONE);
    if (nearV || nearH) { marqueeAutoOn = true; requestAnimationFrame(marqueeAutoScroll); }
  }
  const v = view();
  const hit = cellFromPointEl(e.target);
  if (!hit || hit.ri === undefined) return;
  let rect;
  if (marquee.mode === 'row') {
    if (isHeadRow(hit.ri)) return;
    rect = normRect(marquee.aRi, 0, hit.ri, sheet().nCols - 1);
  } else {
    if (hit.cellEl.classList.contains('hcell') || hit.cellEl.classList.contains('rownum')) return;
    const ci = visibleCols()[Number(hit.cellEl.dataset.di)];
    if (ci === undefined) return;
    rect = normRect(marquee.aRi, marquee.aCi, hit.ri, ci);
  }
  if (rect) {
    v.selRanges = marquee.base.concat([rect]);
    marqueePreview(e.clientX, e.clientY);
    marqueeDomUpdate();
  }
});
document.addEventListener('mouseup', () => {
  if (!marquee) return;
  marquee = null;
  marqueePt = null;   // 自动滚循环下帧自行退出
  const pv = $('#sel-preview');
  if (pv) pv.style.display = 'none';
});

/* ---- 复制(ctrl+c) ---- */
function buildCopyText() {
  const v = view(), sh = sheet();
  if (!v || !sh) return null;
  const cellStr = (r, c) => {
    const raw = sh.rows[r][c][0];
    return raw === null || raw === undefined ? '' : String(raw).replace(/\r?\n/g, ' ');
  };
  if (v.selRanges && v.selRanges.length) {
    // 以全部选区整体边界生成矩阵: 列间 Tab 行间换行, 未选中空缺补空串(粘贴还原相对位置)
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const rg of v.selRanges) {
      r1 = Math.min(r1, rg.r1); c1 = Math.min(c1, rg.c1);
      r2 = Math.max(r2, rg.r2); c2 = Math.max(c2, rg.c2);
    }
    const maxR = sh.rows.length - 1, maxC = sh.nCols - 1;   // 边界钳制(隐藏列/列数收缩防御)
    r2 = Math.min(r2, maxR); c2 = Math.min(c2, maxC);
    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const parts = [];
      for (let c = c1; c <= c2; c++) parts.push(inSelCell(v, r, c) ? cellStr(r, c) : '');
      lines.push(parts.join('\t'));
    }
    return { text: lines.join('\n'), rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
  }
  if (v.selCell) {
    return { text: cellStr(v.selCell.ri, v.selCell.ci), rows: 1, cols: 1 };
  }
  return null;
}



/* ================= 排序(多级, 物化进 rowOrder) ================= */
function sortKey(v) {
  // 预计算比较键: null=空值(恒排最后); 数值型 {n} 优先于文本型 {s}(Excel 规则: 数字<文本)
  if (v === '' || v === null || v === undefined) return null;
  const n = toNum(v);
  return isNaN(n) ? { s: String(v) } : { n };
}
function cmpKey(a, b, dir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;      // 空值恒排最后, 不随方向翻转
  if (b === null) return -1;
  let c = 0;
  if (a.n !== undefined && b.n !== undefined) c = a.n - b.n;
  else if (a.n !== undefined) c = -1;
  else if (b.n !== undefined) c = 1;
  else c = a.s.localeCompare(b.s, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  if (c === 0) return 0;
  return dir === 'desc' ? -c : c;
}
function isSingleColSel(v) {
  // 多选但全部落在同一列(含点列头的整列选区): 排序不受限, 且排序目标=该列
  if (!v.selRanges || !v.selRanges.length) return null;
  const col = v.selRanges[0].c1;
  if (v.selRanges.some((rg) => rg.c1 !== rg.c2 || rg.c1 !== col)) return null;
  return col;
}
function applySorts(list) {
  // 应用多级排序: 排序结果物化进 v.rowOrder(沿用 T009 行重排体系, 渲染/搜索/写回全兼容)。
  // 标题行与冻结行前缀不参与(表头必须在最前)。
  const v = view(), sh = sheet();
  if (!v || !sh) return;
  if (v.selRanges && v.selRanges.length && isSingleColSel(v) === null) {
    // 跨列多选时禁用排序: 框选矩形基于所见显示位置, 排序改变行序会使所见选区与数据选区错位
    toast(t('sort_disabled_multisel'), 'warn');
    return;
  }
  if (!v.sorts.length && list.length && v.rowOrderPreSort === null) {
    // 首次排序前保存当前行序(手动重排过才有值), 供"清除排序"恢复
    const seq = rowSeq();
    const nonDefault = seq.some((ri, i) => ri !== i);
    v.rowOrderPreSort = nonDefault ? seq.slice() : null;
  }
  v.sorts = list.slice();
  if (!list.length) {
    v.rowOrder = v.rowOrderPreSort ? v.rowOrderPreSort.slice() : null;
    v.rowOrderPreSort = null;
    if (v.titleRow != null) {
      // 恢复的手动行序里把标题行放回最前(保持置顶语义)
      const tr = v.titleRow;
      v.rowOrder = [tr].concat((v.rowOrder || Array.from({ length: sh.rows.length }, (_, i) => i)).filter((x) => x !== tr));
    }
  } else {
    const seq = rowSeq().slice();
    const fr = Math.min(frozenRows(v), seq.length);   // 标题行+常规冻结区不参与
    const tail = seq.slice(fr);
    const keys = new Map();       // 行 -> 各级比较键(Decorate-Sort-Undecorate, 免重复解析)
    for (const ri of tail) keys.set(ri, list.map((s) => sortKey(sh.rows[ri][s.col][0])));
    tail.sort((a, b) => {
      const ka = keys.get(a), kb = keys.get(b);
      for (let i = 0; i < list.length; i++) {
        const c = cmpKey(ka[i], kb[i], list[i].dir);
        if (c) return c;
      }
      return a - b;              // 全部级相同: 回退原序(稳定)
    });
    v.rowOrder = seq.slice(0, fr).concat(tail);
  }
  renderAll();
}

function sortTargetCol() {
  // 升/降序作用列: 单列选区(含点列头/单格)> 选中单元格所在列
  const v = view();
  if (!v) return null;
  const sc = isSingleColSel(v);
  if (sc !== null) return sc;
  if (v.selCell) return v.selCell.ci;
  return null;
}
function quickSort(dir) {
  const ci = sortTargetCol();
  if (ci === null || ci === undefined) { toast(t('sort_need_target'), 'warn'); return; }
  applySorts([{ col: ci, dir }]);
}

function openSortModal() {
  if (!FILES.length) { toast(t('sort_need_file'), 'warn'); return; }
  const v = view();
  if (v.selRanges && v.selRanges.length && isSingleColSel(v) === null) {
    toast(t('sort_disabled_multisel'), 'warn');
    return;
  }
  const cols = visibleCols();
  if (!cols.length) { toast(t('sort_no_cols'), 'warn'); return; }
  const mask = $('#modal-mask'), m = $('#modal');
  m.textContent = '';
  m.classList.remove('cell-modal', 'search-modal');
  m.classList.add('fm-modal');
  m.appendChild(el('h3', '', t('sort_modal_title')));
  m.appendChild(el('div', 'fm-sub', t('sort_modal_sub')));
  const list = (v.sorts || []).map((s) => ({ col: s.col, dir: s.dir }));
  if (!list.length) list.push({ col: cols[0], dir: 'asc' });
  const listBox = el('div', 'fm-list');
  m.appendChild(listBox);
  function renderRows() {
    listBox.textContent = '';
    list.forEach((r, i) => {
      const row = el('div', 'fm-row');
      const colSel = document.createElement('select');
      colSel.className = 'fm-col';
      cols.forEach((c) => {
        const o = document.createElement('option');
        o.value = c; o.textContent = colName(c);
        if (c === r.col) o.selected = true;
        colSel.appendChild(o);
      });
      colSel.onchange = () => { list[i].col = Number(colSel.value); };
      const dirSel = document.createElement('select');
      dirSel.className = 'fm-dir';
      [['asc', 'sort_dir_asc'], ['desc', 'sort_dir_desc']].forEach(([val, key]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = t(key);
        if (r.dir === val) o.selected = true;
        dirSel.appendChild(o);
      });
      dirSel.onchange = () => { list[i].dir = dirSel.value; };
      const del = el('button', 'del', '✕');
      del.title = t('sort_del_level');
      del.onclick = () => { list.splice(i, 1); renderRows(); };
      row.append(colSel, dirSel, del);
      listBox.appendChild(row);
    });
    const add = el('button', 'fm-add', t('sort_add_level'));
    add.onclick = () => { list.push({ col: cols[0], dir: 'asc' }); renderRows(); };
    listBox.appendChild(add);
  }
  renderRows();
  m.appendChild(el('div', 'fm-note', t('sort_modal_note')));
  const btns = el('div', 'm-btns');
  const clearBtn = el('button', 'tbtn m-clear', t('sort_clear_all'));
  clearBtn.onclick = () => { mask.classList.remove('open'); applySorts([]); toast(t('sort_cleared_all'), 'ok'); };
  const cancel = el('button', 'tbtn', t('btn_cancel'));
  cancel.onclick = () => mask.classList.remove('open');
  const ok = el('button', 'tbtn primary', t('sort_apply'));
  ok.onclick = () => {
    mask.classList.remove('open');
    applySorts(list.filter((r) => cols.includes(r.col)));
  };
  btns.append(clearBtn, cancel, ok);
  m.appendChild(btns);
  mask.classList.add('open');
}

/* ================= 渲染 ================= */
const grid = () => $('#grid');
const inner = () => $('#grid-inner');

function totalWidth() {
  const cols = visibleCols();
  let w = ROWNUM_W;
  for (const c of cols) w += colWidth(c);
  return w;
}
function frozenLefts() {
  const cols = visibleCols(), v = view();
  const lefts = [];
  let x = ROWNUM_W;
  for (let j = 0; j < cols.length && j < v.freezeCol; j++) {
    lefts.push(x);
    x += colWidth(cols[j]);
  }
  return lefts;
}

function luma(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function makeCell(di, ci, ri, cellData, lefts, cols) {
  const v = view();
  const c = el('div', 'cell');
  const w = colWidth(ci);
  c.style.width = w + 'px';
  c.dataset.di = di;
  if (di < v.freezeCol) {
    c.classList.add('frozen');
    c.style.left = lefts[di] + 'px';
  }
  const [val, cIdx] = cellData;
  const isNum = typeof val === 'number';
  const rowAl = v.rowAlign[ri], colAl = v.align[ci];
  const effAl = rowAl || colAl;
  if (effAl === 'center') c.classList.add('al-c');
  else if (effAl === 'right') c.classList.add('al-r');
  if (di === v.freezeCol - 1) c.classList.add('frozen-edge');
  if (isHeadRow(ri)) {
    // 表头: 标签 + 图标 + 拖宽手柄
    c.classList.add('hcell');
    if (v.colSel && v.colSel.has(ci)) c.classList.add('colsel');
    const label = el('span', 'ch-label', val === '' ? (v.hasHeader ? t('empty_head') : '') : String(val));
    c.appendChild(label);
    const icons = el('span', 'ch-icons');
    if (v.filters[ci] && ((v.filters[ci].conds || []).length || (v.filters[ci].colors || []).length || (v.filters[ci].values && v.filters[ci].values.include))) {
      icons.appendChild(el('span', '', '▼'));
      c.classList.add('filtered');
    }
    const sIdx = v.sorts ? v.sorts.findIndex((s) => s.col === ci) : -1;
    if (sIdx >= 0) {
      // 排序指示: 方向箭头 + 多级时的级别序号(优先级从上到下)
      icons.appendChild(el('span', 'sort-ico', (v.sorts[sIdx].dir === 'asc' ? '↑' : '↓') + (v.sorts.length > 1 ? sIdx + 1 : '')));
    }
    c.appendChild(icons);
    const rz = el('div', 'col-resizer');
    rz.dataset.ci = ci;
    c.appendChild(rz);
  } else {
    if (val !== '' && val !== null) {
      const txt = String(val);
      // 文本包 span.cell-txt: cursor/user-select 只作用在文本上, 格内空白区为普通指针(框选用)
      const span = el('span', 'cell-txt');
      if (isCompressed(ci)) {
        // 压缩态: 单行 + 中间省略(头...尾), title 提示全文
        c.classList.add('c-ell');
        span.textContent = midTrunc(txt.replace(/\n/g, ' '), w - 20);
        c.title = txt;
      } else {
        span.textContent = txt;
      }
      c.appendChild(span);
    }
    if (isNum) c.classList.add('num');
    if (v.selCell && v.selCell.ri === ri && v.selCell.ci === ci) c.classList.add('selcell');
    if (cIdx >= 0) {
      const hex = sheet().palette[cIdx];
      if (hex) {
        c.classList.add('tinted');
        c.style.background = hex;
        c.style.color = luma(hex) > 145 ? '#1c1e24' : '#ffffff';
      }
    }
  }
  return c;
}

function makeRow(ri, cols, lefts) {
  const sh = sheet(), v = view();
  const row = el('div', 'vrow');
  row.style.height = rowH[ri] + 'px';
  // 行号(手动标题行不计号, 显示 ▤)
  const rn = el('div', 'cell rownum', rowNumLabel(ri));
  if (v.titleRow != null && ri === v.titleRow) rn.title = t('title_row_tip');
  rn.style.width = ROWNUM_W + 'px';
  const rzh = el('div', 'row-resizer');
  rzh.dataset.ri = ri;
  rn.appendChild(rzh);
  rn.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); openRowMenu(ev, ri); });
  row.appendChild(rn);
  for (let di = 0; di < cols.length; di++) {
    const ci = cols[di];
    row.appendChild(makeCell(di, ci, ri, sh.rows[ri][ci], lefts, cols));
  }
  if (isHeadRow(ri)) addHideSeams(row);   // 表头行(含手动标题行/无表头文件首行)要有隐藏列拉出手柄
  return row;
}

let __lastRz = null;
function rzDetect(key, x, y) {
  // mousedown 内手动检测双击: 同 key + 420ms + 7px 内视为第二次按下。
  // 不能用元素级 dblclick: 双击的微动会触发提交+全量重建 DOM, 第二次点击落到新元素上, 原生 dblclick 不再合成。
  const now = Date.now();
  const hit = __lastRz && now - __lastRz.t < 420 && __lastRz.k === key
    && Math.abs(x - __lastRz.x) < 7 && Math.abs(y - __lastRz.y) < 7;
  __lastRz = hit ? null : { t: now, k: key, x, y };
  return hit;
}

function addHideSeams(rowEl) {
  // 在表头行上为隐藏列组渲染"拉出"竖条: 定位在边界右侧 0.5px 起(避开左列 resizer 的左向 9px 区)
  const v = view();
  let x = ROWNUM_W, cur = null;
  const groups = [];
  for (const ci of v.order) {
    if (v.hiddenSet.has(ci)) {
      if (!cur) cur = { x, cols: [] };
      cur.cols.push(ci);
    } else {
      if (cur) { groups.push(cur); cur = null; }
      x += colWidth(ci);
    }
  }
  if (cur) groups.push(cur);
  for (const g of groups) {
    const s = el('div', 'hide-seam');
    s.style.left = (g.x + 0.5) + 'px';
    s.dataset.cols = g.cols.join(',');
    s.title = t('hide_seam_tip', { names: g.cols.map(colName).join(t('list_sep')) });
    rowEl.appendChild(s);
  }
}

function bindHeaderEvents(row, cols) {
  row.addEventListener('mousedown', (e) => onHeaderMouseDown(e, cols));
  row.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cell:not(.rownum)');
    if (!cell || e.target.closest('.col-resizer')) return;
    openFilterPanel(cols[Number(cell.dataset.di)]);
  });
  row.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.cell:not(.rownum)');
    if (!cell) return;
    e.preventDefault();
    openCtxMenu(e, cols[Number(cell.dataset.di)]);
  });
}

let bodyStart = document.createComment('body-start');
let spacerTop = null, spacerBottom = null;

function renderStructure() {
  const root = inner();
  // 清空前保留旧 spacer(元素卸下但 style.height 还在), 重建期间撑住内容高度,
  // 避免内容瞬时塌缩把 scrollTop 钳到 0/底部(异步 rAF 渲染回调会读到钳位值产生错窗口)
  const keepTop = spacerTop, keepBottom = spacerBottom;
  root.textContent = '';
  root.style.width = totalWidth() + 'px';
  const v = view();
  const cols = visibleCols();
  const lefts = frozenLefts();
  ensureHeights();
  const seq = rowSeq();
  const nFrozenRows = Math.min(frozenRows(v), seq.length);
  // 冻结行(sticky top); seq[0] 为标题行(若设)或原表头行
  for (let k = 0; k < nFrozenRows; k++) {
    const ri = seq[k];
    const row = makeRow(ri, cols, lefts);
    row.classList.add('rfrozen');
    if (k === nFrozenRows - 1) row.classList.add('last-frozen');   // 冻结区底缘: 仅末行、仅冻结列右侧格加高亮线(与列 frozen-edge 对齐)
    row.dataset.ri = ri;
    if (k === 0) {
      row.classList.add('rowhead');
      if (!v.hasHeader) row.classList.add('nohead');
      let top = 0;
      row.style.top = top + 'px';
      bindHeaderEvents(row, cols);
      // 隐藏列拉出手柄由 makeRow(表头行) 统一追加, 此处不再重复
    } else {
      row.style.top = seq.slice(0, k).reduce((a, b2) => a + rowH[b2], 0) + 'px';
    }
    root.appendChild(row);
  }
  // 表头行若未被冻结(freezeRow=0): 首行由 body 渲染, 表头事件由 bindUI 里的一次性委托处理
  spacerTop = keepTop || el('div');
  spacerBottom = keepBottom || el('div');
  root.appendChild(spacerTop);
  root.appendChild(spacerBottom);
  refreshColHover();
  refreshSelDom();
}

let pendingTop = null;   // renderAll 重建期间的"代用 scrollTop"(实时值可能被内容塌缩钳位);
                         // 不能经 renderBody 形参传: rAF(renderBody) 会把时间戳当第一参灌进来
function renderBody() {
  if (!FILES.length) return;
  try { renderBodyInner(); fixRowHeights(); } catch (e) { console.error('renderBody', e); }
}

function renderBodyInner() {
  const sh = sheet(), v = view();
  const cols = visibleCols();
  const lefts = frozenLefts();
  ensureHeights();
  const g = grid();
  const seq = rowSeq();
  const posOf = {};
  seq.forEach((ri, i) => { posOf[ri] = i; });
  const nFrozenRows = Math.min(frozenRows(v), seq.length);
  const fH = frozenHeight();
  const bodyList = visRows.filter((ri) => (posOf[ri] !== undefined ? posOf[ri] : -1) >= nFrozenRows);
  const tops = new Array(bodyList.length + 1);
  tops[0] = 0;
  for (let i = 0; i < bodyList.length; i++) tops[i + 1] = tops[i] + rowH[bodyList[i]];
  // top: 全量重建期间的"代用 scrollTop"(实时值已被内容塌缩钳到 0)
  const curTop = pendingTop !== null ? pendingTop : g.scrollTop;
  const viewTop = Math.max(0, curTop - fH);
  const viewBottom = viewTop + g.clientHeight - fH;
  let lo = 0, hi = bodyList.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid + 1] < viewTop) lo = mid + 1; else hi = mid; }
  let start = Math.max(0, lo - 4);
  let end = start;
  while (end < bodyList.length && tops[end] < viewBottom + 200) end++;
  end = Math.min(bodyList.length, end + 4);

  spacerTop.style.height = tops[start] + 'px';
  spacerBottom.style.height = (tops[bodyList.length] - tops[end]) + 'px';
  // 移除旧 body 行
  let node = spacerTop.nextSibling;
  while (node && node !== spacerBottom) {
    const nx = node.nextSibling;
    node.remove();
    node = nx;
  }
  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const ri = bodyList[i];
    const row = makeRow(ri, cols, lefts, posOf[ri]);
    row.classList.add('rbody');
    if ((posOf[ri] || 0) % 2 === 1) row.classList.add('odd');
    row.dataset.ri = ri;
    if (isHeadRow(ri)) { row.classList.add('rowhead'); if (!v.hasHeader) row.classList.add('nohead'); }
    frag.appendChild(row);
  }
  spacerBottom.parentNode.insertBefore(frag, spacerBottom);
  refreshColHover();
  refreshSelDom();
  // 冻结行中隐藏被筛选掉的行? 表头区(冻结行)始终全显, 不参与筛选
}

function fixRowHeights() {
  // 渲染后实测: cell.scrollHeight 超出行高则扩(单调增, 收敛), 修正估算偏差导致的遮挡。
  // 测量值在两次渲染间可能漂移 1~5px(字体度量时机), 单轮会留下轻微贴边/遮挡 → 循环复测至稳定。
  for (let round = 0; round < 3; round++) {
    let changed = false;
    document.querySelectorAll('.vrow.rbody, .vrow.rfrozen').forEach((row) => {
      const ri = Number(row.dataset.ri);
      if (!Number.isInteger(ri) || !(ri in rowH)) return;
      let need = 0;
      for (const c of row.children) {
        const sc = c.scrollHeight;
        if (Number.isFinite(sc) && sc > need) need = sc;
      }
      if (need > rowH[ri]) {          // 严格比较; flex 垂直居中溢出时 scrollHeight 可能略低于实际占用
        rowH[ri] = Math.ceil(need) + 4;   // 额外余量: 内容上下留出呼吸边距, 防贴边/轻微遮挡
        view().measuredH[ri] = rowH[ri];
        changed = true;
      }
    });
    if (!changed) break;
    renderBodyInner();
  }
}

function renderAll() {
  if (!FILES.length) return;
  const g = grid();
  const sl = g.scrollLeft, st = g.scrollTop;   // renderStructure 清空 DOM 会把 scrollTop 钳到 0, 前后保存还原
  applyFilters();
  renderStructure();
  pendingTop = st;
  renderBody();
  pendingTop = null;
  g.scrollLeft = sl;
  g.scrollTop = st;
  updateStatus();
  updateInputs();
}
// 标签卡摘要的操作符文案: chip_ 前缀值是 lang.js 字典键(随语言切换), 其余为语言中立符号
const OP_LABELS = { contains: 'chip_contains', not_contains: 'chip_not_contains', equals: 'chip_equals', not_equals: 'chip_not_equals',
  starts: 'chip_starts', ends: 'chip_ends', empty: 'chip_empty', not_empty: 'chip_not_empty',
  gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', ne: '≠' };

function filterSummary(f) {
  const parts = [];
  if (f.values && f.values.include) parts.push(t('chip_values', { n: f.values.include.length }));
  (f.conds || []).forEach((c) => {
    const lab = OP_LABELS[c.op];
    parts.push((lab ? (lab.startsWith('chip_') ? t(lab) : lab) : c.op) + ((c.op === 'empty' || c.op === 'not_empty') ? '' : c.val));
  });
  if ((f.colors || []).length) parts.push(t('chip_colors', { n: f.colors.length }));
  return parts.join(t('chip_and'));
}

function renderChips() {
  const bar = $('#filter-bar');
  if (!bar) return;
  bar.textContent = '';
  if (!curFile()) { bar.classList.remove('has'); return; }
  const v = view();
  let has = false;
  for (const k of Object.keys(v.filters)) {
    const ci = Number(k);
    const f = v.filters[ci];
    if (!(f.conds || []).length && !(f.colors || []).length && !(f.values && f.values.include)) continue;
    has = true;
    const name = colName(ci).slice(0, 14) || t('col_fallback_name', { n: ci + 1 });
    const chip = el('div', 'fchip');
    chip.title = t('chip_edit_tip');
    chip.appendChild(el('span', 'fc-name', name));
    chip.appendChild(el('span', 'fc-desc', filterSummary(f)));
    const x = el('span', 'fc-close', '✕');
    x.title = t('chip_clear_tip');
    x.onclick = (e) => { e.stopPropagation(); delete v.filters[ci]; renderAll(); };
    chip.onclick = () => openFilterPanel(ci);
    chip.appendChild(x);
    bar.appendChild(chip);
  }
  bar.classList.toggle('has', has);
}

/* ================= 悬停十字高亮 / 单元格选中 / 全文模态窗 ================= */
let hoverDi = null;
function setColHover(di) {
  if (di === hoverDi) return;
  document.querySelectorAll('.cell.colh').forEach((c) => c.classList.remove('colh'));
  hoverDi = di;
  if (di !== null) {
    document.querySelectorAll('.cell[data-di="' + di + '"]').forEach((c) => c.classList.add('colh'));
  }
}
function refreshColHover() {
  // 重渲染后恢复列高亮(滚动/整表重建都会清掉 class)
  if (hoverDi === null) return;
  document.querySelectorAll('.cell[data-di="' + hoverDi + '"]').forEach((c) => c.classList.add('colh'));
}
function setSelCell(sel) {
  const v = view();
  const old = v.selCell;
  const same = old && sel && old.ri === sel.ri && old.ci === sel.ci;
  if (old && !same) document.querySelectorAll('.cell.selcell').forEach((c) => c.classList.remove('selcell'));
  if (same) return;
  v.selCell = sel || null;
  if (sel) {
    const di = visibleCols().indexOf(sel.ci);
    if (di >= 0) {
      const cell = document.querySelector('.vrow[data-ri="' + sel.ri + '"] .cell[data-di="' + di + '"]');
      if (cell) cell.classList.add('selcell');
    }
  }
}
function openCellModal(ri, ci) {
  const sh = sheet();
  const raw = sh.rows[ri][ci][0];
  const txt = raw === null || raw === undefined ? '' : String(raw);
  const mask = $('#modal-mask'), m = $('#modal');
  m.textContent = '';
  m.classList.add('cell-modal');
  m.appendChild(el('h3', '', t('cell_modal_title', { r: ri + 1, c: colName(ci) })));
  const body = el('div', 'cell-full');
  body.textContent = txt || t('cell_empty');
  m.appendChild(body);
  const btns = el('div', 'm-btns');
  const ok = el('button', 'tbtn primary', t('btn_close'));
  ok.onclick = () => mask.classList.remove('open');
  btns.appendChild(ok);
  m.appendChild(btns);
  mask.classList.add('open');
}

/* ================= Ctrl+F 搜索 ================= */
let searchCtx = null;   // {results:[{fi,si,ri,ci,text}], idx}
const SCOPES = [['sel', 'search_scope_sel'], ['sheet', 'search_scope_sheet'], ['file', 'search_scope_file'], ['all', 'search_scope_all'], ['col', 'search_scope_col']];

function openSearch() {
  if (!FILES.length) { toast(t('search_need_file'), 'warn'); return; }
  const mask = $('#modal-mask'), m = $('#modal');
  m.textContent = '';
  m.classList.remove('cell-modal');
  m.classList.add('search-modal');
  m.appendChild(el('h3', '', t('search_title')));
  const row1 = el('div', 'sr-row');
  const inp = document.createElement('input');
  inp.className = 'sr-input';
  inp.placeholder = t('search_ph');
  if (searchCtx) inp.value = searchCtx.q || '';
  const sel = document.createElement('select');
  SCOPES.forEach(([v, key]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t(key);
    sel.appendChild(o);
  });
  if (searchCtx) sel.value = searchCtx.scope || 'sheet';
  const hasSelCell = !!(view() && view().selCell);
  const hasSelRange = !!(view() && view().selRanges && view().selRanges.length);
  sel.querySelector('option[value="col"]').disabled = !hasSelCell;
  sel.querySelector('option[value="sel"]').disabled = !hasSelRange;
  if (!hasSelRange && sel.value === 'sel') sel.value = 'sheet';
  if (hasSelRange && !searchCtx) sel.value = 'sel';   // 有选区时默认只搜选区(可切回全表)
  const next = el('button', 'tbtn primary', t('search_find_next'));
  const all = el('button', 'tbtn', t('search_find_all'));
  row1.append(inp, sel, next, all);
  m.appendChild(row1);
  // 每次打开都显示默认提示(不残留上次搜索的计数; searchCtx 保留, 继续查找仍可循环)
  const status = el('div', 'sr-status', t('search_initial'));
  m.appendChild(status);
  const list = el('div', 'sr-list');
  m.appendChild(list);
  const btns = el('div', 'm-btns');
  const close = el('button', 'tbtn', t('btn_close'));
  close.onclick = () => mask.classList.remove('open');
  btns.appendChild(close);
  m.appendChild(btns);

  const doNext = () => {
    const q = inp.value.trim();
    if (!q) { status.textContent = t('search_empty_q'); return; }
    if (!searchCtx || searchCtx.q !== q || searchCtx.scope !== sel.value) {
      searchCtx = { q, scope: sel.value, results: runSearch(q, sel.value), idx: -1 };
    }
    if (!searchCtx.results.length) { status.textContent = t('search_no_match'); return; }
    searchCtx.idx = (searchCtx.idx + 1) % searchCtx.results.length;
    status.textContent = t('search_pos', { i: searchCtx.idx + 1, n: searchCtx.results.length });
    jumpToMatch(searchCtx.results[searchCtx.idx]);
  };
  const doAll = () => {
    const q = inp.value.trim();
    if (!q) { status.textContent = t('search_empty_q'); return; }
    searchCtx = { q, scope: sel.value, results: runSearch(q, sel.value), idx: -1 };
    list.textContent = '';
    if (!searchCtx.results.length) { status.textContent = t('search_no_match'); return; }
    status.textContent = t('search_all_count', { n: searchCtx.results.length, m: Math.min(500, searchCtx.results.length) });
    searchCtx.results.slice(0, 500).forEach((r) => {
      const it = el('div', 'sr-item');
      const loc = el('span', 'sr-loc',
        t('search_loc', { file: FILES[r.fi].data.fileName, sheet: FILES[r.fi].data.sheets[r.si].name, r: r.ri + 1, c: colNameOf(r) }));
      const txt = el('span', 'sr-txt', r.text.slice(0, 90));
      txt.title = r.text;
      it.append(loc, txt);
      it.ondblclick = () => jumpToMatch(r);
      list.appendChild(it);
    });
  };
  next.onclick = doNext;
  all.onclick = doAll;
  inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doNext(); } };
  mask.classList.add('open');
  setTimeout(() => inp.focus(), 50);
}

function colNameOf(m) {
  // 跨文件/sheet 的列名(不能直接用当前 view 的 colName)
  const f = FILES[m.fi];
  const vw = f.views[m.si];
  const sh = f.data.sheets[m.si];
  if (vw.hasHeader) {
    const hr = vw.titleRow != null ? vw.titleRow : 0;
    const s = cleanHeadName(sh.rows[hr][m.ci][0] || '');
    if (s) return s;
  }
  return excelColLetter(m.ci);
}

function runSearch(q, scope) {
  const ql = q.toLowerCase();
  const out = [];
  const fileIdx = scope === 'all' ? FILES.map((_, i) => i) : [FI];
  for (const fi of fileIdx) {
    const f = FILES[fi];
    for (let si = 0; si < f.data.sheets.length; si++) {
      if ((scope === 'sheet' || scope === 'col') && fi === FI && si !== f.si) continue;
      const sh = f.data.sheets[si];
      const vw = f.views[si];
      const cols = vw.order.filter((c) => !vw.hiddenSet.has(c));
      const colOnly = (scope === 'col' && fi === FI) ? (vw.selCell ? vw.selCell.ci : null) : null;
      const selOnly = (scope === 'sel' && fi === FI && si === f.si);   // 选区只在当前 sheet
      const rows = computeVisRows(sh, vw);
      for (const ri of rows) {
        const row = sh.rows[ri];
        for (const ci of cols) {
          if (colOnly !== null && ci !== colOnly) continue;
          if (selOnly && !inSelCell(vw, ri, ci)) continue;   // 有选区: 仅搜选中格
          const raw = row[ci][0];
          if (raw === '' || raw === null || raw === undefined) continue;
          const s = String(raw);
          if (s.toLowerCase().includes(ql)) out.push({ fi, si, ri, ci, text: s });
        }
      }
    }
  }
  return out;
}

function jumpToMatch(m) {
  if (m.fi !== FI) { FI = m.fi; activateFile(); }
  const f = FILES[m.fi];
  if (f.si !== m.si) {
    f.si = m.si;
    dirtyHeights = true;
    setColHover(null);
    renderSheetTabs();
    renderAll();
  }
  selectAndCenter(m.ri, m.ci);
}

function selectAndCenter(ri, ci) {
  const v = view();
  ensureHeights();
  const cols = visibleCols();
  const di = cols.indexOf(ci);
  if (di < 0) { toast(t('search_col_hidden'), 'warn'); return; }
  const pos = visRows.indexOf(ri);
  if (pos < 0) { toast(t('search_row_filtered'), 'warn'); return; }
  const fH = frozenHeight();
  let top = fH;
  for (let k = 0; k < pos; k++) top += rowH[visRows[k]];
  const g = grid();
  g.scrollTop = Math.max(0, Math.round(top - (g.clientHeight - fH) / 2));
  let left = ROWNUM_W;
  for (let d = 0; d < di; d++) left += colWidth(cols[d]);
  g.scrollLeft = Math.max(0, Math.round(left - g.clientWidth / 2));
  renderBody();
  setSelCell({ ri, ci });
}

function updateStatus() {
  const sh = sheet(), v = view();
  if (!sh || !v) {
    $('#st-rows').textContent = '';
    $('#st-filter').textContent = '';
    $('#st-sort').textContent = '';
    $('#st-sel').textContent = '';
    $('#btn-sort').disabled = true;
    renderChips();
    return;
  }
  // 排序按钮禁用态: 跨列多选时禁用(单列选区/单选不受限, 单列选区排序作用于该列)
  $('#btn-sort').disabled = !!(v.selRanges && v.selRanges.length && isSingleColSel(v) === null);
  const nf = Object.keys(v.filters).filter((k) => {
    const f = v.filters[k];
    return (f.conds || []).length || (f.colors || []).length || (f.values && f.values.include);
  }).length;
  const skip = v.titleRow != null ? 1 : 0;   // 标题行不计入行数
  const nSel = v.selRanges && v.selRanges.length ? selCellCount(v) : 0;
  $('#st-rows').textContent = curFile() && sh
    ? t('st_rows', { name: sh.name, v: visRows.length - skip, tt: sh.rows.length - skip, vc: visibleCols().length, tc: sh.nCols }) : '';
  $('#st-filter').textContent = nf ? (nSel ? t('st_filtered_sel', { n: nf }) : t('st_filtered', { n: nf })) : '';
  $('#st-sort').textContent = v.sorts && v.sorts.length ? t('st_sorted', { n: v.sorts.length }) : '';
  $('#st-sel').textContent = nSel ? t('st_sel', { n: nSel }) : '';
  renderChips();
}
function updateInputs() {
  const v = view();
  if (!v) {
    $('#in-frz-row').value = 0;
    $('#in-frz-col').value = 0;
    $('#btn-filters').disabled = true;
    $('#btn-sort').disabled = true;
    return;
  }
  $('#in-frz-row').value = v.freezeRow;
  $('#in-frz-col').value = v.freezeCol;
  $('#btn-save').disabled = !curFile();
  $('#btn-filters').disabled = false;
  // btn-sort 禁用态由 updateStatus 统一管理(随选区变化)
}

/* ================= 载入文件 / 多文件 tab ================= */
function loadFileData(data) {
  if (!data || !data.ok) {
    toast(t('open_failed', { e: (data && data.error) || t('unknown_error') }), 'err');
    return;
  }
  const exist = FILES.findIndex((f) => f.data.path === data.path);
  if (exist >= 0) {
    // 同路径重复打开 = 刷新该文件并聚焦
    FILES[exist] = { data, si: 0, views: data.sheets.map((s) => newView(s)) };
    FI = exist;
  } else {
    FILES.push({ data, si: 0, views: data.sheets.map((s) => newView(s)) });
    FI = FILES.length - 1;
  }
  activateFile();
  toast(t('loaded', { name: data.fileName, n: data.sheets.length }), 'ok');
}

function activateFile() {
  const f = curFile();
  setColHover(null);
  dirtyHeights = true;
  renderFileTabs();
  renderSheetTabs();
  $('#welcome').classList.toggle('hidden', !!f);
  $('#btn-save').disabled = !f;
  if (f) {
    $('#tb-file').textContent = f.data.fileName + (f.data.format === 'xls' ? t('tb_file_xls') : '');
    renderAll();
    grid().scrollTop = 0;
    grid().scrollLeft = 0;
  } else {
    $('#tb-file').textContent = '';
    inner().textContent = '';
    $('#st-rows').textContent = '';
    $('#st-filter').textContent = '';
    renderChips();
    updateInputs();
  }
}

function closeFile(i) {
  const name = FILES[i].data.fileName;
  FILES.splice(i, 1);
  if (FI > i) FI -= 1;
  if (FI >= FILES.length) FI = Math.max(0, FILES.length - 1);
  activateFile();
  toast(t('closed_file', { name }), 'ok');
}

function closeFileByPath(path) {
  // 按路径定位再关: 批量/连点场景下闭包里捕获的下标可能已因前一次关闭而错位
  const idx = FILES.findIndex((f) => f.data.path === path);
  if (idx >= 0) closeFile(idx);
}

function renderFileTabs() {
  const box = $('#file-tabs');
  if (!box) return;
  box.textContent = '';
  // 仅一个文件时不显示 tab 条(≥2 才显示)
  box.style.display = FILES.length > 1 ? 'flex' : 'none';
  FILES.forEach((f, i) => {
    const b = el('div', 'ftab' + (i === FI ? ' active' : ''));
    b.dataset.fi = i;
    b.title = f.data.path;
    b.appendChild(el('span', 'ft-name', f.data.fileName));
    const x = el('span', 'ft-close', '✕');
    x.title = t('close_file_tip');
    x.onclick = (e) => { e.stopPropagation(); closeFileByPath(f.data.path); };
    b.appendChild(x);
    b.onclick = () => { if (FI !== i) { FI = i; activateFile(); } };
    b.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('.ft-close')) return;
      startFileTabDrag(e, i);
    });
    box.appendChild(b);
  });
}

function startFileTabDrag(e, i) {
  const sx = e.clientX;
  let moved = false;
  const tab = document.querySelector('#file-tabs .ftab[data-fi="' + i + '"]');
  const mm = (ev) => {
    if (!moved && Math.abs(ev.clientX - sx) > 5) {
      moved = true;
      if (tab) tab.classList.add('dragging');
    }
  };
  const mu = (ev) => {
    document.removeEventListener('mousemove', mm);
    document.removeEventListener('mouseup', mu);
    if (tab) tab.classList.remove('dragging');
    if (!moved) return;
    const tabs = Array.from(document.querySelectorAll('#file-tabs .ftab'));
    let to = tabs.length - 1;
    for (const tb of tabs) {
      const r = tb.getBoundingClientRect();
      if (ev.clientX < r.left + r.width / 2) { to = Number(tb.dataset.fi); break; }
    }
    if (to === i) return;
    const [item] = FILES.splice(i, 1);
    if (to > i) to -= 1;
    FILES.splice(to, 0, item);
    FI = to;
    activateFile();
  };
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

function renderSheetTabs() {
  const box = $('#sheet-tabs');
  box.textContent = '';
  const f = curFile();
  if (!f) return;
  f.data.sheets.forEach((s, i) => {
    const b = el('button', 'stab' + (i === f.si ? ' active' : ''), s.name);
    b.onclick = () => {
      f.si = i;
      dirtyHeights = true;   // 行高缓存跨 sheet 失效(修复切换后行高错乱/13行现象)
      setColHover(null);
      renderSheetTabs();
      renderAll();
      grid().scrollTop = 0; grid().scrollLeft = 0;
    };
    box.appendChild(b);
  });
}

let fileOpening = false;
async function openFile() {
  if (!HAS_BRIDGE) { toast(t('browser_dev_hint'), 'warn'); return; }
  if (fileOpening) return;   // 防重入: 对话框期间忽略重复点击
  fileOpening = true;
  toast(t('reading_file'));
  try {
    const data = await callApi('pick_and_load', LANG);
    if (data && data.ok) loadFileData(data);
    else if (data && data.error) toast(t('open_failed', { e: data.error }), 'err');
  } finally { fileOpening = false; }
}

/* ================= 交互: 列头拖序 / 调宽 ================= */
let dragCtx = null; // {mode:'col'|'resize'|'rowh', ...}

function onHeaderMouseDown(e, cols) {
  if (e.button !== 0) return;
  const rz = e.target.closest('.col-resizer');
  const cell = e.target.closest('.cell');
  if (!cell || cell.classList.contains('rownum')) return;
  const di = Number(cell.dataset.di);
  if (rz) {
    if (rzDetect('c' + cols[di], e.clientX, e.clientY)) { autoFitCol(cols[di]); e.preventDefault(); return; }
    dragCtx = { mode: 'resize', ci: cols[di], startX: e.clientX, startW: colWidth(cols[di]) };
    rz.classList.add('active');
    document.body.classList.add('col-resizing');
    e.preventDefault();
    return;
  }
  dragCtx = { mode: 'col', di, ci: cols[di], startX: e.clientX, startY: e.clientY, moved: false, cols };
  e.preventDefault();
}

document.addEventListener('mousemove', (e) => {
  if (!dragCtx) return;
  if (dragCtx.mode === 'rowh') {
    const h = clamp(dragCtx.startH + (e.clientY - dragCtx.startY), ROWH_MIN, ROWH_MAX);
    dragCtx.curH = h;
    document.querySelectorAll('.vrow[data-ri="' + dragCtx.ri + '"]').forEach((r) => { r.style.height = h + 'px'; });
    return;
  }
  if (dragCtx.mode === 'resize') {
    // 下限放到 2px: 允许把列拖到近乎消失, 提交时 <12px 则隐藏该列
    const w = clamp(dragCtx.startW + (e.clientX - dragCtx.startX), 2, COLW_MAX);
    dragCtx.curW = w;
    // 实时预览: 更新该列所有 cell 宽度与总宽
    const di = visibleCols().indexOf(dragCtx.ci);
    if (di >= 0) {
      document.querySelectorAll(`.cell[data-di="${di}"]`).forEach((c) => { c.style.width = w + 'px'; });
      inner().style.width = totalWidth() - colWidth(dragCtx.ci) + w + 'px';
    }
    return;
  }
  // 列拖动
  if (!dragCtx.moved && Math.abs(e.clientX - dragCtx.startX) + Math.abs(e.clientY - dragCtx.startY) > 5) {
    dragCtx.moved = true;
    document.body.classList.add('col-dragging');
    const mk = $('#drop-marker') || inner().appendChild(el('div', '', ''));
    mk.id = 'drop-marker';
    mk.style.display = 'block';
    dragCtx.block = headerDragBlock(dragCtx.ci);   // 选中的连续多列整块拖
    dragCtx.block.forEach((c) => {
      const d = visibleCols().indexOf(c);
      if (d >= 0) document.querySelectorAll('.vrow.rowhead .cell[data-di="' + d + '"]').forEach((x) => x.classList.add('drag-source'));
    });
  }
  if (dragCtx.moved) {
    const mk = $('#drop-marker');
    const cells = Array.from(document.querySelectorAll('.vrow.rfrozen.rowhead .cell:not(.rownum), .vrow.rowhead .cell:not(.rownum)'));
    let dropIdx = cells.length;
    let markerX = null;
    for (const c of cells) {
      const r = c.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        dropIdx = Number(c.dataset.di);
        markerX = r.left;
        break;
      }
    }
    if (markerX === null && cells.length) {
      const last = cells[cells.length - 1].getBoundingClientRect();
      markerX = last.right;
    }
    dragCtx.dropIdx = dropIdx;
    const gRect = grid().getBoundingClientRect();
    if (mk && markerX !== null) {
      // sticky 列的 rect.left 已含 sticky 偏移; marker 定位到 grid-inner 坐标
      const scrollerLeft = gRect.left + ROWNUM_W;
      let xInInner = markerX - gRect.left + grid().scrollLeft;
      mk.style.left = clamp(xInInner, 0, 99999) + 'px';
      mk.style.top = '0px';
      mk.style.height = '100%';
    }
  }
});

document.addEventListener('mouseup', (e) => {
  if (!dragCtx) return;
  const ctx = dragCtx;
  dragCtx = null;
  document.body.classList.remove('col-resizing', 'col-dragging');
  const mk = $('#drop-marker');
  if (mk) mk.style.display = 'none';
  document.querySelectorAll('.col-resizer.active').forEach((r) => r.classList.remove('active'));
  document.querySelectorAll('.drag-source').forEach((r) => r.classList.remove('drag-source'));
  if (ctx.mode === 'rowh') {
    if (ctx.curH === undefined || Math.abs(ctx.curH - ctx.startH) < DRAG_DEAD) return;   // 死区内=点击不提交
    const v = view();
    v.rowH[ctx.ri] = clamp(Math.round(ctx.curH), ROWH_MIN, ROWH_MAX);
    dirtyHeights = true;
    renderAll();
    return;
  }
  if (ctx.mode === 'resize') {
    if (ctx.curW === undefined || Math.abs(ctx.curW - ctx.startW) < DRAG_DEAD) {
      if (ctx.fromSeam) {   // 从间隙拉出但没拖动: 重新隐藏回去
        view().hiddenSet.add(ctx.ci);
        resetHeights(view());
        renderAll();
      }
      return;
    }
    const v = view();
    if (ctx.curW < 12) {   // 拖到近乎 0: 隐藏该列(记住原宽, 供拉出/列设置参考)
      v.lastW[ctx.ci] = Math.round(ctx.startW);
      const name = colName(ctx.ci);
      hideCols([ctx.ci]);
      toast(t('col_hidden_toast', { name }), 'warn');
      return;
    }
    v.colW[ctx.ci] = clamp(Math.round(ctx.curW), COLW_MIN, COLW_MAX);
    delete v.lastW[ctx.ci];
    resetHeights(v);
    renderAll();
    return;
  }
  if (ctx.mode === 'col' && !ctx.moved) {
    // 单击列头 = 选中该列; Ctrl+单击 = 加/减选(批量拖拽排序的多选); 同时整列进入选区(筛选/搜索/复制范围)
    const v = view();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      v.colSel.has(ctx.ci) ? v.colSel.delete(ctx.ci) : v.colSel.add(ctx.ci);
    } else {
      v.colSel.clear();
      v.colSel.add(ctx.ci);
    }
    document.querySelectorAll('.cell.colsel').forEach((c) => c.classList.remove('colsel'));
    v.colSel.forEach((c) => {
      const d = visibleCols().indexOf(c);
      if (d >= 0) document.querySelectorAll('.vrow.rowhead .cell[data-di="' + d + '"]').forEach((x) => x.classList.add('colsel'));
    });
    syncColSelToRanges();
    setSelCell(null);
    refreshSelDom();
    updateStatus();
    return;
  }
  if (ctx.mode === 'col' && ctx.moved && ctx.dropIdx !== undefined) {
    const v = view();
    const visible = v.order.filter((c) => !v.hiddenSet.has(c));
    const block = (ctx.block && ctx.block.length ? ctx.block : [ctx.ci]);
    const froms = block.map((c) => visible.indexOf(c)).sort((a, b) => a - b);
    if (froms.includes(-1)) return;
    let to = clamp(ctx.dropIdx, 0, visible.length);
    if (froms[0] <= to && to <= froms[froms.length - 1] + 1) return;   // 原地
    to -= froms.filter((f) => f < to).length;
    const blockCols = froms.map((f) => visible[f]);
    visible.splice(froms[0], blockCols.length);
    visible.splice(to, 0, ...blockCols);
    v.order = visible.concat(v.order.filter((c) => v.hiddenSet.has(c)));
    resetHeights(v);
    renderAll();
  }
});

function headerDragBlock(ci) {
  // 拖拽移动的列块: ci 在多选且选中列在显示序上连续 → 整块; 否则单列
  const v = view();
  if (!v.colSel || !v.colSel.has(ci) || v.colSel.size <= 1) return [ci];
  const cols = visibleCols();
  const picked = cols.filter((c) => v.colSel.has(c));
  const first = cols.indexOf(picked[0]);
  const contiguous = picked.every((c, k) => cols.indexOf(c) === first + k);
  if (!contiguous) {
    toast(t('col_drag_noncontig'), 'warn');
    return [ci];
  }
  return picked;
}

/* ================= 右键菜单 ================= */
function closePopups() {
  document.querySelectorAll('.popup.open').forEach((p) => p.classList.remove('open'));
}
function _buildMenu(items) {
  const m = $('#ctx-menu');
  m.textContent = '';
  const add = (item, parent) => {
    if (item === '-') { parent.appendChild(el('div', 'sep')); return; }
    if (item.inline) {
      const row = el('div', 'mi-inline');
      const lbl = el('span', 'mi-lbl', item.label);
      row.appendChild(lbl);
      const grp = el('span', 'mi-igrp');
      item.inline.forEach((b) => {
        const btn = el('button', 'mi-ico', b.icon);
        btn.title = b.title;
        btn.onclick = (ev) => { ev.stopPropagation(); closePopups(); b.fn(); };
        grp.appendChild(btn);
      });
      row.appendChild(grp);
      parent.appendChild(row);
      return;
    }
    const b = el('button', 'mi' + (item.cls ? ' ' + item.cls : ''), item.label);
    if (item.fn) b.onclick = () => { closePopups(); item.fn(); };
    parent.appendChild(b);
  };
  items.forEach((it) => add(it, m));
  return m;
}

function showMenu(e, items) {
  const m = _buildMenu(items);
  closePopups();
  m.classList.add('open');   // 先显示: display:none 时 offsetWidth/Height=0, 位置会被钳到固定值
  const mw = m.offsetWidth || 180, mh = m.offsetHeight || 300;
  m.style.left = clamp(e.clientX, 8, window.innerWidth - mw - 8) + 'px';
  m.style.top = clamp(e.clientY, 8, window.innerHeight - mh - 8) + 'px';
}

function alignSubMenu(setFn) {
  return { label: t('m_align'), inline: [
    { icon: '⇤', title: t('al_left'), fn: () => setFn('left') },
    { icon: '≡', title: t('al_center'), fn: () => setFn('center') },
    { icon: '⇥', title: t('al_right'), fn: () => setFn('right') },
    { icon: '↺', title: t('al_reset'), fn: () => setFn(null) },
  ] };
}

function promptPx(title, cur) {
  const s = prompt(title + t('prompt_px'), cur);
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function autoFitCol(ci) {
  // 双击列边: 列宽自适应内容(同右键"自动调整此列宽")
  const v = view();
  v.colW[ci] = autoColWidth(ci);
  resetHeights(v);
  renderAll();
}
function autoFitRow(ri) {
  // 双击行号下缘: 清掉该行手动行高与实测缓存, 重新估算+实测 = 行高自适应内容
  const v = view();
  delete v.rowH[ri];
  delete v.measuredH[ri];
  dirtyHeights = true;
  renderAll();
}

function openCtxMenu(e, ci) {
  const v = view();
  const cols = visibleCols();
  const di = cols.indexOf(ci);
  const items = [
    { label: t('m_filter_col'), fn: () => openFilterPanel(ci) },
  ];
  if (di >= 0 && di < v.freezeCol) {
    items.push({ label: t('m_col_unfreeze'), fn: () => moveColOutOfFrozen(ci) });
    items.push({ label: t('m_cols_unfreeze_all'), fn: unfreezeColsAll });
  } else {
    items.push({ label: t('m_freeze_to_col', { n: di + 1 }), fn: () => { v.freezeCol = di + 1; renderAll(); } });
    if (v.freezeCol > 0) items.push({ label: t('m_col_freeze_add'), fn: () => {
      const visible = v.order.filter((c) => !v.hiddenSet.has(c));
      const frozen = visible.slice(0, v.freezeCol);
      const rest = visible.slice(v.freezeCol).filter((c) => c !== ci);
      v.order = frozen.concat([ci]).concat(rest).concat(v.order.filter((c) => v.hiddenSet.has(c)));
      if (!v.frozenColMoved) v.frozenColMoved = new Set();
      v.frozenColMoved.add(ci);   // 记录移动: 取消冻结时归位
      v.freezeCol += 1; dirtyHeights = true; renderAll();
    } });
  }
  items.push(alignSubMenu((mode) => { setAlign(ci, mode); }));
  items.push('-');
  items.push({ label: t('m_sort_by_asc'), fn: () => applySorts([{ col: ci, dir: 'asc' }]) });
  items.push({ label: t('m_sort_by_desc'), fn: () => applySorts([{ col: ci, dir: 'desc' }]) });
  if (v.sorts && v.sorts.length) {
    items.push({ label: t('m_clear_sort'), fn: () => { applySorts([]); toast(t('sort_cleared'), 'ok'); } });
  }
  items.push({ label: t('m_multi_sort'), fn: openSortModal });
  items.push('-');
  items.push({ label: t('m_col_width'), fn: () => {
    const n = promptPx(t('prompt_col_width'), Math.round(colWidth(ci)));
    if (n) { v.colW[ci] = clamp(n, COLW_MIN, COLW_MAX); resetHeights(v); renderAll(); }
  } });
  items.push('-');
  items.push({ label: t('m_hide_col'), cls: 'danger', fn: () => { hideCols([ci]); } });
  items.push({ label: t('m_autofit_col'), fn: () => { v.colW[ci] = autoColWidth(ci); resetHeights(v); renderAll(); } });
  items.push('-');
  items.push({ label: t('m_cols_panel'), fn: () => openColsPanel() });
  showMenu(e, items);
}

function unsetTitleRowInner() {
  // 取消标题行(内部): 归位 + 冻结区语义还原。不回滚 titlePre 快照值——期间新增的
  // 常规冻结要保留(第十一批反馈2: 旧行为恢复快照会把新增冻结一并清掉);
  // 标题行当初若从冻结区"转入"标题(took, 设计时做过 freezeRow-1), 按原行号序插回
  // 冻结集合, 否则插回正文原号位
  const v = view();
  const tr = v.titleRow;
  const seq = rowSeq();
  const frozen = seq.slice(0, frozenRows(v)).filter((ri) => ri !== tr);   // 冻结集合(去标题, 保持显示序)
  const rest = seq.slice(frozenRows(v));                                  // 正文(保持现序=排序物化不被清)
  const took = !!(v.titlePre && v.titlePre.took);
  v.titleRow = null;
  if (v.titlePre) {
    v.hasHeader = v.titlePre.hasHeader;
    v.titlePre = null;
  } else {
    v.hasHeader = false;
  }
  if (took && v.freezeRow > 0) {
    // 当初从冻结区转入 且 常规冻结仍在: 按原行号序插回冻结集合;
    // 若常规冻结已被"取消冻结行(全部归位)"清空, 冻结来源已消亡——直接走归位分支,
    // 否则取消标题会把行重新冻结在顶部且后续取消冻结也不归位(第十二批反馈2)
    frozen.push(tr);
    frozen.sort((a, b) => a - b);   // 冻结区是连续前缀, 原号序即原相对位置
  } else {
    let at = rest.findIndex((x) => x > tr);
    if (at < 0) at = rest.length;
    rest.splice(at, 0, tr);
  }
  v.freezeRow = frozen.length;
  v.rowOrder = frozen.concat(rest);
  v.frozenMoved = new Set();   // 重建后移动记录不再可靠, 清空(原地语义)
}
function setTitleRow(ri) {
  // 设为标题行: 唯一(设新行时旧行静默归位); 永久置顶冻结; 不计行号; 列名来源切换。
  // 该行若已在常规冻结区, 常规冻结数减 1(它"转入"标题, 冻结集合的显示不变, 避免重复冻结)
  const v = view();
  if (v.titleRow != null && v.titleRow !== ri) unsetTitleRowInner();
  const seq = rowSeq();
  const pos = seq.indexOf(ri);
  const took = pos >= 0 && pos < v.freezeRow;
  v.titlePre = { freezeRow: v.freezeRow, hasHeader: v.hasHeader, took };   // took: 取消时按转入逆转(不再回滚快照值)
  if (took) v.freezeRow -= 1;
  v.titleRow = ri;
  v.hasHeader = true;
  v.selRanges = null;
  setSelCell(null);
  dirtyHeights = true;
  renderAll();
  toast(t('title_row_set'), 'ok');
}
function unsetTitleRow() {
  unsetTitleRowInner();
  dirtyHeights = true;
  renderAll();
  toast(t('title_row_unset'), 'ok');
}

// 把"加入冻结区"时物化前置的行/列放回原号序位置(第十一批反馈3: 取消冻结要归位,
// 留在原前缀位会让行号视觉乱序)。只归位**被移动过**的行/列(v.frozenMoved/frozenColMoved
// 记录"加入冻结区"的移动); 原地冻结("冻结到此行/列")的行/列取消后保持现位——排序物化
// 场景按原号强插会把排序序打乱(实测 desc 排序冻结后取消, 显示序被还原成自然序的教训)
function insertByOrig(list, item) {
  let at = list.findIndex((x) => x > item);
  if (at < 0) at = list.length;
  list.splice(at, 0, item);
}
function unfreezeRowsAll() {
  const v = view();
  const seq = rowSeq();
  const tr = v.titleRow;
  const moved = v.frozenMoved || new Set();
  const stayers = [], movers = [];
  for (const ri of seq.slice(0, frozenRows(v))) {
    if (ri === tr) continue;                 // 标题行不物化, 保持置顶
    (moved.has(ri) ? movers : stayers).push(ri);
  }
  const rest = seq.slice(frozenRows(v));
  movers.sort((a, b) => a - b);
  for (const ri of movers) insertByOrig(rest, ri);
  v.rowOrder = (tr != null ? [tr] : []).concat(stayers).concat(rest);   // rowOrder 须含全部行
  v.freezeRow = 0;
  v.frozenMoved = new Set();
  dirtyHeights = true;
  renderAll();
}
function moveRowOutOfFrozen(ri) {
  const v = view();
  const seq = rowSeq();
  const pos = seq.indexOf(ri);
  if (pos < 0 || pos >= frozenRows(v) || ri === v.titleRow) return;
  seq.splice(pos, 1);
  const nf = frozenRows(v) - 1;                 // 取出后冻结前缀长度
  const tr = v.titleRow;
  const frozen = seq.slice(0, nf).filter((x) => x !== tr);
  const rest = seq.slice(nf).filter((x) => x !== tr);
  insertByOrig(rest, ri);
  v.rowOrder = (tr != null ? [tr] : []).concat(frozen).concat(rest);   // rowOrder 须含全部行(含标题行本体)
  v.freezeRow = Math.max(0, v.freezeRow - 1);
  if (v.frozenMoved) v.frozenMoved.delete(ri);
  dirtyHeights = true;
  renderAll();
}
function unfreezeColsAll() {
  const v = view();
  const visible = visibleCols();
  const moved = v.frozenColMoved || new Set();
  const stayers = [], movers = [];
  for (const c of visible.slice(0, v.freezeCol)) {
    (moved.has(c) ? movers : stayers).push(c);
  }
  const rest = v.order.filter((c) => !stayers.includes(c) && !movers.includes(c));
  movers.sort((a, b) => a - b);
  for (const c of movers) insertByOrig(rest, c);
  v.order = stayers.concat(rest);
  v.freezeCol = 0;
  v.frozenColMoved = new Set();
  dirtyHeights = true;
  renderAll();
}
function moveColOutOfFrozen(ci) {
  const v = view();
  const di = visibleCols().indexOf(ci);
  if (di < 0 || di >= v.freezeCol) return;
  const fc = visibleCols().slice(0, v.freezeCol).filter((c) => c !== ci);
  const rest = v.order.filter((c) => c !== ci && !fc.includes(c));
  insertByOrig(rest, ci);
  v.order = fc.concat(rest);
  v.freezeCol -= 1;
  if (v.frozenColMoved) v.frozenColMoved.delete(ci);
  dirtyHeights = true;
  renderAll();
}

function openRowMenu(e, ri) {
  const v = view();
  const items = [];
  const seq = rowSeq();
  const pos = seq.indexOf(ri);
  if (v.titleRow != null && ri === v.titleRow) {
    items.push({ label: t('m_unset_title'), fn: unsetTitleRow });
  } else {
    items.push({ label: t('m_set_title'), fn: () => setTitleRow(ri) });
    items.push('-');
  }
  if (pos >= frozenRows(v)) {
    items.push({ label: t('m_freeze_to_row'), fn: () => { v.freezeRow = v.titleRow != null ? pos : pos + 1; dirtyHeights = true; renderAll(); } });
    items.push({ label: t('m_row_freeze_add'), fn: () => {
      if (pos < 0) return;
      seq.splice(pos, 1);
      seq.splice(frozenRows(v), 0, ri);
      v.rowOrder = seq;
      if (!v.frozenMoved) v.frozenMoved = new Set();
      v.frozenMoved.add(ri);      // 记录移动: 取消冻结时归位(原地冻结的行保持现位)
      v.freezeRow += 1;
      dirtyHeights = true;
      renderAll();
    } });
  } else if (ri !== v.titleRow) {
    items.push({ label: t('m_row_unfreeze'), fn: () => moveRowOutOfFrozen(ri) });
  }
  if (v.freezeRow > 0) items.push({ label: t('m_rows_unfreeze_all'), fn: unfreezeRowsAll });
  items.push(alignSubMenu((mode) => {
    if (mode) v.rowAlign[ri] = mode; else delete v.rowAlign[ri];
    renderAll();
  }));
  items.push({ label: t('m_row_height'), fn: () => {
    const n = promptPx(t('prompt_row_height'), Math.round(rowH[ri] || 30));
    if (n) { v.rowH[ri] = clamp(n, ROWH_MIN, ROWH_MAX); dirtyHeights = true; renderAll(); }
  } });
  showMenu(e, items);
}
function setAlign(ci, mode) {
  const v = view();
  if (mode) v.align[ci] = mode;
  else delete v.align[ci];
  renderAll();
}

function hideCols(list) {
  const v = view();
  const cols = visibleCols();
  const di = cols.indexOf(list[0]);
  list.forEach((c) => v.hiddenSet.add(c));
  // 冻结列数收缩
  if (di >= 0 && di < v.freezeCol) v.freezeCol = Math.min(v.freezeCol, di);
  dirtyHeights = true;
  renderAll();
}

/* ================= 筛选面板 ================= */
// 操作符下拉: [op, 字典键], 渲染时 t() 取词
const OPS = [
  { g: 'op_group_text', items: [
    ['contains', 'op_contains'], ['not_contains', 'op_not_contains'], ['equals', 'op_equals'], ['not_equals', 'op_not_equals'],
    ['starts', 'op_starts'], ['ends', 'op_ends'], ['empty', 'op_empty'], ['not_empty', 'op_not_empty'],
  ] },
  { g: 'op_group_num', items: [
    ['gt', 'op_gt'], ['lt', 'op_lt'], ['gte', 'op_gte'], ['lte', 'op_lte'], ['eq', 'op_eq'], ['ne', 'op_ne'],
  ] },
];

function openFilterPanel(ci) {
  const p = $('#filter-panel');
  const sh = sheet(), v = view();
  const cols = visibleCols();
  const cur = v.filters[ci] || { conds: [], colors: [] };
  const curVals = cur.values && cur.values.include ? cur.values.include : null;
  p.textContent = '';

  // 标题: 一行描述文本(不再提供列切换下拉 —— 多列筛选请用工具栏"筛选"模态框)
  const title = el('div', 'fp-title', t('fp_title'));
  const nameSpan = el('span', 'fp-colname', colName(ci));
  nameSpan.title = colName(ci);
  title.appendChild(nameSpan);
  const numTag = el('span', '', '');
  numTag.style.cssText = 'font-size:11px;color:var(--text-dim)';
  title.appendChild(numTag);
  p.appendChild(title);

  const condBox = el('div', 'fp-conds');
  p.appendChild(condBox);
  const condList = JSON.parse(JSON.stringify(cur.conds || []));
  if (!condList.length) condList.push({ op: 'contains', val: '' });
  function renderConds() {
    condBox.textContent = '';
    condList.forEach((c, i) => {
      const row = el('div', 'fp-cond');
      const sel = document.createElement('select');
      OPS.forEach((g) => {
        const og = document.createElement('optgroup');
        og.label = t(g.g);
        g.items.forEach(([op, key]) => {
          const o = document.createElement('option');
          o.value = op; o.textContent = t(key);
          if (c.op === op) o.selected = true;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      sel.onchange = () => { condList[i].op = sel.value; };
      const inp = document.createElement('input');
      inp.placeholder = t('fp_val_ph');
      inp.value = c.val == null ? '' : c.val;
      inp.oninput = () => { condList[i].val = inp.value; };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') apply(); };
      const del = el('button', 'del', '✕');
      del.title = t('fp_del_cond');
      del.onclick = () => { condList.splice(i, 1); renderConds(); };
      row.append(sel, inp, del);
      condBox.appendChild(row);
    });
    const add = el('button', 'fp-add', t('fp_add_cond'));
    add.onclick = () => { condList.push({ op: 'contains', val: '' }); renderConds(); condBox.lastChild.previousSibling; const inputs = condBox.querySelectorAll('input'); inputs[inputs.length - 1].focus(); };
    condBox.appendChild(add);
  }
  renderConds();
  p.appendChild(el('div', 'fp-note', t('fp_note')));

  // 颜色筛选
  const usedColors = new Map(); // hex -> count
  for (const row of sh.rows) {
    const cIdx = row[ci][1];
    const key = cIdx >= 0 ? sh.palette[cIdx] : 'none';
    usedColors.set(key, (usedColors.get(key) || 0) + 1);
  }
  const colorsBox = el('div', 'fp-colors');
  colorsBox.appendChild(el('div', 'lbl', t('fp_color_lbl')));
  const swBox = el('div', 'fp-swatches');
  const selColors = new Set(cur.colors || []);
  for (const [hex] of usedColors) {
    const sw = el('div', 'fp-sw' + (hex === 'none' ? ' none' : '') + (selColors.has(hex) ? ' sel' : ''));
    if (hex !== 'none') sw.style.background = hex;
    sw.title = hex === 'none' ? t('fp_no_fill') : hex;
    sw.onclick = () => { sw.classList.toggle('sel'); sw.classList.contains('sel') ? selColors.add(hex) : selColors.delete(hex); };
    swBox.appendChild(sw);
  }
  colorsBox.appendChild(swBox);
  if (usedColors.size <= 1) colorsBox.appendChild(el('div', 'lbl', t('fp_no_colors'))).style.marginTop = '4px';
  p.appendChild(colorsBox);

  // ---- 按值分类筛选(Excel/WPS 默认筛选风格) ----
  const valsBox = el('div', 'fp-vals');
  const allVals = [];
  const valCount = new Map();
  for (const row of sh.rows) {
    const raw = row[ci][0];
    const s = raw === null || raw === undefined ? '' : String(raw);
    if (!valCount.has(s)) { valCount.set(s, 0); allVals.push(s); }
    valCount.set(s, valCount.get(s) + 1);
  }
  allVals.sort((a, b) => valCount.get(b) - valCount.get(a));
  const excluded = new Set(curVals ? allVals.filter((s) => !curVals.includes(s)) : []);
  const valsHead = el('div', 'lbl');
  const valsTitle = el('span', '', t('fp_by_value', { n: allVals.length }));
  const search = document.createElement('input');
  search.placeholder = t('fp_search_ph');
  const selAll = el('button', 'mini', t('fp_sel_all'));
  const selNone = el('button', 'mini', t('fp_sel_none'));
  valsHead.append(valsTitle, search, selAll, selNone);
  valsBox.appendChild(valsHead);
  const vlist = el('div', 'fp-vlist');
  valsBox.appendChild(vlist);
  function renderVals() {
    const kw = search.value.trim().toLowerCase();
    vlist.textContent = '';
    let shown = 0;
    for (const s of allVals) {
      if (kw && !s.toLowerCase().includes(kw)) continue;
      if (++shown > 300) break;
      const rowEl = el('div', 'fv-row');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !excluded.has(s);
      cb.onchange = () => { cb.checked ? excluded.delete(s) : excluded.add(s); };
      const valEl = el('span', 'fv-val', s === '' ? t('fp_empty_val') : s);
      valEl.title = s;
      rowEl.append(cb, valEl, el('span', 'fv-count', String(valCount.get(s))));
      vlist.appendChild(rowEl);
    }
    if (!vlist.children.length) vlist.appendChild(el('div', 'fv-row', t('fp_no_match_val')));
  }
  search.oninput = renderVals;
  selAll.onclick = () => { excluded.clear(); renderVals(); };
  selNone.onclick = () => { allVals.forEach((s) => excluded.add(s)); renderVals(); };
  renderVals();
  p.appendChild(valsBox);

  // 按钮
  const btns = el('div', 'fp-btns');
  const clearBtn = el('button', 'tbtn fp-clear-left', t('fp_clear_col'));
  clearBtn.onclick = () => { delete v.filters[ci]; closePopups(); renderAll(); };
  const cancel = el('button', 'tbtn', t('btn_cancel'));
  cancel.onclick = closePopups;
  const ok = el('button', 'tbtn primary', t('filter_apply_short'));
  ok.onclick = apply;
  function apply() {
    const clean = condList.filter((c) => c.val !== '' || c.op === 'empty' || c.op === 'not_empty');
    const include = excluded.size ? allVals.filter((s) => !excluded.has(s)) : null;
    if (!clean.length && !selColors.size && !include) delete v.filters[ci];
    else v.filters[ci] = { conds: clean, colors: Array.from(selColors), values: include ? { include } : null };
    closePopups();
    renderAll();
  }
  btns.append(clearBtn, cancel, ok);
  p.appendChild(btns);

  // 定位: 列头下方
  closePopups();
  p.classList.add('open');
  const hcell = document.querySelector(`.vrow.rowhead .cell[data-di="${cols.indexOf(ci)}"]`);
  let x = 80, y = 120;
  if (hcell) {
    const r = hcell.getBoundingClientRect();
    x = r.left; y = r.bottom + 4;
  }
  const pw = 460, ph = p.offsetHeight || 380;
  x = clamp(x, 8, window.innerWidth - pw - 8);
  y = y + ph > window.innerHeight - 30 ? Math.max(8, y - ph - 30) : y;
  p.style.left = x + 'px';
  p.style.top = y + 'px';

  if (!(ci in v.numCols)) v.numCols[ci] = colIsNumeric(ci);
  numTag.textContent = v.numCols[ci] ? t('col_is_num') : t('col_is_txt');
}

/* ================= 多条件筛选模态框(工具栏"筛选"按钮) ================= */
function openFilterModal() {
  if (!FILES.length) { toast(t('filter_need_file'), 'warn'); return; }
  const v = view();
  const cols = visibleCols();
  if (!cols.length) { toast(t('filter_no_cols'), 'warn'); return; }
  const mask = $('#modal-mask'), m = $('#modal');
  m.textContent = '';
  m.classList.remove('cell-modal', 'search-modal');
  m.classList.add('fm-modal');
  m.appendChild(el('h3', '', t('filter_modal_title')));
  const selRowsSet = new Set();
  (v.selRanges || []).forEach((rg) => { for (let r = rg.r1; r <= rg.r2; r++) selRowsSet.add(r); });
  const selRowsTxt = selRowsSet.size ? t('filter_sel_scope', { n: selRowsSet.size }) : '';
  m.appendChild(el('div', 'fm-sub', t('filter_modal_sub', { name: sheet().name, sel: selRowsTxt })));
  // 载入现有条件: 把各列的 conds 摊平成行(colors/values 类筛选保留不动, 仅在此编辑条件)
  const list = [];
  for (const [k, f] of Object.entries(v.filters)) {
    const ci = Number(k);
    if (!cols.includes(ci)) continue;
    (f.conds || []).forEach((c) => list.push({ col: ci, op: c.op, val: c.val == null ? '' : String(c.val) }));
  }
  if (!list.length) list.push({ col: cols[0], op: 'contains', val: '' });
  const listBox = el('div', 'fm-list');
  m.appendChild(listBox);
  function renderRows() {
    listBox.textContent = '';
    list.forEach((r, i) => {
      const row = el('div', 'fm-row');
      const colSel = document.createElement('select');
      colSel.className = 'fm-col';
      cols.forEach((c) => {
        const o = document.createElement('option');
        o.value = c; o.textContent = colName(c);
        if (c === r.col) o.selected = true;
        colSel.appendChild(o);
      });
      colSel.onchange = () => { list[i].col = Number(colSel.value); refreshTag(); };
      const sel = document.createElement('select');
      sel.className = 'fm-op';
      OPS.forEach((g) => {
        const og = document.createElement('optgroup');
        og.label = t(g.g);
        g.items.forEach(([op, key]) => {
          const o = document.createElement('option');
          o.value = op; o.textContent = t(key);
          if (r.op === op) o.selected = true;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      sel.onchange = () => { list[i].op = sel.value; };
      const inp = document.createElement('input');
      inp.placeholder = t('fp_val_ph');
      inp.value = r.val;
      inp.oninput = () => { list[i].val = inp.value; };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyBtn.click(); } };
      const tag = el('span', 'fm-tag', '');
      function refreshTag() {
        if (!(r.col in v.numCols)) v.numCols[r.col] = colIsNumeric(r.col);
        tag.textContent = v.numCols[r.col] ? t('col_is_num') : t('col_is_txt');
      }
      refreshTag();
      const del = el('button', 'del', '✕');
      del.title = t('fp_del_cond');
      del.onclick = () => { list.splice(i, 1); renderRows(); };
      row.append(colSel, sel, inp, tag, del);
      listBox.appendChild(row);
    });
    const add = el('button', 'fm-add', t('fp_add_cond'));
    add.onclick = () => { list.push({ col: cols[0], op: 'contains', val: '' }); renderRows(); const inputs = listBox.querySelectorAll('input'); inputs[inputs.length - 1].focus(); };
    listBox.appendChild(add);
  }
  renderRows();
  m.appendChild(el('div', 'fm-note', t('filter_modal_note')));
  const btns = el('div', 'm-btns');
  const clearBtn = el('button', 'tbtn danger-btn m-clear', t('filter_clear_all'));
  clearBtn.onclick = () => {
    v.filters = {};
    mask.classList.remove('open');
    renderAll();
    toast(t('filter_cleared_all'), 'ok');
  };
  const cancel = el('button', 'tbtn', t('btn_cancel'));
  cancel.onclick = () => mask.classList.remove('open');
  const applyBtn = el('button', 'tbtn primary', t('filter_apply'));
  applyBtn.onclick = () => {
    // 按列分组重建各列 conds; 保留列头面板设置的 colors/values 不动
    const byCol = {};
    list.forEach((r) => {
      const clean = r.val !== '' || r.op === 'empty' || r.op === 'not_empty';
      if (clean) (byCol[r.col] = byCol[r.col] || []).push({ op: r.op, val: r.val });
    });
    for (const k of Object.keys(v.filters)) {
      const ci = Number(k);
      const f = v.filters[ci];
      const newConds = byCol[ci] || [];
      const hasColor = (f.colors || []).length > 0;
      const hasVals = !!(f.values && f.values.include);
      if (!newConds.length && !hasColor && !hasVals) delete v.filters[ci];
      else f.conds = newConds;
      delete byCol[ci];
    }
    for (const [col, conds] of Object.entries(byCol)) {
      v.filters[Number(col)] = { conds, colors: [], values: null };
    }
    mask.classList.remove('open');
    renderAll();
  };
  btns.append(clearBtn, cancel, applyBtn);
  m.appendChild(btns);
  mask.classList.add('open');
}

/* ================= 列设置面板 ================= */
function openColsPanel() {
  const p = $('#cols-panel');
  const sh = sheet(), v = view();
  p.textContent = '';
  const head = el('div', 'cp-head');
  head.appendChild(el('span', '', t('cp_title')));
  const sp = el('div', 'spacer');
  const showAll = el('button', 'tbtn', t('cp_show_all'));
  showAll.onclick = () => { v.hiddenSet.clear(); resetHeights(v); renderAll(); openColsPanel(); };
  const autoAll = el('button', 'tbtn', t('cp_auto_width'));
  autoAll.onclick = () => { v.colW = {}; resetHeights(v); renderAll(); };
  head.append(sp, autoAll, showAll);
  p.appendChild(head);

  const list = el('div', 'cp-list');
  const render = () => {
    list.textContent = '';
    v.order.forEach((ci, pos) => {
      const row = el('div', 'cp-row' + (v.hiddenSet.has(ci) ? ' off' : ''));
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !v.hiddenSet.has(ci);
      cb.onchange = () => {
        if (cb.checked) v.hiddenSet.delete(ci);
        else {
          v.hiddenSet.add(ci);
          const di = visibleCols().indexOf(ci);
          if (di >= 0 && di < v.freezeCol) v.freezeCol = Math.min(v.freezeCol, di);
        }
        resetHeights(v);
        renderAll();
        render();
      };
      const name = el('span', 'cp-name', colName(ci));
      const alignSel = document.createElement('select');
      alignSel.className = 'cp-align';
      [['', 'cp_align'], ['left', 'cp_left'], ['center', 'cp_center'], ['right', 'cp_right']].forEach(([val, key]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = t(key);
        if ((v.align[ci] || '') === val) o.selected = true;
        alignSel.appendChild(o);
      });
      alignSel.onchange = () => setAlign(ci, alignSel.value || null);
      const mv = el('div', 'cp-move');
      const up = el('button', '', '↑'); up.title = t('cp_up');
      up.onclick = () => { if (pos > 0) { const swp = v.order[pos - 1]; v.order[pos - 1] = v.order[pos]; v.order[pos] = swp; resetHeights(v); renderAll(); render(); } };
      const dn = el('button', '', '↓'); dn.title = t('cp_dn');
      dn.onclick = () => { if (pos < v.order.length - 1) { const swp = v.order[pos + 1]; v.order[pos + 1] = v.order[pos]; v.order[pos] = swp; resetHeights(v); renderAll(); render(); } };
      mv.append(up, dn);
      row.append(cb, name, alignSel, mv);
      list.appendChild(row);
    });
  };
  render();
  p.appendChild(list);
  const btn = $('#btn-columns');
  const r = btn.getBoundingClientRect();
  p.style.left = clamp(r.right - 380, 8, window.innerWidth - 390) + 'px';
  p.style.top = (r.bottom + 6) + 'px';
  closePopups();
  p.classList.add('open');
}

/* ================= 保存写回 ================= */
function buildPayload() {
  const v = view(), sh = sheet(), fd = curFile().data;
  const visible = v.order.filter((c) => !v.hiddenSet.has(c));
  const hiddenCols = v.order.filter((c) => v.hiddenSet.has(c));
  const orderAll = visible.concat(hiddenCols);
  const posOf = {}; orderAll.forEach((ci, i) => { posOf[ci] = i; });
  const filters = [];
  for (const [k, f] of Object.entries(v.filters)) {
    const ci = Number(k);
    const hasVals = f.values && f.values.include && f.values.include.length;
    if (!f.conds.length && !f.colors.length && !hasVals) continue;
    filters.push({ col: posOf[ci], conds: f.conds, colors: f.colors,
                   values: hasVals ? { include: f.values.include } : null });
  }
  const colWidths = {};
  const align = {};
  for (const ci of visible) {
    colWidths[String(posOf[ci])] = Math.round(colWidth(ci));
    if (v.align[ci]) align[String(posOf[ci])] = v.align[ci];
  }
  const rowH = {}, rowAlign = {};
  Object.keys(v.rowH).forEach((k) => { rowH[String(k)] = Math.round(v.rowH[k]); });
  Object.keys(v.rowAlign).forEach((k) => { rowAlign[String(k)] = v.rowAlign[k]; });
  const seq = rowSeq();
  const isDefaultOrder = seq.every((ri, i) => ri === i);
  return {
    path: fd.path, format: fd.format, sheet: sh.name,
    order: orderAll,
    rowOrder: isDefaultOrder ? null : seq.slice(),
    hidden: hiddenCols.map((ci) => posOf[ci]),
    // 标题行写入后物理位于第 1 行, 冻结数含它(1) + 常规冻结
    freezeRow: frozenRows(v), freezeCol: v.freezeCol,
    filters, colWidths, align, rowH, rowAlign, wrap: true,
  };
}

async function saveBack() {
  if (!curFile()) return;
  const fd = curFile().data;
  const p = buildPayload();
  const isXls = fd.format === 'xls';
  const msg = isXls
    ? t('save_msg_xls', { f: fd.path.replace(/\.xls$/i, '') + '.xlsx' })
    : t('save_msg', { f: fd.path, r: view().freezeRow, c: view().freezeCol });
  showConfirm(t('save_title'), msg, async () => {
    let res = await callApi('save_back', JSON.stringify(p));
    if (res === null && location.origin.startsWith('http')) {
      // dev 模式走 http
      const r = await fetch('/api/save_back', { method: 'POST', body: JSON.stringify(p) });
      res = await r.json();
    }
    if (res && res.ok) {
      let m = t('save_ok', { f: res.savedTo });
      if (res.backup) m += t('save_backup', { f: res.backup });
      // notes 为后端稳定码(note:xxx 是字典键, t() 未知串原样透传)
      if (res.notes && res.notes.length) m += '\n' + res.notes.map((s) => t(s)).join('\n');
      toast(m, 'ok');
    } else {
      toast(t('save_failed', { e: (res && res.error) || t('unknown_error') }), 'err');
    }
  });
}

function showConfirm(title, body, onOk, okLabel) {
  const mask = $('#modal-mask'), m = $('#modal');
  m.textContent = '';
  m.classList.remove('cell-modal');
  m.appendChild(el('h3', '', title));
  m.appendChild(el('div', 'm-body', body));
  const btns = el('div', 'm-btns');
  const cancel = el('button', 'tbtn', t('btn_cancel'));
  cancel.onclick = () => mask.classList.remove('open');
  const ok = el('button', 'tbtn danger-btn', okLabel || t('save_confirm'));
  ok.onclick = () => { mask.classList.remove('open'); onOk(); };
  btns.append(cancel, ok);
  m.appendChild(btns);
  mask.classList.add('open');
}

/* ================= 窗口边缘拖拽调尺寸(经 api.win_resize) ================= */
const EDGE = 7;
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
function buildResizeHandles() {
  const frag = document.createDocumentFragment();
  for (const dir of RESIZE_DIRS) {
    const h = el('div', 'win-edge edge-' + dir);
    h.dataset.dir = dir;
    frag.appendChild(h);
  }
  document.body.appendChild(frag);
}
let resizeDrag = null;
let winMaxed = false;   // 窗口最大化状态: 边缘拖拽守卫(refreshMaxIcon 维护)
function endResizeDrag() {
  if (!resizeDrag) return;
  resizeDrag = null;
  document.body.classList.remove('win-resizing');
}
document.addEventListener('mousedown', (e) => {
  if (resizeDrag) endResizeDrag();   // 僵尸拖拽自愈: 上一轮若丢了 mouseup, 任何新按下先清场
  const seam = e.target.closest('.hide-seam');
  if (seam && e.button === 0) {
    // 从间隙拉出隐藏列: 先以 8px 恢复显示, 转入常规 resize 拖拽; 原地松手会重新隐藏
    const cols = seam.dataset.cols.split(',').map(Number);
    const ci = cols[0];
    const v = view();
    v.hiddenSet.delete(ci);
    v.colW[ci] = 8;
    resetHeights(v);
    renderAll();
    dragCtx = { mode: 'resize', ci, startX: e.clientX, startW: 8, fromSeam: true };
    document.body.classList.add('col-resizing');
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const rh = e.target.closest('.row-resizer');
  if (rh && e.button === 0) {
    const ri = Number(rh.dataset.ri);
    if (rzDetect('r' + ri, e.clientX, e.clientY)) { autoFitRow(ri); e.preventDefault(); return; }
    dragCtx = { mode: 'rowh', ri, startY: e.clientY, startH: rowH[ri] || 30 };
    document.body.classList.add('col-resizing');
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const h = e.target.closest('.win-edge');
  if (!h || e.button !== 0) return;
  if (winMaxed) return;   // 最大化下边缘拖拽无效且污染还原尺寸(WinForms 把 ClientSize 写进 restore bounds)
  e.preventDefault();
  // 首选系统原生 resize 循环(win_sys_resize→WM_SYSCOMMAND SC_SIZE): 系统接管鼠标
  // 捕获/光标/几何原子更新, 丝滑+跟手; 桥不可用/失败/超时回退旧 JS 拖拽路径(兜底)
  const startJsDrag = () => {
    if (resizeDrag) return;
    resizeDrag = { dir: h.dataset.dir, x: e.clientX, y: e.clientY, w: window.innerWidth, h: window.innerHeight };
    document.body.classList.add('win-resizing');
  };
  const p = callApi('win_sys_resize', h.dataset.dir);
  if (p && typeof p.then === 'function') {
    let decided = false;
    const timer = setTimeout(() => { if (!decided) { decided = true; startJsDrag(); } }, 300);   // 桥无响应兜底
    p.then(r => {
      if (decided) return;
      decided = true; clearTimeout(timer);
      if (!r || !r.ok) startJsDrag();   // 后端拒绝 → 转 JS 路径(左键已松的场景 r.ok 仍 true, 无拖拽可续)
    }).catch(() => { if (!decided) { decided = true; clearTimeout(timer); startJsDrag(); } });
    return;
  }
  startJsDrag();   // dev 浏览器(无桥): 维持旧 JS 路径
});
// 由一次 mousemove 事件计算并应用目标尺寸(按下时的 w/h 为基线, 绝对目标天然自纠窗口移动反馈)
function resizeApply(ctx, e) {
  const dx = e.clientX - ctx.x, dy = e.clientY - ctx.y;
  let w = ctx.w, h = ctx.h;
  if (ctx.dir.includes('e')) w += dx;
  if (ctx.dir.includes('s')) h += dy;
  if (ctx.dir.includes('w')) w -= dx;
  if (ctx.dir.includes('n')) h -= dy;
  ctx.curW = Math.max(960, w); ctx.curH = Math.max(600, h);
  // w/n 方向: 宽高增量取负 = 左/上边缘位移, 窗口锚点随之移动, 拖哪边动哪边
  const mvx = ctx.dir.includes('w') ? -(ctx.curW - ctx.w) : 0;
  const mvy = ctx.dir.includes('n') ? -(ctx.curH - ctx.h) : 0;
  ctx.curMx = mvx; ctx.curMy = mvy;
  callApi('win_resize', ctx.curW, ctx.curH, mvx, mvy);
}
document.addEventListener('mousemove', (e) => {
  if (!resizeDrag) return;
  // 按键防线: 向外拖拽时鼠标离开窗口会中断事件流(mouseup 丢失), 指针回到窗内后
  // 纯悬停移动不得继续驱动拖拽(否则窗口跟着鼠标乱跑)——无左键立即终止悬挂拖拽
  if (!(e.buttons & 1)) { endResizeDrag(); return; }
  const now = Date.now();
  if (resizeDrag.last && now - resizeDrag.last < 30) { resizeDrag.pending = e; return; }
  resizeDrag.last = now; resizeDrag.pending = null;
  resizeApply(resizeDrag, e);
});
document.addEventListener('mouseup', (e) => {
  if (!resizeDrag) return;
  const ctx = resizeDrag;
  endResizeDrag();
  // 用被节流扣下的最后事件重算, 而不是落在上一个已计算的旧尺寸(松手前 ≤30ms 的位移不再丢失)
  if (ctx.pending) resizeApply(ctx, ctx.pending);
});
// 窗口失焦(alt-tab/系统对话框): 拖拽中断兜底, 防止 win-resizing 类与 resizeDrag 悬挂
window.addEventListener('blur', endResizeDrag);

/* ================= 工具栏 & 全局事件 ================= */
function bindUI() {
  $('#btn-open').onclick = openFile;
  $('#btn-open-2').onclick = openFile;
  $('#btn-save').onclick = saveBack;
  $('#btn-columns').onclick = (e) => { e.stopPropagation(); openColsPanel(); };
  $('#btn-filters').onclick = openFilterModal;
  $('#btn-sort').onclick = (e) => {
    const v = view();
    if (!v) return;
    if (v.selRanges && v.selRanges.length && isSingleColSel(v) === null) {
      // 防御: 正常情况按钮已 disabled; 非预期触发时给出与排序入口一致的提示
      toast(t('sort_disabled_multisel'), 'warn');
      return;
    }
    showMenu(e, [
      { label: t('sort_menu_asc'), fn: () => quickSort('asc') },
      { label: t('sort_menu_desc'), fn: () => quickSort('desc') },
      '-',
      { label: t('sort_menu_custom'), fn: openSortModal },
    ]);
  };
  $('#btn-mock').onclick = async () => {
    try {
      const m = location.search.match(/file=([^&]+)/);
      const r = await fetch(m ? '/api/mock?file=' + m[1] : '/api/mock');
      loadFileData(await r.json());
    } catch (err) { toast(t('mock_failed', { e: err }), 'err'); }
  };
  $('#in-frz-row').oninput = () => {
    const v = view();
    const n = parseInt($('#in-frz-row').value);
    if (!v || isNaN(n)) return;
    v.freezeRow = clamp(n, 0, Math.min(10, sheet().rows.length));
    renderAll();
  };
  $('#in-frz-col').oninput = () => {
    const v = view();
    const n = parseInt($('#in-frz-col').value);
    if (!v || isNaN(n)) return;
    v.freezeCol = clamp(n, 0, visibleCols().length);
    renderAll();
  };
  // 窗体控制
  $('#btn-min').onclick = () => callApi('win_minimize');
  $('#btn-close').onclick = () => callApi('win_close');
  // 主题 / 语言
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-lang').onclick = toggleLang;
  // 双击标题栏: 最大化/还原
  document.querySelector('.tb-drag').addEventListener('dblclick', () => toggleMaxWindow());
  const btnMax = $('#btn-max');
  btnMax.onclick = () => toggleMaxWindow();
  btnMax.innerHTML = SVG_MAX;
  document.querySelector('#btn-min').innerHTML = SVG_MIN;
  document.querySelector('#btn-close').innerHTML = SVG_CLOSE;
  refreshMaxIcon();
  setInterval(refreshMaxIcon, 1200);
  // 点击外部关闭弹层: 右键菜单/列设置面板点外即关(原行为);
  // 筛选面板单独处理 —— 仅当点击"功能按钮/单元格(选中)"时关闭,
  // 正常单击或拖动主窗体空白(含标题栏拖动窗口位置)保持显示
  document.addEventListener('mousedown', (e) => {
    const tgt = e.target;
    if (tgt.closest('.popup') || tgt.closest('#btn-columns')) return;
    document.querySelectorAll('.popup.open').forEach((p) => {
      if (p.id !== 'filter-panel') p.classList.remove('open');
    });
    const fp = $('#filter-panel');
    if (!fp.classList.contains('open')) return;
    const onCtl = tgt.closest('#toolbar') || tgt.closest('.titlebar-btns') || tgt.closest('#sheet-tabs')
      || tgt.closest('#file-tabs') || tgt.closest('#filter-bar');
    const onCell = tgt.closest('.vrow .cell');
    if (onCtl || onCell) fp.classList.remove('open');
  });
  // 表头行未冻结时(freezeRow=0): 首行在 body 中渲染, 表头交互走一次性委托
  // (cols 动态取, 不随列序变化过期; 不能挂在 renderStructure 里, 那样每次渲染都会重复累积监听)
  const gi = inner();
  gi.addEventListener('mousedown', (e) => {
    if (!FILES.length || view().freezeRow !== 0) return;
    const row = e.target.closest('.vrow[data-ri="0"]');
    if (!row || row.classList.contains('rfrozen')) return;
    onHeaderMouseDown(e, visibleCols());
  }, { capture: true });
  gi.addEventListener('dblclick', (e) => {
    if (!FILES.length || view().freezeRow !== 0) return;
    const cell = e.target.closest('.vrow[data-ri="0"] .cell:not(.rownum)');
    if (!cell || e.target.closest('.col-resizer')) return;
    openFilterPanel(visibleCols()[Number(cell.dataset.di)]);
  });
  gi.addEventListener('contextmenu', (e) => {
    if (!FILES.length || view().freezeRow !== 0) return;
    const cell = e.target.closest('.vrow[data-ri="0"] .cell:not(.rownum)');
    if (!cell) return;
    e.preventDefault();
    openCtxMenu(e, visibleCols()[Number(cell.dataset.di)]);
  });
  grid().addEventListener('scroll', () => {
    const g = grid();
    g.classList.toggle('scrolled-x', g.scrollLeft > 0);
    g.classList.toggle('scrolled-y', g.scrollTop > 0);   // 冻结区底缘阴影开关(与列 frozen-edge 阴影对称)
    requestAnimationFrame(renderBody);   // renderBody 内部已含 fixRowHeights
  });
  // 悬停列高亮(行高亮已有 :hover; 这里补列)。用 mousemove 而非 mouseover:
  // 部分合成输入/触摸路径不派发 mouseover, mousemove 必定触发
  grid().addEventListener('mousemove', (e) => {
    const cell = e.target.closest('.cell');
    setColHover(cell && !cell.classList.contains('rownum') && cell.dataset.di !== undefined
      ? Number(cell.dataset.di) : null);
  });
  grid().addEventListener('mouseleave', () => setColHover(null));
  // 单击选中单元格 / 点击空白清除单选+多选; 列头多选清除
  grid().addEventListener('click', (e) => {
    if (!FILES.length) return;
    if (isDragEndClick(e)) return;   // 刚结束拖拽框选: 合成 click 不处理(保住选区)
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('rownum') || cell.classList.contains('hcell')) {
      if (!cell) { setColHover(null); clearSelAll(); }   // grid 空白: 清全部选中
      return;
    }
    const v = view();
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // 普通点击(无论落在文字还是空白)= 纯单选该格, 清多选(文字上的点击不走 mousedown 选区分支,
      // 若不清会残留上一个 ranges 造成"高亮在前一格、虚线在后一格"的误导)
      v.selRanges = null;
      document.querySelectorAll('.cell.msel').forEach((c) => c.classList.remove('msel', 'm-e-t', 'm-e-b', 'm-e-l', 'm-e-r'));
      updateStatus();
    }
    if (v.colSel && v.colSel.size) {
      v.colSel.clear();
      document.querySelectorAll('.cell.colsel').forEach((c) => c.classList.remove('colsel'));
    }
    const row = cell.closest('.vrow');
    if (!row || row.dataset.ri === undefined) return;
    setSelCell({ ri: Number(row.dataset.ri), ci: visibleCols()[Number(cell.dataset.di)] });
  });
  // 双击"内容超出盒尺寸"或"压缩态且被截断"的正文格 → 模态窗展示全文; 其余不弹(留给原生文本选择)
  grid().addEventListener('dblclick', (e) => {
    if (!FILES.length) return;
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('rownum') || cell.classList.contains('hcell')) return;
    if (e.target.closest('.row-resizer') || e.target.closest('.col-resizer')) return;
    const truncated = cell.classList.contains('c-ell') && cell.title && cell.textContent !== cell.title;
    const overflow = cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1;
    if (!truncated && !overflow) return;
    const row = cell.closest('.vrow');
    if (!row || row.dataset.ri === undefined) return;
    openCellModal(Number(row.dataset.ri), visibleCols()[Number(cell.dataset.di)]);
  });

  /* ---- T014: 框选/多选单元格 ---- */
  grid().addEventListener('mousedown', onGridSelectMouseDown);
  grid().addEventListener('contextmenu', (e) => {
    // 右键被选中的正文格 = 取消选中(单选/多选); 未选中格/行号/列头维持原有行为
    if (!FILES.length) return;
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('rownum') || cell.classList.contains('hcell')) return;
    if (cell.classList.contains('selcell') || cell.classList.contains('msel')) {
      e.preventDefault();
      clearSelAll();
    }
  });
  // 单击任意非表格区域(工具栏/状态栏/弹层外空白)清空选中;
  // 排序/筛选按钮除外 —— 它们要消费选区(排序目标列/筛选范围), 不能被自己清掉。
  // 用 capture: 列设置按钮 onclick 里的 stopPropagation 不影响捕获阶段
  document.addEventListener('click', (e) => {
    if (!FILES.length) return;
    if (isDragEndClick(e)) return;   // 拖拽合成的 click 落在公共祖先上, 放行
    if (e.target.closest('.vrow') || e.target.closest('.popup') || e.target.closest('#modal-mask')) return;
    if (e.target.closest('#btn-sort') || e.target.closest('#btn-filters')) return;
    const v = view();
    if (v && (v.selCell || (v.selRanges && v.selRanges.length))) clearSelAll();
  }, true);
  // Ctrl+C 复制选中内容: 走原生 copy 事件写 clipboardData(输入框聚焦/文本划选时放行原生行为)
  document.addEventListener('copy', (e) => {
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    const v = view();
    if (!v || (!v.selCell && !(v.selRanges && v.selRanges.length))) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && String(sel).length > 0) return;   // 用户划选了文本: 原生优先
    const cp = buildCopyText();
    if (!cp) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', cp.text);
    toast(t('copied', { n: selCellCount(v), r: cp.rows, c: cp.cols }), 'ok');
  });
  // 点击遮罩空白处关闭模态窗
  $('#modal-mask').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  window.addEventListener('resize', () => requestAnimationFrame(renderBody));
  // 文件 tab 条: 滚轮横向滚动(无滚动条)
  const ftb = $('#file-tabs');
  if (ftb) {
    ftb.addEventListener('wheel', (e) => {
      if (ftb.scrollWidth <= ftb.clientWidth) return;
      ftb.scrollLeft += (e.deltaY || e.deltaX);
      e.preventDefault();
    }, { passive: false });
  }
  // Ctrl+F 搜索 / Esc 分级关闭: 模态 → 弹层 → 清选区
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape') {
      if ($('#modal-mask').classList.contains('open')) $('#modal-mask').classList.remove('open');
      else if (document.querySelector('.popup.open')) closePopups();
      else clearSelAll();
    }
  });
}
async function toggleMaxWindow() {
  await callApi('win_toggle_max');
  setTimeout(refreshMaxIcon, 350);
}

async function refreshMaxIcon() {
  if (!HAS_BRIDGE) return;
  const st = await callApi('win_get_max');
  const btn = document.querySelector('#btn-max');
  winMaxed = !!(st && st.maximized);
  document.body.classList.toggle('win-max', winMaxed);   // 最大化下隐藏边缘拖拽手柄
  if (!btn) return;
  if (st && st.maximized) {
    btn.innerHTML = SVG_RESTORE;
    btn.title = t('tb_max_off');
  } else {
    btn.innerHTML = SVG_MAX;
    btn.title = t('tb_max_on');
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', cur);
  try { localStorage.setItem('xv-theme', cur); } catch (e) {}
}

/* ================= 语言切换 ================= */
function refreshLangBtn() {
  // 按钮显示"目标语言"名: 中文界面显示 EN, 英文界面显示 中
  $('#btn-lang').textContent = LANG === 'zh' ? 'EN' : '中';
}
function toggleLang() {
  setLang(LANG === 'zh' ? 'en' : 'zh');
  refreshLangBtn();
  refreshMaxIcon();
  // 已渲染的动态文案(状态栏/标签卡/文件 tab/隐藏列提示等)随 activateFile 全量重建;
  // 菜单/模态框在下次打开时以新语言构建
  if (FILES.length) activateFile();
  else updateStatus();
}

/* ================= 启动 ================= */
(function boot() {
  let theme = 'dark';
  try { theme = localStorage.getItem('xv-theme') || 'dark'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
  bindUI();
  buildResizeHandles();
  refreshLangBtn();
  $('#btn-save').disabled = true;
})();
