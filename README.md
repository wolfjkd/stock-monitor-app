# Stock Monitor App v4.0 - A股价格预警监控系统（桌面版）

独立Windows桌面应用，支持系统托盘后台运行，无需打开浏览器。

## 版本定位

| 项目 | 版本 | 说明 |
|------|------|------|
| [stock-monitor](https://github.com/wolfjkd/stock-monitor) | CLI版 v2.0 | 命令行工具 |
| [stock-monitor-web](https://github.com/wolfjkd/stock-monitor-web) | Web版 v3.0 | 浏览器访问 |
| **stock-monitor-app** | 桌面版 v4.0 | 独立程序，系统托盘 |

## 核心功能

### 系统托盘
- 后台运行，不占任务栏
- 右下角托盘图标
- 右键菜单：显示窗口、退出

### 独立窗口
- 无需打开浏览器
- 像原生APP一样使用
- 关闭窗口后继续后台监控

### 监控功能
- 实时行情展示
- 多TDX节点支持
- 预警日志
- 配置管理

## 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 后端 | Flask | 复用Web版 |
| 前端 | HTML/JS/CSS | 复用Web版 |
| 窗口 | pywebview | 轻量级WebView |
| 托盘 | pystray | 系统托盘 |
| 打包 | PyInstaller | 生成独立exe |

## 安装依赖

```bash
pip install -r requirements.txt
```

## 运行（开发模式）

```bash
python run.py
```

## 打包（生成exe）

```bash
python build/build.py
```

打包完成后，`dist/StockMonitor.exe` 即为独立可执行文件。

## 项目结构

```
stock-monitor-app/
├── app/
│   ├── __init__.py
│   ├── main.py          # 主程序入口
│   ├── tray.py          # 系统托盘模块
│   ├── window.py        # 窗口管理模块
│   ├── server.py        # Flask后端
│   └── config.py        # 配置管理
├── static/
│   ├── js/main.js       # 前端逻辑
│   └── icon/            # 图标资源
├── templates/
│   └── index.html       # 前端页面
├── scripts/
│   ├── price_alert.py   # 核心监控脚本
│   ├── watchlist_config.json
│   └── tdx_nodes.json
├── build/
│   └── build.py         # 打包脚本
├── run.py               # 开发启动脚本
├── run.bat              # Windows启动脚本
├── build.bat            # Windows打包脚本
├── requirements.txt
└── README.md
```

## 代码复用

基于Web版（v3.0）核心代码重构，复用率 ~90%：

| Web版代码 | 复用方式 |
|-----------|----------|
| app.py | 重构为 server.py |
| templates/ | 直接使用 |
| static/ | 直接使用 |
| scripts/ | 直接使用 |

## 相关项目

- [stock-monitor](https://github.com/wolfjkd/stock-monitor) - CLI版（v2.0）
- [stock-monitor-web](https://github.com/wolfjkd/stock-monitor-web) - Web版（v3.0）

## 许可证

MIT License
