/* Cella i18n: zh/en 双字典 + t(key, params) 取词 + 语言检测/切换/持久化。
   约定(见 T023):
   - 只管界面 chrome 文案; 单元格内容/列名/文件名/sheet 名是用户数据, 永不入字典;
   - 值内 {xxx} 为占位符, 由 t() 第二参对象替换;
   - 动态文案(菜单/模态框/状态栏)在构建处调 t(), 静态 HTML 用 data-i18n/-title/-ph 属性。
   注意: 全局函数名 t 只有一个字母, app.js 内不得再声明同名局部变量(会遮蔽)。 */
'use strict';

const I18N = {
  zh: {
    /* ---- 标题栏 / 工具栏 / 欢迎页 / 状态栏(静态, data-i18n) ---- */
    tb_theme: '切换 浅色/暗色 主题',
    tb_lang: '切换界面语言 / Switch language',
    tb_min: '最小化',
    tb_max: '最大化 / 还原',
    tb_max_on: '最大化',
    tb_max_off: '向下还原',
    tb_close: '关闭',
    btn_open: '📂 打开文件',
    btn_save: '💾 应用视图到文件',
    frz_rows: '冻结行',
    frz_rows_tip: '冻结前 N 行(表头行计入; 0=不冻结)',
    frz_cols: '冻结列',
    frz_cols_tip: '冻结前 N 列',
    btn_columns: '☰ 列设置',
    btn_filters: '▼ 筛选',
    btn_filters_tip: '多条件筛选',
    btn_sort: '⇅ 排序',
    btn_sort_tip: '多条件排序',
    welcome_desc: '支持 .xlsx / .xlsm / .xls · 冻结行列 · 拖动排序 · 显隐列 · 多条件筛选(含单元格颜色) · 视图写回',
    btn_open2: '📂 打开 Excel 文件',
    btn_mock: '载入示例数据 (test.xlsx)',
    hint: '双击列头筛选 · 右键列头/工具栏排序 · 双击列边/行边自适应 · Ctrl+F 搜索 · 单击选中单元格 · 双击超长格看全文',

    /* ---- 状态栏(动态) ---- */
    st_rows: '{name}: {v} / {tt} 行 · {vc} / {tc} 列',
    st_filtered: '已筛选 {n} 列',
    st_filtered_sel: '已筛选 {n} 列 (范围: 选区)',
    st_sorted: '已排序 {n} 级',
    st_sel: '选区 {n} 格',

    /* ---- 文件 ---- */
    open_failed: '打开失败: {e}',
    unknown_error: '未知错误',
    loaded: '已载入 {name}: {n} 个工作表',
    tb_file_xls: '  (.xls → 写回将另存 .xlsx)',
    closed_file: '已关闭 {name}',
    close_file_tip: '关闭此文件',
    reading_file: '正在读取文件…',
    browser_dev_hint: '当前为浏览器调试模式, 请点"载入示例数据"',
    mock_failed: '示例数据加载失败: {e}',

    /* ---- 排序 ---- */
    sort_need_file: '先打开一个文件再排序',
    sort_no_cols: '没有可排序的列',
    sort_disabled_multisel: '多选状态下已禁用排序: 请先取消选区(点击空白处或 Esc)',
    sort_need_target: '请先选中单元格或列: 升/降序作用于该列',
    sort_menu_asc: '升序',
    sort_menu_desc: '降序',
    sort_menu_custom: '自定义排序…',
    sort_modal_title: '多条件排序',
    sort_modal_sub: '从上到下优先级递减: 先按第 1 条排序, 值相同的再按第 2 条, 依此类推。',
    sort_dir_asc: '↑ 升序',
    sort_dir_desc: '↓ 降序',
    sort_del_level: '删除此排序级',
    sort_add_level: '＋ 添加排序级',
    sort_modal_note: '排序只改变显示顺序(整行联动); 冻结区行不参与。清除全部排序可恢复排序前的行序。',
    sort_clear_all: '清除全部排序',
    sort_cleared_all: '已清除排序, 恢复排序前行序',
    sort_apply: '应用排序',
    sort_cleared: '已清除排序',

    /* ---- 筛选 ---- */
    filter_need_file: '先打开一个文件再筛选',
    filter_no_cols: '没有可筛选的列',
    filter_modal_title: '多条件筛选',
    filter_modal_sub: '当前工作表: {name} · 各条件之间为"与"关系(需同时满足){sel}',
    filter_sel_scope: ' · 当前有选区: 仅作用于选中的 {n} 行(取消选区恢复全表)',
    filter_modal_note: '单元格颜色 / 值分类筛选请在双击列头的面板中设置。选择筛选列不会跳转视图。',
    filter_clear_all: '清除全部筛选',
    filter_cleared_all: '已清除全部筛选',
    filter_apply: '应用筛选',
    filter_apply_short: '应用',
    fp_title: '筛选条件: ',
    fp_val_ph: '值',
    fp_del_cond: '删除此条件',
    fp_add_cond: '＋ 添加条件',
    fp_note: '多个条件为"与"关系: 后添加的条件作用于前面条件的结果集(取交集)。',
    fp_color_lbl: '按单元格颜色筛选 (多选, 与上述条件取交集)',
    fp_no_fill: '无填充',
    fp_no_colors: '(此列没有填充色)',
    fp_by_value: '按值筛选 ({n} 类)',
    fp_search_ph: '搜索值…',
    fp_sel_all: '全选',
    fp_sel_none: '全不选',
    fp_empty_val: '(空)',
    fp_no_match_val: '(无匹配值)',
    fp_clear_col: '清除本列',
    col_is_num: '数值列',
    col_is_txt: '文本列',
    op_group_text: '文本',
    op_group_num: '数值',
    op_contains: '包含', op_not_contains: '不包含', op_equals: '完全匹配', op_not_equals: '不等于',
    op_starts: '开头为', op_ends: '结尾为', op_empty: '为空', op_not_empty: '不为空',
    op_gt: '大于 >', op_lt: '小于 <', op_gte: '大于等于 ≥', op_lte: '小于等于 ≤',
    op_eq: '等于 ＝', op_ne: '不等于 ≠',

    /* ---- 筛选标签卡(chips)摘要 ---- */
    chip_contains: '包含', chip_not_contains: '不包含', chip_equals: '等于', chip_not_equals: '不等于',
    chip_starts: '开头', chip_ends: '结尾', chip_empty: '为空', chip_not_empty: '非空',
    chip_values: '值∈{n}类',
    chip_colors: '{n}色',
    chip_and: ' 且 ',
    chip_edit_tip: '点击编辑此筛选',
    chip_clear_tip: '清除该列筛选',
    col_fallback_name: '列{n}',
    list_sep: '、',

    /* ---- 搜索 ---- */
    search_need_file: '先打开一个文件再搜索',
    search_title: '查找',
    search_ph: '查找内容 (不区分大小写, 按内容包含匹配)',
    search_scope_sel: '选中区域(当前工作表)',
    search_scope_sheet: '当前工作表',
    search_scope_file: '当前文件(全部工作表)',
    search_scope_all: '全部打开的文件',
    search_scope_col: '选中列(当前工作表)',
    search_find_next: '查找下一个',
    search_find_all: '查找全部',
    search_initial: '输入内容后回车查找',
    search_empty_q: '请输入查找内容',
    search_no_match: '没有匹配结果',
    search_pos: '第 {i} / 共 {n} 条',
    search_all_count: '共 {n} 条匹配 (显示前 {m} 条)',
    search_loc: '{file} · {sheet} · 行{r} · {c}列',
    search_col_hidden: '目标列已被隐藏, 无法跳转',
    search_row_filtered: '目标行被筛选隐藏, 无法跳转',

    /* ---- 单元格全文模态框 ---- */
    cell_modal_title: '第 {r} 行 · {c} 列 · 完整内容',
    cell_empty: '(空)',
    empty_head: '(空列头)',
    btn_close: '关闭',
    btn_cancel: '取消',

    /* ---- 右键菜单: 列 ---- */
    m_filter_col: '筛选此列 (同双击)',
    m_col_unfreeze: '将此列移出冻结区(归位)',
    m_cols_unfreeze_all: '取消全部冻结列(归位)',
    m_freeze_to_col: '冻结到此列(前 {n} 列)',
    m_col_freeze_add: '将此列加入冻结区',
    m_sort_by_asc: '按此列 升序',
    m_sort_by_desc: '按此列 降序',
    m_clear_sort: '清除排序(恢复排序前行序)',
    m_multi_sort: '多条件排序…',
    m_col_width: '设置列宽 (px)…',
    prompt_col_width: '列宽',
    m_hide_col: '隐藏此列',
    m_autofit_col: '自动调整此列宽',
    m_cols_panel: '列设置…',
    col_hidden_toast: '已隐藏列 {name} · 在表头该位置的竖条处向右拖可拉回',

    /* ---- 右键菜单: 行 ---- */
    m_unset_title: '取消标题行(恢复原位置)',
    m_set_title: '设为标题行(置顶冻结, 不计行号)',
    m_freeze_to_row: '冻结到此行(连续前缀)',
    m_row_freeze_add: '将此行加入冻结区(移动到冻结区末尾)',
    m_row_unfreeze: '将此行移出冻结区(归位)',
    m_rows_unfreeze_all: '取消冻结行(全部归位)',
    m_row_height: '设置行高 (px)…',
    prompt_row_height: '行高',
    title_row_set: '已设为标题行: 置顶冻结、不计行号(右键该行行号可取消)',
    title_row_unset: '已取消标题行, 恢复原位置与行号',
    title_row_tip: '标题行(右键行号可取消)',

    /* ---- 对齐 ---- */
    m_align: '对齐',
    al_left: '左对齐',
    al_center: '居中',
    al_right: '右对齐',
    al_reset: '恢复默认',

    /* ---- 列设置面板 ---- */
    cp_title: '列显示与顺序 (从上到下 = 从左到右)',
    cp_show_all: '全部显示',
    cp_auto_width: '自动列宽',
    cp_align: '对齐',
    cp_left: '左',
    cp_center: '中',
    cp_right: '右',
    cp_up: '前移',
    cp_dn: '后移',
    col_drag_noncontig: '多列拖拽仅支持连续选中的列, 本次只拖动当前列',
    hide_seam_tip: '按住向右拖动拉出隐藏列: {names}',

    /* ---- 写回 / 复制 / 通用对话框 ---- */
    save_title: '应用视图到文件',
    save_msg_xls: '原文件为 .xls 格式(只读保留不动)。\n视图将写入新文件:\n{f}',
    save_msg: '将把当前视图状态写入原文件:\n{f}\n\n写入内容: 列顺序 / 隐藏列 / 冻结 {r} 行 {c} 列 / 筛选条件 / 列宽 / 自动换行\n写入前会自动备份为 .bak 文件。',
    save_confirm: '确认写入',
    save_ok: '已写入: {f}',
    save_backup: '\n备份: {f}',
    save_failed: '写入失败: {e}',
    copied: '已复制 {n} 格 ({r} 行 × {c} 列, Tab 分隔)',
    prompt_px: ' (像素)',

    /* ---- 后端 save_back notes 稳定码 → 文案(见 xlio.py) ---- */
    'note:xls_saved_copy': '原 .xls 文件保留未动, 视图已写入同名 .xlsx 新文件',
    'note:multicolor_limit': '多色筛选超出 Excel 单色 colorFilter 能力, 仅写入首个颜色或跳过',
  },

  en: {
    /* ---- titlebar / toolbar / welcome / statusbar (static, data-i18n) ---- */
    tb_theme: 'Toggle light/dark theme',
    tb_lang: '切换界面语言 / Switch language',
    tb_min: 'Minimize',
    tb_max: 'Maximize / restore',
    tb_max_on: 'Maximize',
    tb_max_off: 'Restore Down',
    tb_close: 'Close',
    btn_open: '📂 Open file',
    btn_save: '💾 Apply view to file',
    frz_rows: 'Freeze rows',
    frz_rows_tip: 'Freeze first N rows (header row included; 0 = none)',
    frz_cols: 'Freeze cols',
    frz_cols_tip: 'Freeze first N columns',
    btn_columns: '☰ Columns',
    btn_filters: '▼ Filter',
    btn_filters_tip: 'Multi-condition filter',
    btn_sort: '⇅ Sort',
    btn_sort_tip: 'Multi-criteria sort',
    welcome_desc: 'Supports .xlsx / .xlsm / .xls · freeze rows & columns · drag to reorder · show/hide columns · multi-condition filters (incl. cell colors) · write view back to file',
    btn_open2: '📂 Open an Excel file',
    btn_mock: 'Load sample data (test.xlsx)',
    hint: 'Double-click a column header to filter · right-click header/toolbar to sort · double-click a column/row edge to auto-fit · Ctrl+F to search · click to select a cell · double-click an overflowing cell to view full text',

    /* ---- status bar (dynamic) ---- */
    st_rows: '{name}: {v} / {tt} rows · {vc} / {tc} cols',
    st_filtered: '{n} column(s) filtered',
    st_filtered_sel: '{n} column(s) filtered (scope: selection)',
    st_sorted: 'sorted by {n} level(s)',
    st_sel: '{n} cells selected',

    /* ---- files ---- */
    open_failed: 'Open failed: {e}',
    unknown_error: 'unknown error',
    loaded: 'Loaded {name}: {n} sheet(s)',
    tb_file_xls: '  (.xls → saving back writes a new .xlsx)',
    closed_file: 'Closed {name}',
    close_file_tip: 'Close this file',
    reading_file: 'Reading file…',
    browser_dev_hint: 'Browser debug mode: click "Load sample data"',
    mock_failed: 'Failed to load sample data: {e}',

    /* ---- sort ---- */
    sort_need_file: 'Open a file before sorting',
    sort_no_cols: 'No sortable columns',
    sort_disabled_multisel: 'Sorting is disabled while a multi-cell selection is active: clear it first (click empty space or press Esc)',
    sort_need_target: 'Select a cell or column first: ascending/descending sorts by that column',
    sort_menu_asc: 'Ascending',
    sort_menu_desc: 'Descending',
    sort_menu_custom: 'Custom sort…',
    sort_modal_title: 'Multi-criteria sort',
    sort_modal_sub: 'Priority decreases from top to bottom: sort by level 1 first, then level 2 for equal values, and so on.',
    sort_dir_asc: '↑ Ascending',
    sort_dir_desc: '↓ Descending',
    sort_del_level: 'Remove this sort level',
    sort_add_level: '＋ Add sort level',
    sort_modal_note: 'Sorting only changes the display order (whole rows move together); frozen rows are excluded. Clearing all sorts restores the pre-sort row order.',
    sort_clear_all: 'Clear all sorts',
    sort_cleared_all: 'Sorts cleared, pre-sort row order restored',
    sort_apply: 'Apply sort',
    sort_cleared: 'Sort cleared',

    /* ---- filter ---- */
    filter_need_file: 'Open a file before filtering',
    filter_no_cols: 'No filterable columns',
    filter_modal_title: 'Multi-condition filter',
    filter_modal_sub: 'Current sheet: {name} · conditions are ANDed (all must match){sel}',
    filter_sel_scope: ' · selection active: applies only to the {n} selected row(s) (clear the selection to restore the whole sheet)',
    filter_modal_note: 'Cell color / value-category filters are set in the panel opened by double-clicking a column header. Choosing a filter column here does not scroll the view.',
    filter_clear_all: 'Clear all filters',
    filter_cleared_all: 'All filters cleared',
    filter_apply: 'Apply filters',
    filter_apply_short: 'Apply',
    fp_title: 'Filter: ',
    fp_val_ph: 'Value',
    fp_del_cond: 'Remove this condition',
    fp_add_cond: '＋ Add condition',
    fp_note: 'Multiple conditions are ANDed: each later condition applies to the result of the earlier ones (intersection).',
    fp_color_lbl: 'Filter by cell color (multi-select, ANDed with the conditions above)',
    fp_no_fill: 'No fill',
    fp_no_colors: '(no fill colors in this column)',
    fp_by_value: 'Filter by value ({n} distinct)',
    fp_search_ph: 'Search values…',
    fp_sel_all: 'All',
    fp_sel_none: 'None',
    fp_empty_val: '(empty)',
    fp_no_match_val: '(no matching values)',
    fp_clear_col: 'Clear this column',
    col_is_num: 'Numeric column',
    col_is_txt: 'Text column',
    op_group_text: 'Text',
    op_group_num: 'Number',
    op_contains: 'Contains', op_not_contains: 'Does not contain', op_equals: 'Exact match', op_not_equals: 'Not equal to',
    op_starts: 'Starts with', op_ends: 'Ends with', op_empty: 'Is empty', op_not_empty: 'Is not empty',
    op_gt: 'Greater than >', op_lt: 'Less than <', op_gte: 'Greater than or equal ≥', op_lte: 'Less than or equal ≤',
    op_eq: 'Equals ＝', op_ne: 'Not equal to ≠',

    /* ---- filter chips summary ---- */
    chip_contains: 'contains', chip_not_contains: 'excludes', chip_equals: '=', chip_not_equals: '≠',
    chip_starts: 'starts', chip_ends: 'ends', chip_empty: 'empty', chip_not_empty: 'not empty',
    chip_values: '{n} values',
    chip_colors: '{n} color(s)',
    chip_and: ' AND ',
    chip_edit_tip: 'Click to edit this filter',
    chip_clear_tip: "Clear this column's filter",
    col_fallback_name: 'Col {n}',
    list_sep: ', ',

    /* ---- search ---- */
    search_need_file: 'Open a file before searching',
    search_title: 'Find',
    search_ph: 'Text to find (case-insensitive, contains match)',
    search_scope_sel: 'Selected range (current sheet)',
    search_scope_sheet: 'Current sheet',
    search_scope_file: 'Current file (all sheets)',
    search_scope_all: 'All open files',
    search_scope_col: 'Selected column (current sheet)',
    search_find_next: 'Find next',
    search_find_all: 'Find all',
    search_initial: 'Type a query and press Enter to search',
    search_empty_q: 'Enter text to search',
    search_no_match: 'No matches',
    search_pos: 'Match {i} of {n}',
    search_all_count: '{n} match(es) (showing first {m})',
    search_loc: '{file} · {sheet} · Row {r} · Col {c}',
    search_col_hidden: 'Target column is hidden, cannot jump',
    search_row_filtered: 'Target row is filtered out, cannot jump',

    /* ---- cell full-text modal ---- */
    cell_modal_title: 'Row {r} · Column {c} · Full content',
    cell_empty: '(empty)',
    empty_head: '(empty header)',
    btn_close: 'Close',
    btn_cancel: 'Cancel',

    /* ---- context menu: column ---- */
    m_filter_col: 'Filter this column (same as double-click)',
    m_col_unfreeze: 'Move this column out of the frozen area (restore position)',
    m_cols_unfreeze_all: 'Unfreeze all columns (restore positions)',
    m_freeze_to_col: 'Freeze up to this column (first {n})',
    m_col_freeze_add: 'Add this column to the frozen area',
    m_sort_by_asc: 'Sort by this column, ascending',
    m_sort_by_desc: 'Sort by this column, descending',
    m_clear_sort: 'Clear sort (restore pre-sort order)',
    m_multi_sort: 'Multi-criteria sort…',
    m_col_width: 'Set column width (px)…',
    prompt_col_width: 'Column width',
    m_hide_col: 'Hide this column',
    m_autofit_col: 'Auto-fit this column width',
    m_cols_panel: 'Column settings…',
    col_hidden_toast: 'Column {name} hidden · drag the vertical bar at that header position to the right to restore',

    /* ---- context menu: row ---- */
    m_unset_title: 'Unset title row (restore position)',
    m_set_title: 'Set as title row (pinned on top, not counted in row numbers)',
    m_freeze_to_row: 'Freeze up to this row (contiguous prefix)',
    m_row_freeze_add: 'Add this row to the frozen area (moves it to the end of the frozen area)',
    m_row_unfreeze: 'Move this row out of the frozen area (restore position)',
    m_rows_unfreeze_all: 'Unfreeze all rows (restore positions)',
    m_row_height: 'Set row height (px)…',
    prompt_row_height: 'Row height',
    title_row_set: 'Title row set: pinned on top and not counted in row numbers (right-click its row number to unset)',
    title_row_unset: 'Title row unset, original position and numbering restored',
    title_row_tip: 'Title row (right-click row number to unset)',

    /* ---- align ---- */
    m_align: 'Align',
    al_left: 'Align left',
    al_center: 'Align center',
    al_right: 'Align right',
    al_reset: 'Reset to default',

    /* ---- columns panel ---- */
    cp_title: 'Column visibility & order (top to bottom = left to right)',
    cp_show_all: 'Show all',
    cp_auto_width: 'Auto width',
    cp_align: 'Align',
    cp_left: 'Left',
    cp_center: 'Center',
    cp_right: 'Right',
    cp_up: 'Move up',
    cp_dn: 'Move down',
    col_drag_noncontig: 'Multi-column drag requires a contiguous selection; only the current column is moved',
    hide_seam_tip: 'Hold and drag right to pull out hidden columns: {names}',

    /* ---- save back / copy / common dialogs ---- */
    save_title: 'Apply view to file',
    save_msg_xls: 'The original file is .xls (kept read-only, untouched).\nThe view will be written to a new file:\n{f}',
    save_msg: 'The current view state will be written to the original file:\n{f}\n\nContents: column order / hidden columns / freeze {r} rows {c} cols / filter conditions / column widths / text wrap\nA .bak backup is created before writing.',
    save_confirm: 'Write',
    save_ok: 'Written: {f}',
    save_backup: '\nBackup: {f}',
    save_failed: 'Write failed: {e}',
    copied: 'Copied {n} cells ({r} rows × {c} cols, tab-separated)',
    prompt_px: ' (pixels)',

    /* ---- backend save_back note codes → text (see xlio.py) ---- */
    'note:xls_saved_copy': 'Original .xls file left untouched; the view was written to a new .xlsx with the same name',
    'note:multicolor_limit': 'Multi-color filters exceed Excel single-color colorFilter support; only the first color is written (or skipped)',
  },
};

