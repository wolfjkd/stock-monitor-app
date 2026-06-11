"""
config.py — 桌面应用配置管理
"""

import os
import sys


def get_app_dir():
    """获取应用根目录（兼容打包后的路径）"""
    if getattr(sys, 'frozen', False):
        # PyInstaller打包后的路径
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_resource_path(relative_path):
    """获取资源文件路径（兼容打包后的路径）"""
    if getattr(sys, 'frozen', False):
        # PyInstaller打包后的临时目录
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


# 应用信息
APP_NAME = "A股价格预警监控"
APP_VERSION = "4.5"
APP_TITLE = f"{APP_NAME} v{APP_VERSION}"

# Flask服务器配置
FLASK_HOST = '127.0.0.1'
FLASK_PORT = 5000
FLASK_URL = f'http://{FLASK_HOST}:{FLASK_PORT}'

# 窗口配置
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
WINDOW_MIN_WIDTH = 800
WINDOW_MIN_HEIGHT = 600

# 路径配置
APP_DIR = get_app_dir()
TEMPLATES_DIR = get_resource_path('templates')
STATIC_DIR = get_resource_path('static')
SCRIPTS_DIR = get_resource_path('scripts')
ICON_DIR = get_resource_path('static/icon')

# 配置文件路径
CONFIG_FILE = os.path.join(SCRIPTS_DIR, 'watchlist_config.json')
