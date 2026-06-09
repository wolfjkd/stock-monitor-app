"""
main.py — 桌面应用主入口
整合Flask后端、pywebview窗口、pystray托盘
"""

import sys
import os
import threading
import time
import signal

# 确保能找到app模块
if getattr(sys, 'frozen', False):
    # PyInstaller打包后的路径
    app_dir = os.path.dirname(sys.executable)
else:
    app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, app_dir)

from app.config import APP_TITLE, FLASK_HOST, FLASK_PORT, FLASK_URL
from app.server import start_flask_server, auto_start_monitor, monitor_state
from app.window import AppWindow, start_webview
from app.tray import SystemTray


class StockMonitorApp:
    """主应用类"""

    def __init__(self):
        self.window = None
        self.tray = None
        self._running = False
        self._flask_ready = False

    def _wait_for_flask(self, timeout=10):
        """等待Flask服务器启动"""
        import urllib.request
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                req = urllib.request.Request(f'{FLASK_URL}/api/version')
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status == 200:
                        self._flask_ready = True
                        return True
            except Exception:
                pass
            time.sleep(0.5)
        return False

    def _on_show_window(self):
        """从托盘显示窗口"""
        if self.window:
            self.window.restore()

    def _on_window_close(self):
        """窗口关闭时最小化到托盘"""
        # 不退出应用，只是隐藏窗口
        if self.window:
            self.window.hide()
        if self.tray:
            self.tray.update_status(monitor_state['running'])

    def _on_quit(self):
        """退出应用"""
        self._running = False
        monitor_state['running'] = False

        # 关闭TDX连接
        try:
            from price_alert import close_tdx_client
            close_tdx_client()
        except Exception:
            pass

        # 退出pywebview
        if self.window and self.window.window:
            try:
                self.window.window.destroy()
            except Exception:
                pass

        # 强制退出
        os._exit(0)

    def run(self):
        """启动应用"""
        print('=' * 50)
        print(f'  {APP_TITLE}')
        print(f'  A股价格预警监控系统（桌面版）')
        print('=' * 50)

        self._running = True

        # 1. 启动Flask服务器（后台线程）
        print('[App] Starting Flask server...')
        flask_thread = threading.Thread(target=start_flask_server, daemon=True)
        flask_thread.start()

        # 2. 等待Flask服务器就绪
        print('[App] Waiting for Flask server...')
        if not self._wait_for_flask(timeout=15):
            print('[App] ERROR: Flask server failed to start!')
            sys.exit(1)
        print('[App] Flask server ready')

        # 3. 自动启动监控
        auto_start_monitor()

        # 4. 创建系统托盘
        print('[App] Creating system tray...')
        self.tray = SystemTray(
            on_show_window=self._on_show_window,
            on_quit=self._on_quit
        )

        # 5. 创建窗口
        print('[App] Creating window...')
        self.window = AppWindow(
            on_close=self._on_window_close
        )

        # 6. 在后台线程启动托盘
        tray_thread = self.tray.run_in_thread()

        # 7. 更新托盘状态
        self.tray.update_status(True)

        # 8. 启动pywebview（主线程）
        print('[App] Starting webview...')
        print('=' * 50)

        try:
            self.window.create()
            start_webview(self.window)
        except KeyboardInterrupt:
            pass
        finally:
            self._on_quit()


def main():
    """入口函数"""
    app = StockMonitorApp()
    app.run()


if __name__ == '__main__':
    main()
