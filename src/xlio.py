# -*- coding: utf-8 -*-
"""xls/xlsx 读取(含单元格填充色) 与视图写回引擎."""
import os
import shutil
import datetime

import xlrd
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font
from openpyxl.utils import get_column_letter
from openpyxl.styles.colors import COLOR_INDEX
from openpyxl.worksheet.filters import (
    AutoFilter, FilterColumn, CustomFilter, CustomFilters, ColorFilter, Filters,
)

# Excel 默认 Office 主题色(theme 索引: 0=lt1 1=dk1 2=lt2 3=dk2 4..9=accent1..6 10=hlink 11=folHlink)
THEME_COLORS = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D',
                '9BBB59', '8064A2', '4BACC6', 'F79646', '0000FF', '800080']

PX_PER_CHAR = 7.0   # px -> Excel 列宽(字符) 近似换算
EXTRA_PX = 5.0


def _hex6(rgb8):
    """'FFRRGGBB' -> 'RRGGBB'"""
    if isinstance(rgb8, str) and len(rgb8) == 8:
        return rgb8[2:].upper()
    return None


def _apply_tint(hex6, tint):
    """tint 近似变换: >0 变亮, <0 变暗"""
    if not tint:
        return hex6
    r, g, b = int(hex6[0:2], 16), int(hex6[2:4], 16), int(hex6[4:6], 16)
    def t(v):
        if tint > 0:
            return int(round(v * (1 - tint) + 255 * tint))
        return int(round(v * (1 + tint)))
    return '%02X%02X%02X' % (min(t(r), 255), min(t(g), 255), min(t(b), 255))


def _color_from_fill(fill):
    """openpyxl PatternFill -> '#RRGGBB' | None(无有效填充色)"""
    try:
        if fill is None or fill.patternType != 'solid':
            return None
        c = fill.start_color
        if c is None:
            return None
        if c.type == 'rgb':
            h = _hex6(c.rgb)
            # '00000000' 是 openpyxl 默认零值, 视为无填充
            if h and h != '000000':
                return '#' + h
            return None
        if c.type == 'indexed':
            idx = c.indexed
            if idx is None or idx >= len(COLOR_INDEX):
                return None
            h = _hex6(COLOR_INDEX[idx])
            return ('#' + h) if h else None
        if c.type == 'theme':
            idx = getattr(c, 'theme', None)
            tint = getattr(c, 'tint', 0.0) or 0.0
            if idx is None or idx >= len(THEME_COLORS):
                return None
            return '#' + _apply_tint(THEME_COLORS[idx], tint)
    except Exception:
        return None
    return None


def _val(v):
    """单元格值 -> JSON 可传输的标量"""
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return str(v)
    return v


class _Palette:
    def __init__(self):
        self.colors = []

    def idx(self, rgb):
        if not rgb:
            return -1
        if rgb in self.colors:
            return self.colors.index(rgb)
        self.colors.append(rgb)
        return len(self.colors) - 1


def load_xlsx(path):
    wb = openpyxl.load_workbook(path, data_only=False, read_only=False)
    sheets = []
    for ws in wb.worksheets:
        pal = _Palette()
        n_rows = ws.max_row or 0
        n_cols = ws.max_column or 0
        rows = []
        for row in ws.iter_rows(min_row=1, max_row=n_rows, max_col=n_cols):
            out = []
            for cell in row:
                out.append([_val(cell.value), pal.idx(_color_from_fill(cell.fill))])
            rows.append(out)
        fr, fc = 0, 0
        if ws.freeze_panes:
            from openpyxl.utils.cell import coordinate_from_string, column_index_from_string
            try:
                col_letters, row_num = coordinate_from_string(str(ws.freeze_panes))
                fc, fr = column_index_from_string(col_letters) - 1, row_num - 1
            except Exception:
                pass
        widths = []
        for i in range(1, n_cols + 1):
            dim = ws.column_dimensions.get(get_column_letter(i))
            widths.append(round(dim.width, 2) if (dim and dim.width) else None)
        sheets.append({
            'name': ws.title,
            'nRows': n_rows, 'nCols': n_cols,
            'freezeRow': fr, 'freezeCol': fc,
            'colWidths': widths,
            'palette': pal.colors,
            'rows': rows,
        })
    return {'ok': True, 'path': os.path.abspath(path),
            'fileName': os.path.basename(path), 'format': 'xlsx', 'sheets': sheets}


