"""
tray.py — 系统托盘模块
使用pystray实现Windows系统托盘图标和右键菜单
"""

import pystray
from PIL import Image, ImageDraw
import threading


class SystemTray:
    """系统托盘管理器"""

    def __init__(self, on_show_window=None, on_quit=None):
        self.on_show_window = on_show_window
        self.on_quit = on_quit
        self.icon = None
        self._monitor_running = False
        self._create_icon()

    def _create_icon(self):
        """创建托盘图标"""
        # 创建一个简单的股票图标
        image = self._create_stock_icon()

        # 创建菜单
        menu = pystray.Menu(
            pystray.MenuItem("显示主窗口", self._show_window, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "监控状态",
                pystray.Menu(
                    pystray.MenuItem("运行中", None, enabled=False, visible=True),
                )
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("关于", self._show_about),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", self._quit)
        )

        self.icon = pystray.Icon(
            "stock-monitor",
            image,
            "A股价格预警监控 v4.0",
            menu=menu
        )

    def _create_stock_icon(self):
        """创建股票图标（绿色向上箭头）"""
        # 创建64x64的图标
        width = 64
        height = 64
        image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)

        # 绘制背景圆
        draw.ellipse([4, 4, width - 4, height - 4], fill='#1a1a2e')

        # 绘制向上箭头（表示股票上涨）
        arrow_color = '#2ecc71'  # 绿色

        # 箭头主体（竖线）
        draw.rectangle([28, 18, 36, 46], fill=arrow_color)

        # 箭头头部（三角形）
        arrow_head = [(32, 12), (20, 28), (44, 28)]
        draw.polygon(arrow_head, fill=arrow_color)

        # 底部横线
        draw.rectangle([18, 46, 46, 52], fill=arrow_color)

        return image

    def _show_window(self, icon=None, item=None):
        """显示主窗口"""
        if self.on_show_window:
            self.on_show_window()

    def _show_about(self, icon=None, item=None):
        """显示关于信息"""
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            "A股价格预警监控系统 v4.0\n\n"
            "基于pywebview + pystray开发\n"
            "复用Web版核心代码\n\n"
            "数据源：通达信协议 / 腾讯接口",
            "关于 A股价格预警监控",
            0x40  # MB_ICONINFORMATION
        )

    def _quit(self, icon=None, item=None):
        """退出应用"""
        if self.icon:
            self.icon.stop()
        if self.on_quit:
            self.on_quit()

    def update_status(self, running: bool):
        """更新监控状态"""
        self._monitor_running = running
        status_text = "运行中" if running else "已停止"
        tooltip = f"A股价格预警监控 v4.0 - {status_text}"

        if self.icon:
            self.icon.title = tooltip

    def run(self):
        """运行托盘图标（阻塞）"""
        if self.icon:
            self.icon.run()

    def run_in_thread(self):
        """在后台线程中运行托盘图标"""
        thread = threading.Thread(target=self.run, daemon=True)
        thread.start()
        return thread

    def stop(self):
        """停止托盘图标"""
        if self.icon:
            self.icon.stop()
