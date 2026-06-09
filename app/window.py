"""
window.py — 窗口管理模块
使用pywebview创建独立窗口，支持关闭时最小化到托盘
"""

import webview
import threading
from app.config import APP_TITLE, FLASK_URL, WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT


class AppWindow:
    """应用窗口管理器"""

    def __init__(self, on_close=None, on_minimize=None):
        self.window = None
        self.on_close = on_close
        self.on_minimize = on_minimize
        self._is_closing = False

    def create(self):
        """创建pywebview窗口"""
        self.window = webview.create_window(
            APP_TITLE,
            FLASK_URL,
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            resizable=True,
            min_size=(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT),
            background_color='#f0f2f5'
        )

        # 绑定窗口关闭事件
        self.window.events.closed += self._on_window_closed

        return self.window

    def _on_window_closed(self):
        """窗口关闭时的处理"""
        if not self._is_closing:
            # 如果不是主动退出，只是隐藏窗口
            if self.on_close:
                self.on_close()

    def show(self):
        """显示窗口"""
        if self.window:
            try:
                # pywebview的窗口显示/隐藏
                self.window.show()
            except Exception:
                pass

    def hide(self):
        """隐藏窗口"""
        if self.window:
            try:
                self.window.hide()
            except Exception:
                pass

    def minimize(self):
        """最小化窗口"""
        if self.window:
            try:
                self.window.minimize()
            except Exception:
                pass

    def restore(self):
        """恢复窗口"""
        if self.window:
            try:
                self.window.restore()
                self.window.focus()
            except Exception:
                pass

    def set_closing(self):
        """标记窗口正在关闭（用于区分最小化和真正退出）"""
        self._is_closing = True

    def is_visible(self):
        """检查窗口是否可见"""
        if self.window:
            try:
                return self.window.visible
            except Exception:
                return False
        return False


def start_webview(window: AppWindow):
    """
    启动pywebview事件循环
    注意：这个函数会阻塞，需要在主线程中运行
    """
    webview.start(debug=False)
