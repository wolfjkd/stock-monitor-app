"""
server.py — Flask后端服务器
复用Web版app.py的核心逻辑，适配桌面应用
"""

import json
import os
import sys
import time
import datetime
import threading
import queue
from flask import Flask, render_template, jsonify, request, Response

from app.config import (
    TEMPLATES_DIR, STATIC_DIR, SCRIPTS_DIR, CONFIG_FILE,
    FLASK_HOST, FLASK_PORT, APP_VERSION
)

# 添加scripts目录到路径
sys.path.insert(0, SCRIPTS_DIR)
from price_alert import (
    get_quote_tdx, get_quote_tencent, close_tdx_client,
    get_current_node_info, get_available_nodes, TDX_NODES
)

# 创建Flask应用，指定模板和静态文件目录
app = Flask(__name__,
            template_folder=TEMPLATES_DIR,
            static_folder=STATIC_DIR)

# ============================================================
# 全局状态
# ============================================================

# 监控状态
monitor_state = {
    'running': False,
    'start_time': None,
    'source': 'tdx',
    'thread': None
}

# 预警日志队列（用于SSE推送）
alert_queue = queue.Queue(maxsize=1000)

# 实时行情缓存
quotes_cache = {}


def load_config():
    """加载监控配置"""
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f'Error loading config: {e}')
        return {'interval': 5, 'source': 'tdx', 'alerts': []}