def load_xls(path):
    book = xlrd.open_workbook(path, formatting_info=True, on_demand=False)
    sheets = []
    for sh in book.sheets():
        pal = _Palette()
        n_rows, n_cols = sh.nrows, sh.ncols
        rows = []
        colour_map = book.colour_map or {}
        for r in range(n_rows):
            out = []
            for c in range(n_cols):
                cell = sh.cell(r, c)
                if cell.ctype == xlrd.XL_CELL_NUMBER:
                    v = float(cell.value)
                    if v == int(v):
                        v = int(v)
                elif cell.ctype == xlrd.XL_CELL_DATE:
                    try:
                        v = str(xlrd.xldate.xldate_as_datetime(cell.value, book.datemode))
                    except Exception:
                        v = str(cell.value)
                elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
                    v = 'TRUE' if cell.value else 'FALSE'
                else:
                    v = cell.value if cell.ctype != xlrd.XL_CELL_EMPTY else ''
                color = None
                try:
                    xf = book.xf_list[cell.xf_index]
                    bg = xf.background
                    # fill_pattern 1 = solid, solid 时显示 pattern_colour(前景)
                    if bg.fill_pattern == 1 and bg.pattern_colour_index not in (64, 65):
                        rgb = colour_map.get(bg.pattern_colour_index)
                        if rgb:
                            color = '#%02X%02X%02X' % rgb
                except Exception:
                    color = None
                out.append([v, pal.idx(color)])
            rows.append(out)
        fr, fc = 0, 0
        try:
            if sh.has_pane_record and sh.vert_split_pos:
                fc = sh.vert_split_pos
            if sh.has_pane_record and sh.horz_split_pos:
                fr = sh.horz_split_pos
        except Exception:
            pass
        widths = []
        for i in range(n_cols):
            try:
                w = sh.colinfo_map[i].width / 256.0 if i in sh.colinfo_map else None
            except Exception:
                w = None
            widths.append(round(w, 2) if w else None)
        sheets.append({
            'name': sh.name,
            'nRows': n_rows, 'nCols': n_cols,
            'freezeRow': fr, 'freezeCol': fc,
            'colWidths': widths,
            'palette': pal.colors,
            'rows': rows,
        })
    return {'ok': True, 'path': os.path.abspath(path),
            'fileName': os.path.basename(path), 'format': 'xls', 'sheets': sheets}