let LANG = 'zh';

function detectLang() {
  // 已持久化的选择优先; 否则跟随系统语言, en* → en, 其余(含检测失败)回退 zh
  let saved = null;
  try { saved = localStorage.getItem('xv-lang'); } catch (e) {}
  if (saved === 'en' || saved === 'zh') return saved;
  const nav = (navigator.language || '') + ',' + ((navigator.languages && navigator.languages[0]) || '');
  return /^en/i.test(nav) ? 'en' : 'zh';
}

function t(key, params) {
  const entry = (I18N[LANG] && I18N[LANG][key] !== undefined) ? I18N[LANG][key] : I18N.zh[key];
  if (entry === undefined) return key;
  if (!params) return entry;
  return String(entry).replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
}

function applyI18nAttrs() {
  // 静态文案批量替换: 文本/标题/占位符三类属性(动态文案由构建处调 t())
  document.documentElement.lang = (LANG === 'en') ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
}

function setLang(lang) {
  LANG = (lang === 'en') ? 'en' : 'zh';
  try { localStorage.setItem('xv-lang', LANG); } catch (e) {}
  applyI18nAttrs();
}

/* 脚本置于 body 末尾, DOM 已就绪: 载入即检测并应用静态文案 */
LANG = detectLang();
applyI18nAttrs();