def save_config(config):
    """保存监控配置"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f'Error saving config: {e}')
        return False


def fetch_quote(code, source='tdx'):
    """获取实时行情"""
    try:
        if source == 'tdx':
            return get_quote_tdx(code)
        else:
            return get_quote_tencent(code)
    except Exception as e:
        print(f'Error fetching quote for {code}: {e}')
        return None


def monitor_loop():
    """监控主循环（带自动重连）"""
    global quotes_cache

    config = load_config()
    interval = config.get('interval', 5)
    source = config.get('source', 'tdx')
    alerts = config.get('alerts', [])

    print(f'[Monitor] Starting with {len(alerts)} stocks, source={source}, interval={interval}s')

    alert_cooldown = {}
    consecutive_errors = 0
    max_consecutive_errors = 10

    while monitor_state['running']:
        now_str = datetime.datetime.now().strftime('%H:%M:%S')
        loop_success = False

        try:
            for item in alerts:
                if not monitor_state['running']:
                    break

                code = item['code']
                target = item['target']
                direction = item.get('dir', 'below')
                name = item.get('name', code)
                is_paused = item.get('status') == 'paused'

                try:
                    q = fetch_quote(code, source)
                    if q is None:
                        continue

                    price = q.get('price')
                    if price is None:
                        continue

                    loop_success = True

                    # 更新缓存
                    quotes_cache[code] = {
                        'name': name,
                        'code': code,
                        'price': price,
                        'changePct': q.get('change_pct'),
                        'yest_close': q.get('yest_close'),
                        'open': q.get('open'),
                        'high': q.get('high'),
                        'low': q.get('low'),
                        'volume': q.get('volume'),
                        'amount': q.get('amount'),
                        'target': target,
                        'direction': direction,
                        'last_update': now_str
                    }

                    # 检查是否触发预警（暂停状态不触发）
                    if not is_paused:
                        triggered = False
                        reason = ''

                        if direction in ('below', 'both') and price <= target:
                            triggered = True
                            reason = f'{name}({code}) 跌破 {target} | 当前: {price:.2f}'
                        if direction in ('above', 'both') and price >= target:
                            triggered = True
                            reason = f'{name}({code}) 涨破 {target} | 当前: {price:.2f}'

                        if triggered:
                            cooldown_key = f'{code}_{direction}'
                            last_alert_time = alert_cooldown.get(cooldown_key, 0)
                            current_time = time.time()

                            if current_time - last_alert_time >= 60:
                                alert_line = f'[{now_str}] *** ALERT *** {reason}'
                                print(alert_line)

                                # 推送到SSE队列
                                alert_data = {
                                    'time': now_str,
                                    'type': 'alert',
                                    'message': reason,
                                    'code': code,
                                    'price': price
                                }
                                try:
                                    alert_queue.put_nowait(alert_data)
                                except queue.Full:
                                    pass

                                alert_cooldown[cooldown_key] = current_time

                except Exception as e:
                    print(f'[Monitor] Error for {code}: {e}')

            # 重置连续错误计数
            if loop_success:
                consecutive_errors = 0
            else:
                consecutive_errors += 1

        except Exception as e:
            print(f'[Monitor] Loop error: {e}')
            consecutive_errors += 1

            # 连续错误过多，尝试重连TDX
            if consecutive_errors >= max_consecutive_errors:
                print(f'[Monitor] Too many errors ({consecutive_errors}), reconnecting TDX...')
                try:
                    close_tdx_client()
                    time.sleep(2)
                    config = load_config()
                    alerts = config.get('alerts', [])
                    consecutive_errors = 0
                except Exception as reconnect_error:
                    print(f'[Monitor] Reconnect failed: {reconnect_error}')

        time.sleep(interval)

    print('[Monitor] Stopped')


# ============================================================
# API路由
# ============================================================

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')


@app.route('/api/version')
def api_version():
    """获取版本号"""
    return jsonify({'success': True, 'version': APP_VERSION})


@app.route('/api/quotes')
def api_quotes():
    """获取所有监控股票的实时行情"""
    return jsonify({
        'success': True,
        'data': quotes_cache,
        'timestamp': datetime.datetime.now().strftime('%H:%M:%S')
    })


@app.route('/api/quote/<code>')
def api_quote(code):
    """获取单只股票行情"""
    source = request.args.get('source', 'tdx')
    q = fetch_quote(code, source)
    if q:
        return jsonify({'success': True, 'data': q})
    return jsonify({'success': False, 'error': 'Failed to fetch quote'}), 500


@app.route('/api/config', methods=['GET'])
def api_get_config():
    """获取监控配置"""
    config = load_config()
    return jsonify({'success': True, 'data': config})


@app.route('/api/config', methods=['POST'])
def api_update_config():
    """更新监控配置"""
    new_config = request.json
    if not new_config:
        return jsonify({'success': False, 'error': 'Invalid config'}), 400

    if save_config(new_config):
        if monitor_state['running']:
            monitor_state['running'] = False
            time.sleep(1)
            monitor_state['running'] = True
            monitor_state['thread'] = threading.Thread(target=monitor_loop, daemon=True)
            monitor_state['thread'].start()

        return jsonify({'success': True, 'message': 'Config updated'})
    return jsonify({'success': False, 'error': 'Failed to save config'}), 500


@app.route('/api/monitor/start', methods=['POST'])
def api_start_monitor():
    """启动监控"""
    if monitor_state['running']:
        return jsonify({'success': False, 'error': 'Monitor already running'}), 400

    monitor_state['running'] = True
    monitor_state['start_time'] = datetime.datetime.now()
    monitor_state['thread'] = threading.Thread(target=monitor_loop, daemon=True)
    monitor_state['thread'].start()

    return jsonify({
        'success': True,
        'message': 'Monitor started',
        'start_time': monitor_state['start_time'].strftime('%H:%M:%S')
    })


@app.route('/api/monitor/stop', methods=['POST'])
def api_stop_monitor():
    """停止监控"""
    if not monitor_state['running']:
        return jsonify({'success': False, 'error': 'Monitor not running'}), 400

    monitor_state['running'] = False
    close_tdx_client()

    return jsonify({'success': True, 'message': 'Monitor stopped'})


@app.route('/api/monitor/status')
def api_monitor_status():
    """获取监控状态"""
    uptime = None
    if monitor_state['running'] and monitor_state['start_time']:
        uptime = str(datetime.datetime.now() - monitor_state['start_time']).split('.')[0]

    node_info = get_current_node_info()

    return jsonify({
        'success': True,
        'data': {
            'running': monitor_state['running'],
            'start_time': monitor_state['start_time'].strftime('%H:%M:%S') if monitor_state['start_time'] else None,
            'uptime': uptime,
            'source': monitor_state.get('source', 'tdx'),
            'current_node': node_info
        }
    })


@app.route('/api/nodes')
def api_nodes():
    """获取所有TDX节点信息"""
    nodes = []
    current_node = get_current_node_info()
    available = get_available_nodes()
    available_hosts = {n['host'] for n in available}

    for node in TDX_NODES:
        nodes.append({
            **node,
            'is_current': node['host'] == current_node.get('host'),
            'is_available': node['host'] in available_hosts
        })

    return jsonify({
        'success': True,
        'data': {
            'nodes': nodes,
            'current': current_node
        }
    })


@app.route('/api/nodes/switch', methods=['POST'])
def api_switch_node():
    """切换TDX节点"""
    node_id = request.json.get('node_id')
    if not node_id:
        return jsonify({'success': False, 'error': 'Missing node_id'}), 400

    target_node = None
    for node in TDX_NODES:
        if node['id'] == node_id:
            target_node = node
            break

    if not target_node:
        return jsonify({'success': False, 'error': 'Node not found'}), 404

    close_tdx_client()
    try:
        from eltdx import Client
        client = Client(host=target_node['host'])
        client.close()
        return jsonify({
            'success': True,
            'message': f'Switched to {target_node["name"]}',
            'node': target_node
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to connect: {str(e)}'}), 500


@app.route('/api/alerts/stream')
def api_alerts_stream():
    """SSE预警日志流"""
    def event_stream():
        while True:
            try:
                alert = alert_queue.get(timeout=30)
                yield f"data: {json.dumps(alert, ensure_ascii=False)}\n\n"
            except queue.Empty:
                yield ": heartbeat\n\n"

    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@app.route('/api/alerts/clear', methods=['POST'])
def api_clear_alerts():
    """清空预警队列"""
    while not alert_queue.empty():
        try:
            alert_queue.get_nowait()
        except queue.Empty:
            break
    return jsonify({'success': True, 'message': 'Alerts cleared'})


def start_flask_server():
    """启动Flask服务器（在子线程中运行）"""
    print(f'[Server] Starting Flask on {FLASK_HOST}:{FLASK_PORT}')
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, threaded=True, use_reloader=False)


def auto_start_monitor():
    """自动启动监控"""
    monitor_state['running'] = True
    monitor_state['start_time'] = datetime.datetime.now()
    monitor_state['thread'] = threading.Thread(target=monitor_loop, daemon=True)
    monitor_state['thread'].start()
    print('[Monitor] Auto-started')
