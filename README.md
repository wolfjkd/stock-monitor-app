# Stock Monitor App - A股价格预警监控系统（桌面版）

独立Windows桌面应用，系统托盘后台运行，Flask+pywebview开发。

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v4.0 | 2026-06-09 | 首次发布：桌面版基础架构（Flask+pywebview+pystray+PyInstaller） |
| v4.1 | 2026-06-09 | 增强监控字段（手数/委托方向/状态）、UI交互优化（列拖拽/面板分割/触发弹窗+声音） |
| v4.3 | 2026-06-10 | CSV一键导入、批量操作（全选/删除）、拖拽排序、股票名称自动识别、目标价列突出显示 |
| v4.5 | 2026-06-11 | 大单标记模块（eltdx逐笔成交检测）、UI全面优化（字体加大/居中/列宽独立调节/布局调整） |
| v4.6 | 2026-06-17 | 升级 eltdx 1.0.2 API（`Client(host)` → `Client.from_hosts([host])`，`get_quote()` → `quotes.get_snapshots()`） |

## 项目定位

为 A 股日内交易员提供**桌面版价格预警工具`。

**实际功能**：
- 系统托盘后台运行
- 实时监控持仓股票价格
- 触发预警时弹窗+声音提醒
- CSV 导入券商交易记录

**不吹牛**：
- 不是"AI智能预警"，就是简单的价格突破提醒
- 没有"多源智能路由"，就是 eltdx + 腾讯接口双源
- 大单标记模块基于 eltdx 逐笔成交，延迟 ~45ms

## 版本定位

| 项目 | 版本 | 说明 |
|------|------|------|
| [stock-monitor](https://github.com/wolfjkd/stock-monitor) | CLI版 v2.0 | 命令行工具 |
| [stock-monitor-web](https://github.com/wolfjkd/stock-monitor-web) | Web版 v3.0 | 浏览器访问 |
| **stock-monitor-app** | 桌面版 v4.x | 独立程序，系统托盘 |

## 核心功能

### 系统托盘
- 后台运行，不占任务栏
- 右下角托盘图标
- 右键菜单：显示窗口、退出

### 独立窗口
- 双击exe直接运行，无需浏览器
- Edge WebView2渲染
- 关闭窗口后继续后台监控

### 监控功能
- 实时行情（eltdx通达信协议，延迟 ~40ms）
- 多TDX节点支持，一键切换
- 预警日志（SSE推送）
- 配置管理（增删改查监控股票）

### CSV导入
- 支持券商CSV（GBK编码）
- 自动识别：代码/委托类型/价格/数量
- 委托类型映射：融资买入→多仓，现金卖出→空仓
- 异步查询股票名称

### 批量操作
- 全选/多选/批量删除
- 拖拽排序（同一只股票整体移动）

### 监控配置字段
| 字段 | 说明 |
|------|------|
| 股票代码 | sh/sz + 6位数字 |
| 股票名称 | 自动或手动填写 |
| 目标价格 | 触发预警的价格阈值 |
| 手数 | 委托手数（可选） |
| 委托方向 | 多仓（红）/ 空仓（绿） |
| 监控方向 | 跌破 / 涨破 / 双向 |
| 状态 | 启用 / 暂停 |

### UI交互
- 列宽可拖拽调整
- 面板比例可拖拽调整
- 预警弹窗 + 声音（不抢焦点，8秒自动消失）
- 预警行动画

## 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 后端 | Flask | 复用Web版 |
| 前端 | HTML/JS/CSS + Bootstrap 5 | 复用Web版 |
| 窗口 | pywebview (Edge WebView2) | 轻量级WebView |
| 托盘 | pystray | 系统托盘 |
| 数据源 | eltdx (TDX协议) + 腾讯接口 | 双源自动回退 |
| 打包 | PyInstaller | 生成独立exe |

## 快速开始

### 直接运行exe
下载 Release 中的 `StockMonitor.exe`，双击运行。

### 源码运行
```bash
pip install -r requirements.txt
python run.py
```

### 打包
```bash
python build/build.py
```
打包完成后，`dist/StockMonitor/StockMonitor.exe` 即为独立可执行文件（约6.6MB）。

## 项目结构

```
stock-monitor-app/
├── app/
│   ├── __init__.py
│   ├── main.py              # 主程序入口（Flask+pywebview+pystray整合）
│   ├── server.py            # Flask后端（全部API接口+监控主循环）
│   ├── config.py            # 应用配置
│   ├── window.py            # pywebview窗口管理
│   └── tray.py              # pystray系统托盘
├── static/
│   ├── js/main.js           # 前端交互逻辑（列拖拽/面板分割/弹窗/声音/批量操作/拖拽排序）
│   ├── css/
│   └── icon/app.ico         # 应用图标
├── templates/
│   └── index.html           # 前端页面（单页应用）
├── scripts/
│   ├── price_alert.py       # 核心监控脚本（TDX/腾讯双源）
│   ├── watchlist_config.json # 监控股票配置
│   └── tdx_nodes.json       # TDX节点配置
├── build/
│   └── build.py             # PyInstaller打包脚本
├── docs/                    # 文档
├── run.py                   # 开发启动入口
├── run.bat                  # Windows启动脚本
├── build.bat                # Windows打包脚本
├── requirements.txt         # Python依赖
├── CHANGELOG.md             # 版本变更记录
├── LICENSE                  # MIT许可证
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