def load_any(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.xls':
        return load_xls(path)
    return load_xlsx(path)


# ---------------------------------------------------------------- 写回

_OP_MAP = {
    'gt': 'greaterThan', 'lt': 'lessThan',
    'gte': 'greaterThanOrEqual', 'lte': 'lessThanOrEqual',
    'eq': 'equal', 'ne': 'notEqual',
}


def _snapshot_sheet(ws):
    """读出全部单元格(值/solid色/粗体/数字格式) + 行高列宽"""
    n_rows, n_cols = ws.max_row or 0, ws.max_column or 0
    grid = []
    for r in range(1, n_rows + 1):
        rowd = []
        for c in range(1, n_cols + 1):
            cell = ws.cell(r, c)
            rowd.append({
                'v': cell.value,
                'fill': _color_from_fill(cell.fill),
                'bold': bool(cell.font and cell.font.bold),
                'fmt': cell.number_format if cell.number_format not in ('General', None) else None,
            })
        grid.append(rowd)
    heights = {}
    for r in range(1, n_rows + 1):
        dim = ws.row_dimensions.get(r)
        if dim is not None and dim.height:
            heights[r] = dim.height
    return grid, n_rows, n_cols, heights


def _rebuild_sheet(ws, grid, n_rows, order, heights, payload_align=None, payload_rowh=None, payload_rowalign=None, row_order=None):
    """按 order(显示位置->原列, 0 基) 清空并重写单元格, 全表自动换行"""
    # 清空全部行(连带清除单元格内容与样式)
    if n_rows:
        ws.delete_rows(1, n_rows)
    rows_seq = list(row_order) if row_order else list(range(n_rows))
    for new_r, orig_r in enumerate(rows_seq, start=1):
        src_row = grid[orig_r]
        r = new_r
        for new_c, old_c in enumerate(order, start=1):
            src = src_row[old_c]
            cell = ws.cell(r, new_c)
            if src['v'] is not None and src['v'] != '':
                cell.value = src['v']
            if src['fill']:
                h = src['fill'][1:]
                cell.fill = PatternFill('solid', fgColor=h)
            if src['bold']:
                cell.font = Font(bold=True)
            if src['fmt']:
                cell.number_format = src['fmt']
            h_align = (payload_align or {}).get(str(new_c - 1)) or (payload_align or {}).get(new_c - 1)
            # 行级对齐优先于列对齐(行号 0 基)
            ra = (payload_rowalign or {}).get(str(orig_r)) or (payload_rowalign or {}).get(orig_r)
            if ra:
                h_align = ra
            cell.alignment = Alignment(wrap_text=True, vertical='center',
                                       horizontal=h_align) if h_align else Alignment(wrap_text=True, vertical='center')
    # 行高: 手动指定优先, 其次保留原行高; 键为原行号, 重排后写到新位置
    rowh = payload_rowh or {}
    all_h = {}
    for k, hpx in heights.items():
        all_h[int(k) - 1] = float(hpx)   # heights 键 1 基 -> 0 基
    for k, hpx in rowh.items():
        all_h[int(k)] = float(hpx)       # 前端 rowH 键 0 基
    pos_of_orig = {orig: i for i, orig in enumerate(rows_seq)}
    for orig0, hpx in all_h.items():
        pos = pos_of_orig.get(orig0)
        if pos is not None:
            ws.row_dimensions[pos + 1].height = hpx


def _apply_dims_and_freeze(ws, payload, n_rows, n_display_cols):
    hidden = set(payload.get('hidden') or [])
    widths = payload.get('colWidths') or {}
    fr = int(payload.get('freezeRow') or 0)
    fc = int(payload.get('freezeCol') or 0)
    for i in range(1, n_display_cols + 1):
        letter = get_column_letter(i)
        dim = ws.column_dimensions[letter]
        if str(i - 1) in widths:
            dim.width = max(2.0, (float(widths[str(i - 1)]) - EXTRA_PX) / PX_PER_CHAR)
        if (i - 1) in hidden:
            dim.hidden = True
        elif dim.hidden:
            dim.hidden = False
    ws.freeze_panes = ws.cell(fr + 1, fc + 1).coordinate if (fr > 0 or fc > 0) else None


def _build_autofilter(payload, n_rows, n_display_cols):
    """筛选条件 -> Excel AutoFilter(多列=AND, 同列多条件=customFilters AND)"""
    filters = payload.get('filters') or []
    if not filters or not n_rows:
        return None
    ref = 'A1:%s%d' % (get_column_letter(n_display_cols), n_rows)
    af = AutoFilter(ref=ref)
    used_cols = set()
    for f in filters:
        col = f.get('col')
        if col is None or col in used_cols or col >= n_display_cols:
            continue
        include_vals = (f.get('values') or {}).get('include') if isinstance(f.get('values'), dict) else None
        cfs = []
        for cond in (f.get('conds') or []):
            op, val = cond.get('op'), cond.get('val')
            if val is None:
                val = ''
            val = str(val)
            if op in _OP_MAP:
                cfs.append(CustomFilter(operator=_OP_MAP[op], val=val))
            elif op == 'contains':
                cfs.append(CustomFilter(operator='equal', val='*%s*' % val))
            elif op == 'not_contains':
                cfs.append(CustomFilter(operator='notEqual', val='*%s*' % val))
            elif op == 'equals':
                cfs.append(CustomFilter(operator='equal', val=val))
            elif op == 'not_equals':
                cfs.append(CustomFilter(operator='notEqual', val=val))
            elif op == 'starts':
                cfs.append(CustomFilter(operator='equal', val='%s*' % val))
            elif op == 'ends':
                cfs.append(CustomFilter(operator='equal', val='*%s' % val))
            elif op == 'empty':
                cfs.append(CustomFilter(operator='equal', val=''))
            elif op == 'not_empty':
                cfs.append(CustomFilter(operator='notEqual', val=''))
        colors = f.get('colors') or []
        color_filter = None
        if len(colors) == 1 and colors[0].startswith('#'):
            # Excel 原生 colorFilter 仅支持单一颜色
            color_filter = ColorFilter(cellColor='FF' + colors[0][1:].upper())
        if not cfs and color_filter is None and not include_vals:
            continue
        used_cols.add(col)
        if include_vals:
            # Excel 原生"按值筛选"
            fc = FilterColumn(colId=col, filters=Filters(filter=[str(v) for v in include_vals]))
        elif cfs:
            fc = FilterColumn(colId=col, customFilters=CustomFilters(_and=True, customFilter=cfs))
        else:
            fc = FilterColumn(colId=col, colorFilter=color_filter)
        af.filterColumn.append(fc)
    if not af.filterColumn:
        return None
    return af


def apply_view_xlsx(path, payload):
    """把视图状态写回 xlsx. 返回 {ok, savedTo, backup, notes[]}"""
    notes = []
    sheet_name = payload.get('sheet')
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb[sheet_name]
    grid, n_rows, n_cols, heights = _snapshot_sheet(ws)

    order = payload.get("order") or list(range(n_cols))
    n_display = len(order)
    _rebuild_sheet(ws, grid, n_rows, order, heights, payload.get('align'),
                   payload.get('rowH'), payload.get('rowAlign'), payload.get('rowOrder'))
    _apply_dims_and_freeze(ws, payload, n_rows, n_display)

    af = _build_autofilter(payload, n_rows, n_display)
    if af:
        ws.auto_filter = af
    else:
        ws.auto_filter.ref = None
    colors_used = any((f.get('colors') or []) for f in (payload.get('filters') or []))
    if colors_used:
        # notes 是稳定码, 由前端 lang.js 字典翻译展示(未知码原样透传)
        notes.append('note:multicolor_limit')
    wb.save(path)
    return {'ok': True, 'savedTo': os.path.abspath(path), 'notes': notes}


def apply_view_xls(path, payload):
    """xls 无法原地写: 另存为同名 .xlsx(原文件不动)"""
    data = load_xls(path)
    target = None
    for sh in data['sheets']:
        if sh['name'] == payload.get('sheet'):
            target = sh
            break
    if target is None:
        return {'ok': False, 'error': 'sheet not found'}
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = target['name']
    order = payload.get("order") or list(range(target["nCols"]))
    n_display = len(order)
    pal = target['palette']
    for r, row in enumerate(target['rows'], start=1):
        for new_c, old_c in enumerate(order, start=1):
            v, ci = row[old_c]
            cell = ws.cell(r, new_c)
            if v != '':
                cell.value = v
            if 0 <= ci < len(pal):
                cell.fill = PatternFill('solid', fgColor=pal[ci][1:])
            h_align = (payload.get('align') or {}).get(str(new_c - 1)) or (payload.get('align') or {}).get(new_c - 1)
            cell.alignment = Alignment(wrap_text=True, vertical='center',
                                       horizontal=h_align) if h_align else Alignment(wrap_text=True, vertical='center')
    _apply_dims_and_freeze(ws, payload, target['nRows'], n_display)
    af = _build_autofilter(payload, target['nRows'], n_display)
    if af:
        ws.auto_filter = af
    saved = os.path.splitext(path)[0] + '.xlsx'
    wb.save(saved)
    return {'ok': True, 'savedTo': os.path.abspath(saved),
            'notes': ['note:xls_saved_copy']}


def save_back(path, payload):
    """入口: 备份 -> 写回. xlsx 原地覆盖(先备份), xls 另存 .xlsx"""
    fmt = payload.get('format') or os.path.splitext(path)[1].lower().lstrip('.')
    backup = None
    if fmt != 'xls':
        backup = path + '.bak'
        try:
            shutil.copy2(path, backup)
        except Exception:
            backup = None
    if fmt == 'xls':
        return apply_view_xls(path, payload)
    result = apply_view_xlsx(path, payload)
    if backup:
        result['backup'] = backup
    return result
