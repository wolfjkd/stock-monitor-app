"""
build.py — PyInstaller打包脚本
生成独立exe文件：dist/StockMonitor.exe
"""

import PyInstaller.__main__
import os
import sys
import shutil

# 项目根目录
project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist_dir = os.path.join(project_dir, 'dist')
build_dir = os.path.join(project_dir, 'build', 'work')

# 清理旧的构建文件
for dir_path in [dist_dir, build_dir]:
    if os.path.exists(dir_path):
        shutil.rmtree(dir_path)
        print(f'[build] Cleaned: {dir_path}')

# PyInstaller参数
args = [
    'run.py',                          # 入口脚本
    '--name=StockMonitor',             # 生成的exe名称
    '--onedir',                        # 打包为单目录（比onefile启动更快）
    '--windowed',                      # 无控制台窗口
    '--icon=static/icon/app.ico',      # 应用图标
    '--add-data=static;static',        # 静态资源
    '--add-data=templates;templates',  # 模板文件
    '--add-data=scripts;scripts',      # 脚本文件
    '--hidden-import=pystray',         # 隐式导入
    '--hidden-import=pywebview',
    '--hidden-import=eltdx',
    '--hidden-import=flask',
    '--hidden-import=PIL',
    '--collect-all=pywebview',         # 收集pywebview所有依赖
    '--collect-all=pystray',           # 收集pystray所有依赖
    f'--distpath={dist_dir}',          # 输出目录
    f'--workpath={build_dir}',         # 工作目录
    '--noconfirm',                     # 不确认覆盖
    '--clean',                         # 清理缓存
]

print('=' * 50)
print('  Stock Monitor App v4.0 - 打包脚本')
print('=' * 50)
print(f'[build] Project: {project_dir}')
print(f'[build] Output:  {dist_dir}/StockMonitor.exe')
print()

# 执行打包
PyInstaller.__main__.run(args)

# 检查结果
exe_path = os.path.join(dist_dir, 'StockMonitor', 'StockMonitor.exe')
if os.path.exists(exe_path):
    size_mb = os.path.getsize(exe_path) / (1024 * 1024)
    print()
    print('=' * 50)
    print(f'  打包成功！')
    print(f'  输出: {exe_path}')
    print(f'  大小: {size_mb:.1f} MB')
    print('=' * 50)
else:
    print('[build] ERROR: 打包失败，未找到exe文件')
    sys.exit(1)