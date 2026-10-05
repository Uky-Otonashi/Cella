# -*- coding: utf-8 -*-
"""Cella 桌面应用入口: pywebview(WebView2) 壳 + 文件对话框/写回 js_api.

用法:
  python main.py            正常桌面窗口
  python main.py --dev      开发模式: 起 http 服务供浏览器调试前端(mock 数据)
"""
import json
import os
import sys
import threading
import functools

HERE = os.path.dirname(os.path.abspath(__file__))


def resource_path(*parts):
    """兼容 PyInstaller onefile 的资源路径"""
    base = getattr(sys, '_MEIPASS', HERE)
    return os.path.join(base, *parts)


def out_dir():
    return os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.join(HERE, '..')


def build_api(window_ref):
    import webview
    import xlio
    import threading

    def _ui_post(action, tag=''):
        """把 UI 操作异步投递到 UI 线程执行(BeginInvoke 立即返回, 不等待,
        规避 pythonnet3 下工作线程同步 Invoke/ctypes 的死锁)"""
        native = window_ref.get('native')
        if native is None:
            return False

        def run():
            try:
                action()
                if tag:
                    try:
                        with open(os.path.join(out_dir(), 'selftest_result.txt'), 'a', encoding='utf-8') as f:
                            f.write('UI-ACTION-DONE %s\n' % tag)
                    except Exception:
                        pass
            except Exception as e:
                try:
                    with open(os.path.join(out_dir(), 'selftest_result.txt'), 'a', encoding='utf-8') as f:
                        f.write('UI-ACTION-FAIL %s: %s %s\n' % (tag, type(e).__name__, e))
                except Exception:
                    pass
        try:
            from System import Action
            native.BeginInvoke(Action(run))
            return True
        except Exception:
            return False

    def _open_dialog_sta(file_types):
        """在独立 STA 线程跑 WinForms OpenFileDialog(公共对话框要求 STA 线程,
        js_api 工作线程是 MTA; 对话框线程跑独立消息泵, 不依赖主 UI 线程)"""
        result = {}
        done = threading.Event()

        def run():
            try:
                from System.Windows.Forms import OpenFileDialog
                dlg = OpenFileDialog()
                dlg.Multiselect = False
                dlg.RestoreDirectory = True
                dlg.Filter = file_types
                if int(dlg.ShowDialog()) == 1:  # DialogResult.OK
                    result['paths'] = [str(p) for p in dlg.FileNames]
            except Exception as e:
                result['error'] = '%s: %s' % (type(e).__name__, e)
            finally:
                done.set()

        from System.Threading import Thread, ThreadStart, ApartmentState
        t = Thread(ThreadStart(run))
        t.SetApartmentState(ApartmentState.STA)
        t.Start()
        done.wait(timeout=900)
        return result

    _dialog_lock = threading.Lock()

    class Api:
        # ---------- 自检 ----------
        def selftest_report(self, msg):
            out = os.path.join(out_dir(), 'selftest_result.txt')
            try:
                with open(out, 'a', encoding='utf-8') as f:
                    f.write(msg + '\n')
            except Exception:
                pass
            return 'RECV:' + msg

        def _log(self, msg):
            try:
                with open(os.path.join(out_dir(), 'selftest_result.txt'), 'a', encoding='utf-8') as f:
                    f.write(msg + '\n')
            except Exception:
                pass

        # ---------- 文件 ----------
        def pick_and_load(self, lang='zh'):
            if not _dialog_lock.acquire(blocking=False):
                return {'ok': False, 'cancel': True, 'busy': True}   # 已有对话框在弹, 忽略重复调用
            try:
                return self._pick_and_load_inner(lang)
            finally:
                _dialog_lock.release()

        def _pick_and_load_inner(self, lang='zh'):
            # 对话框过滤器文案随界面语言(前端传 LANG; 未知值回退中文)
            filters = {
                'en': 'Excel files (*.xls;*.xlsx;*.xlsm)|*.xls;*.xlsx;*.xlsm|All files (*.*)|*.*',
                'zh': 'Excel 文件 (*.xls;*.xlsx;*.xlsm)|*.xls;*.xlsx;*.xlsm|所有文件 (*.*)|*.*',
            }
            r = _open_dialog_sta(filters.get(lang, filters['zh']))
            if r.get('error'):
                return {'ok': False, 'error': r['error']}
            paths = r.get('paths') or []
            if not paths:
                return {'ok': False, 'cancel': True}
            try:
                return xlio.load_any(paths[0])
            except Exception as e:
                return {'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}

        def load_file(self, path):
            try:
                return xlio.load_any(path)
            except Exception as e:
                return {'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}

        def save_back(self, payload_json):
            """payload_json: 前端序列化的视图状态字符串"""
            try:
                payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
            except Exception as e:
                return {'ok': False, 'error': 'payload 解析失败: %s' % e}
            path = payload.get('path')
            if not path or not os.path.exists(path):
                return {'ok': False, 'error': '原文件不存在: %s' % path}
            try:
                return xlio.save_back(path, payload)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}

        # ---------- 窗体(BeginInvoke 异步投递到 UI 线程, 全部返回非 None) ----------
        def win_minimize(self):
            def do_min():
                from System.Windows.Forms import FormWindowState
                window_ref['native'].WindowState = FormWindowState.Minimized
            return {'ok': _ui_post(do_min)}

        def win_maximize(self):
            def do_max():
                from System.Windows.Forms import FormWindowState
                window_ref['native'].WindowState = FormWindowState.Maximized
            return {'ok': _ui_post(do_max)}

        def win_restore(self):
            def do_res():
                from System.Windows.Forms import FormWindowState
                window_ref['native'].WindowState = FormWindowState.Normal
            return {'ok': _ui_post(do_res)}

        def win_close(self):
            return {'ok': _ui_post(lambda: window_ref['native'].Close())}

        def win_resize(self, w, h, dx=0, dy=0):
            """dx/dy 非零 = w/n 方向拖拽(左/上边缘要动): 用"右/下边缘锚定"反推新位置。
            不能用 Location += dx 增量累加——dx 是距拖拽基线的总位移, 多次排队调用
            (mousemove 30ms 节流 + 松手补发) 会把位移累加过头(实测 X+120/W-80 超调),
            锚定法幂等, 任意次调用自然收敛到最终几何"""
            def do_size():
                from System.Drawing import Size, Point
                from System.Windows.Forms import FormWindowState
                n = window_ref['native']
                if n.WindowState != FormWindowState.Normal:
                    return   # 最大化/最小化下改 ClientSize 会被 WinForms 写进还原尺寸(restore bounds), 还原后窗口尺寸异常——直接忽略
                w2 = max(960, int(w)); h2 = max(600, int(h))
                if dx or dy:
                    x = n.Location.X
                    y = n.Location.Y
                    if dx:
                        x = n.Location.X + n.Size.Width - w2   # 右缘不动, 反推左缘(无边框窗 Width≈ClientWidth)
                    if dy:
                        y = n.Location.Y + n.Size.Height - h2  # 下缘不动, 反推上缘
                    n.Location = Point(x, y)
                n.ClientSize = Size(w2, h2)
            return {'ok': _ui_post(do_size)}

        def win_sys_resize(self, dir):
            """进入 Windows 原生尺寸调整模态循环(ReleaseCapture + WM_NCLBUTTONDOWN
            + HT 边框命中码): DefWindowProc 像鼠标按在真实边框上一样进入系统 resize
            循环——系统接管鼠标捕获/光标样式/窗口几何(位置+尺寸原子更新), 根治前端
            JS 拖拽经桥往返的抖动、鼠标出窗断流不跟手、光标还原普通指针三类问题。
            最小尺寸由 pywebview 已设的 Form.MinimumSize(WM_GETMINMAXINFO)钳制。
            dir: n/s/e/w/ne/nw/se/sw"""
            HT = {'w': 10, 'e': 11, 'n': 12, 'nw': 13, 'ne': 14,
                  's': 15, 'sw': 16, 'se': 17}   # HTLEFT..HTBOTTOMRIGHT
            hit = HT.get(str(dir).lower())
            if not hit:
                return {'ok': False, 'error': 'bad dir'}
            def do_sysresize():
                import ctypes
                from System.Windows.Forms import FormWindowState
                n = window_ref['native']
                if n.WindowState != FormWindowState.Normal:
                    return   # 与 win_resize 同守卫: 最大化/最小化下不动窗口
                if not ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000:
                    return   # 左键已松(快速点击/selftest 合成事件): 无按键进入循环
                              # 会变成"移动鼠标即改尺寸"的幽灵模式, 直接忽略
                try:
                    u = ctypes.windll.user32
                    class _PT(ctypes.Structure):
                        _fields_ = [('x', ctypes.c_long), ('y', ctypes.c_long)]
                    pt = _PT()
                    u.GetCursorPos(ctypes.byref(pt))
                    # WebView2 在 mousedown 时已捕获鼠标, 先释放再模拟"按在边框上";
                    # SendMessage 同步进入循环(期间模态泵消息), 松手返回
                    u.ReleaseCapture()
                    u.SendMessageW(n.Handle.ToInt32(), 0x00A1, hit,
                                   (pt.y << 16) | (pt.x & 0xFFFF))   # WM_NCLBUTTONDOWN(IntPtr 不能 int() 直转, 用 ToInt32)
                except Exception as e:
                    try:
                        with open(os.path.join(out_dir(), 'selftest_result.txt'), 'a', encoding='utf-8') as f:
                            f.write('SYSRESIZE-FAIL %s: %s %s\n' % (dir, type(e).__name__, e))
                    except Exception:
                        pass
            return {'ok': _ui_post(do_sysresize)}

        def win_get_max(self):
            return {'maximized': bool(window_ref.get('maximized'))}

        def win_toggle_max(self):
            def toggle():
                from System.Windows.Forms import FormWindowState
                native = window_ref['native']
                native.WindowState = (FormWindowState.Normal
                                      if native.WindowState == FormWindowState.Maximized
                                      else FormWindowState.Maximized)
            return {'ok': _ui_post(toggle)}

    return Api()


def run_app():
    import webview
    import threading
    window_ref = {}

    api = build_api(window_ref)
    html = resource_path('ui', 'index.html')
    if '--selftest' in sys.argv:
        html += '#selftest'
    win = webview.create_window(
        'Cella', html,
        js_api=api, width=1280, height=820, min_size=(960, 600),
        frameless=True, easy_drag=False, background_color='#16171c')
    window_ref['win'] = win

    def _grab_native():
        # shown 事件在 UI 线程触发, 此处预存 native 引用; 之后工作线程只读 dict,
        # 避免跨线程 pythonnet 属性访问死锁
        try:
            native = win.native
            window_ref['native'] = native
        except Exception:
            pass
        # 初始居中于鼠标所在屏幕的工作区: pywebview 的 CenterScreen 实测位置不稳定
        # (多次启动 130,130/26,26/156,156 均不居中); WinForms 坐标(Screen/Location)
        # 与物理坐标换算在 DPI 虚拟化下不可靠(实测 WinForms 算的"居中"偏差 94x108
        # 且非平移一致)——改全程物理 API(GetWindowRect/MonitorFromPoint/SetWindowPos)。
        # 延迟 0.6s 等 WebView2 初始化期的尺寸变化稳定后再居中(只做一次)。
        def do_center():
            try:
                import ctypes
                from System.Windows.Forms import FormWindowState
                n = window_ref['native']
                if n.WindowState != FormWindowState.Normal:
                    return
                u = ctypes.windll.user32
                class _RECT(ctypes.Structure):
                    _fields_ = [('l', ctypes.c_long), ('t', ctypes.c_long),
                                ('r', ctypes.c_long), ('b', ctypes.c_long)]
                class _MI(ctypes.Structure):
                    _fields_ = [('cbSize', ctypes.c_ulong), ('rcMonitor', _RECT),
                                ('rcWork', _RECT), ('dwFlags', ctypes.c_ulong)]
                class _PT(ctypes.Structure):
                    _fields_ = [('x', ctypes.c_long), ('y', ctypes.c_long)]
                wr = _RECT()
                if not u.GetWindowRect(n.Handle.ToInt32(), ctypes.byref(wr)):
                    return
                pt = _PT()
                u.GetCursorPos(ctypes.byref(pt))
                mi = _MI()
                mi.cbSize = ctypes.sizeof(_MI)
                hmon = u.MonitorFromPoint(pt, 2)   # MONITOR_DEFAULTTONEAREST: 鼠标所在屏
                if not u.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                    return
                w, h = wr.r - wr.l, wr.b - wr.t
                x = mi.rcWork.l + (mi.rcWork.r - mi.rcWork.l - w) // 2
                y = mi.rcWork.t + (mi.rcWork.b - mi.rcWork.t - h) // 2
                u.SetWindowPos(n.Handle.ToInt32(), 0, x, y, 0, 0, 0x0005)   # NOSIZE|NOZORDER
            except Exception:
                pass
        def go():
            import time
            time.sleep(0.6)
            try:
                from System import Action
                window_ref['native'].BeginInvoke(Action(do_center))
            except Exception:
                pass
        import threading
        threading.Thread(target=go, daemon=True).start()
    win.events.shown += _grab_native

    def _track_max():
        try:
            window_ref['maximized'] = int(win.native.WindowState) == 2  # Maximized
        except Exception:
            pass
    def _on_max():
        window_ref['maximized'] = True
    def _on_restored():
        try:
            window_ref['maximized'] = int(win.native.WindowState) == 2
        except Exception:
            window_ref['maximized'] = False
    win.events.maximized += _on_max
    win.events.restored += _on_restored

    debug = '--debug' in sys.argv

    if '--selftest' in sys.argv:
        def probe():
            import time
            LOG = os.path.join(out_dir(), 'selftest_probe.txt')
            def log(msg):
                with open(LOG, 'a', encoding='utf-8') as f:
                    f.write(msg + '\n')
            log('probe start')
            time.sleep(6)
            log('sleep done, calling evaluate_js #1')
            try:
                r1 = win.evaluate_js("JSON.stringify({hasChrome: typeof window.chrome!=='undefined' && !!window.chrome.webview, hasPw: !!window.pywebview, apiKeys: Object.keys((window.pywebview&&window.pywebview.api)||{}), platform: window.pywebview?window.pywebview.platform:null})")
                log('probe1 result: ' + str(r1))
            except Exception as e:
                log('probe1 EXC: %s %s' % (type(e).__name__, e))
            log('calling evaluate_js #2')
            try:
                r2 = win.evaluate_js("window.pywebview && window.pywebview.api ? (function(){ try { window.pywebview.api.selftest_report('EVAL_PING'); return 'CALLED'; } catch(e){ return 'THROW:'+e.message; } })() : 'NO_API'")
                log('probe2 result: ' + str(r2))
            except Exception as e:
                log('probe2 EXC: %s %s' % (type(e).__name__, e))
            log('calling evaluate_js #3: win_minimize (BeginInvoke fix)')
            try:
                r3 = win.evaluate_js("window.pywebview.api ? (function(){ try { window.pywebview.api.win_minimize(); return 'FIRED'; } catch(e){ return 'THROW:'+e.message; } })() : 'NO_API'")
                log('probe3 fired: ' + str(r3))
            except Exception as e:
                log('probe3 EXC: %s %s' % (type(e).__name__, e))
            time.sleep(2)
            log('probe3 waited (UI-ACTION-DONE expected in result log)')
            log('calling evaluate_js #4: pick_and_load (STA dialog + ESC autoclose)')
            try:
                win.evaluate_js("window.pywebview.api ? window.pywebview.api.pick_and_load() : null")
            except Exception as e:
                log('probe4 EXC: %s %s' % (type(e).__name__, e))

            def esc():
                time.sleep(3)
                try:
                    from System.Windows.Forms import SendKeys
                    SendKeys.SendWait('{ESC}')
                    log('ESC sent')
                except Exception as e:
                    log('ESC fail: %s %s' % (type(e).__name__, e))
            threading.Thread(target=esc, daemon=True).start()
            time.sleep(5)
            log('calling evaluate_js #5: edge resize simulation (+100x+80)')
            try:
                win.evaluate_js("(function(){ const h=document.querySelector('.edge-se'); if(!h) return 'NO_HANDLE'; h.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:innerWidth-5,clientY:innerHeight-5,button:0})); document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:innerWidth+95,clientY:innerHeight+75})); document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); return 'DRAGGED'; })()")
            except Exception as e:
                log('probe5 EXC: %s %s' % (type(e).__name__, e))
            time.sleep(2)

            def read_size():
                try:
                    n = window_ref.get('native')
                    with open(os.path.join(out_dir(), 'selftest_result.txt'), 'a', encoding='utf-8') as f:
                        f.write('CLIENT-SIZE %sx%s\n' % (n.ClientSize.Width, n.ClientSize.Height))
                except Exception:
                    pass
            from System import Action
            window_ref['native'].BeginInvoke(Action(read_size))
            time.sleep(2)
            log('probe end')
        threading.Thread(target=probe, daemon=True).start()

    webview.start(debug=debug)


# ---------------------------------------------------------------- dev 模式
def run_dev(port=8765):
    """本地 http 服务: / -> ui 静态文件; /api/mock -> 读取 test.xlsx 供前端调试"""
    import http.server
    import xlio

    ui_dir = os.path.join(HERE, 'ui')

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ui_dir, **kw)

        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            if self.path.startswith('/api/mock'):
                from urllib.parse import urlparse, parse_qs, unquote
                qs = parse_qs(urlparse(self.path).query)
                f = (qs.get('file') or ['test.xlsx'])[0]
                if not os.path.isabs(f):
                    f = os.path.normpath(os.path.join(HERE, '..', f))
                try:
                    data = xlio.load_any(f)
                except Exception as e:
                    data = {'ok': False, 'error': str(e)}
                body = json.dumps(data, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            if self.path.startswith('/api/save_back'):
                length = int(self.headers.get('Content-Length') or 0)
                payload = json.loads(self.rfile.read(length) or b'{}')
                print('[dev] save_back payload:', json.dumps(payload, ensure_ascii=False)[:2000])
                body = json.dumps({'ok': True, 'savedTo': '(dev: not actually written)', 'notes': []},
                                  ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_error(404)

    print('dev server: http://127.0.0.1:%d  (mock 数据来自 test.xlsx)' % port)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.serve_forever()


if __name__ == '__main__':
    if '--dev' in sys.argv:
        run_dev()
    else:
        run_app()
