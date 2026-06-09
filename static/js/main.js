/**
 * main.js — Stock Monitor App v4.0
 * 前端交互逻辑
 */

// ============================================================
// 全局状态
// ============================================================

let monitorRunning = false;
let eventSource = null;
let refreshInterval = null;
let currentConfig = null;

// 首次触发追踪（防止重复弹窗）
const triggeredAlerts = new Set();

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadVersion();
    loadConfig();
    checkMonitorStatus();
    loadNodes();
    refreshInterval = setInterval(refreshQuotes, 3000);
    connectAlertStream();
    initColResize();
    initPanelSplitter();
});

// ============================================================
// API调用函数
// ============================================================

async function loadVersion() {
    const result = await apiCall('/api/version');
    if (result.success) {
        document.getElementById('versionBadge').textContent = 'v' + result.version;
    }
}

async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// 配置管理
// ============================================================

async function loadConfig() {
    const result = await apiCall('/api/config');
    if (result.success) {
        currentConfig = result.data;
        renderConfigTable();
    }
}

async function saveConfig(config) {
    const result = await apiCall('/api/config', 'POST', config);
    if (result.success) {
        currentConfig = config;
        renderConfigTable();
        showToast('配置已保存', 'success');
    } else {
        showToast('保存失败: ' + (result.error || '未知错误'), 'danger');
    }
}

function renderConfigTable() {
    const tbody = document.getElementById('configTableBody');
    if (!currentConfig || !currentConfig.alerts || currentConfig.alerts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    <i class="bi bi-inbox"></i> 暂无监控股票，点击"添加"开始
                </td>
            </tr>
        `;
        return;
    }

    // 给每只股票分配一个分组索引（用于背景色）
    const stockGroups = {};
    let groupIndex = 0;
    currentConfig.alerts.forEach(item => {
        if (!(item.code in stockGroups)) {
            stockGroups[item.code] = groupIndex % 6;
            groupIndex++;
        }
    });

    tbody.innerHTML = currentConfig.alerts.map((item, index) => {
        const quote = window.quotesCache ? window.quotesCache[item.code] : null;
        const price = quote ? quote.price : '--';
        const changePct = quote ? quote.changePct : null;
        const priceStatus = getStatus(item, quote);
        const dir = item.dir || 'below';
        const dirLabel = dir === 'below' ? '跌破' : dir === 'above' ? '涨破' : '双向';
        const dirClass = dir === 'below' ? 'text-success' : dir === 'above' ? 'text-danger' : 'text-primary';

        // 委托方向 → 决定目标价/手数的颜色
        const position = item.position || '多仓';
        const posColorClass = position === '多仓' ? 'pos-long' : 'pos-short';
        const positionClass = position === '多仓' ? 'text-danger fw-bold' : 'text-success fw-bold';

        // 手数
        const lots = item.lots || '--';

        // 启用/暂停状态
        const status = item.status || 'enabled';
        const isPaused = status === 'paused';
        const statusBadge = isPaused
            ? '<span class="badge bg-secondary" style="font-size:10px">暂停</span>'
            : '<span class="badge bg-success" style="font-size:10px">启用</span>';

        const groupClass = `stock-group-${stockGroups[item.code]}`;
        const isDivider = index > 0 && currentConfig.alerts[index - 1].code !== item.code;
        const alertClass = !isPaused && priceStatus.class === 'status-alert' ? 'alert-row' : !isPaused && priceStatus.class === 'status-warning' ? 'warning-row' : '';
        const pausedClass = isPaused ? 'opacity-50' : '';
        const rowClass = `${groupClass} ${isDivider ? 'stock-divider' : ''} ${alertClass} ${pausedClass}`;

        // 检查首次触发
        checkFirstTrigger(item, quote, priceStatus);

        return `
            <tr class="${rowClass}">
                <td><strong>${item.name || item.code}</strong></td>
                <td><code>${item.code}</code></td>
                <td class="${getPriceClass(changePct)}">${formatChange(changePct)}</td>
                <td class="${getPriceClass(changePct)}">${formatPrice(price)}</td>
                <td class="${posColorClass}">${formatPrice(item.target)}</td>
                <td class="${posColorClass}" style="font-size:11px">${lots}</td>
                <td><span class="${positionClass}" style="font-size:11px">${position}</span></td>
                <td><span class="${dirClass}" style="font-size:11px">${dirLabel}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-outline-primary" onclick="editStock(${index})">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getStatus(item, quote) {
    if (!quote || quote.price === null || quote.price === undefined) {
        return { class: 'status-safe', text: '等待数据' };
    }

    const price = quote.price;
    const target = item.target;
    const direction = item.dir || 'below';
    const diff = price - target;
    const threshold = 0.01;

    if (direction === 'below') {
        if (price <= target) return { class: 'status-alert', text: '已跌破' };
        if (diff <= threshold) return { class: 'status-warning', text: '临界' };
        return { class: 'status-safe', text: '安全' };
    } else if (direction === 'above') {
        if (price >= target) return { class: 'status-alert', text: '已涨破' };
        if (-diff <= threshold) return { class: 'status-warning', text: '临界' };
        return { class: 'status-safe', text: '安全' };
    } else {
        if (price <= target || price >= target) return { class: 'status-alert', text: '已触发' };
        if (Math.abs(diff) <= threshold) return { class: 'status-warning', text: '临界' };
        return { class: 'status-safe', text: '安全' };
    }
}

// ============================================================
// 首次触发弹窗 + 声音
// ============================================================

function checkFirstTrigger(item, quote, priceStatus) {
    if (!quote || item.status === 'paused') return;
    if (priceStatus.class !== 'status-alert') return;

    // 生成唯一key: code + target + direction
    const alertKey = `${item.code}_${item.target}_${item.dir || 'below'}`;
    if (triggeredAlerts.has(alertKey)) return;

    // 首次触发！
    triggeredAlerts.add(alertKey);

    const price = quote.price;
    const name = item.name || item.code;
    const dir = item.dir || 'below';
    const dirLabel = dir === 'below' ? '跌破' : dir === 'above' ? '涨破' : '触发';
    const position = item.position || '多仓';
    const lots = item.lots ? ` | ${item.lots}手` : '';
    const message = `${name} ${dirLabel} ¥${formatPrice(item.target)} | 当前: ¥${formatPrice(price)} | ${position}${lots}`;

    showFirstAlertPopup(message);
    playAlertSound();
}

function showFirstAlertPopup(message) {
    const container = document.getElementById('alertPopupContainer');
    const popup = document.createElement('div');
    popup.className = 'alert-popup';

    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    popup.innerHTML = `
        <div class="popup-title"><i class="bi bi-exclamation-triangle-fill"></i> 预警触发</div>
        <div class="popup-message">${message}</div>
        <div class="popup-time">${now} · 点击关闭</div>
    `;

    // 点击关闭
    popup.onclick = function() {
        popup.style.animation = 'popupFadeOut 0.3s ease-in forwards';
        setTimeout(() => popup.remove(), 300);
    };

    container.appendChild(popup);

    // 8秒后自动消失
    setTimeout(() => {
        if (popup.parentNode) {
            popup.style.animation = 'popupFadeOut 0.3s ease-in forwards';
            setTimeout(() => popup.remove(), 300);
        }
    }, 8000);
}

function playAlertSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // 三声短促的提示音
        [0, 0.2, 0.4].forEach(delay => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + delay);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + delay);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.15);

            oscillator.start(audioCtx.currentTime + delay);
            oscillator.stop(audioCtx.currentTime + delay + 0.15);
        });
    } catch (e) {
        console.log('Audio playback failed:', e);
    }
}

// ============================================================
// 实时行情
// ============================================================

async function refreshQuotes() {
    const result = await apiCall('/api/quotes');
    if (result.success) {
        window.quotesCache = result.data;
        renderStockCards();
        renderConfigTable();
        document.getElementById('lastUpdate').textContent = '最后更新: ' + result.timestamp;
    }
}

function renderStockCards() {
    const container = document.getElementById('stockCards');
    if (!currentConfig || !currentConfig.alerts) return;

    const uniqueStocks = {};
    currentConfig.alerts.forEach(item => {
        if (!uniqueStocks[item.code]) {
            uniqueStocks[item.code] = item;
        }
    });

    container.innerHTML = Object.values(uniqueStocks).map(item => {
        const quote = window.quotesCache[item.code];
        if (!quote) {
            return `
                <div class="quote-card">
                    <div class="q-name">${item.name || item.code}</div>
                    <div class="q-price stock-flat">--</div>
                    <div class="q-change stock-flat">等待数据...</div>
                </div>
            `;
        }

        const price = quote.price;
        const changePct = quote.changePct;
        const priceClass = getPriceClass(changePct);

        const alertItems = currentConfig.alerts.filter(a => a.code === item.code && a.status !== 'paused');
        let hasAlert = false;
        for (const ai of alertItems) {
            const s = getStatus(ai, quote);
            if (s.class === 'status-alert') { hasAlert = true; break; }
        }
        const cardClass = hasAlert ? 'quote-card alert-active' : 'quote-card';

        return `
            <div class="${cardClass}">
                <div class="q-name">${quote.name || item.name || item.code}</div>
                <div class="q-price ${priceClass}">¥${formatPrice(price)}</div>
                <div class="q-change ${priceClass}">${formatChange(changePct)}</div>
                <div class="q-target">目标: ¥${formatPrice(item.target)}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 监控控制
// ============================================================

async function checkMonitorStatus() {
    const result = await apiCall('/api/monitor/status');
    if (result.success) {
        updateMonitorUI(result.data);
    }
}

async function startMonitor() {
    const result = await apiCall('/api/monitor/start', 'POST');
    if (result.success) {
        showToast('监控已启动', 'success');
        checkMonitorStatus();
    } else {
        showToast('启动失败: ' + (result.error || '未知错误'), 'danger');
    }
}

async function stopMonitor() {
    const result = await apiCall('/api/monitor/stop', 'POST');
    if (result.success) {
        showToast('监控已停止', 'warning');
        checkMonitorStatus();
    } else {
        showToast('停止失败: ' + (result.error || '未知错误'), 'danger');
    }
}

function updateMonitorUI(data) {
    monitorRunning = data.running;

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('monitorStatusText');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const uptimeEl = document.getElementById('uptime');

    if (data.running) {
        statusDot.className = 'status-dot running';
        statusText.textContent = '运行中';
        btnStart.disabled = true;
        btnStop.disabled = false;
        uptimeEl.textContent = data.uptime || '--:--:--';
    } else {
        statusDot.className = 'status-dot stopped';
        statusText.textContent = '已停止';
        btnStart.disabled = false;
        btnStop.disabled = true;
        uptimeEl.textContent = '--:--:--';
    }

    if (data.current_node) {
        updateCurrentNodeDisplay(data.current_node);
    }
}

// ============================================================
// SSE预警流
// ============================================================

function connectAlertStream() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/api/alerts/stream');

    eventSource.onmessage = function(event) {
        try {
            const alert = JSON.parse(event.data);
            addAlertToLog(alert);
        } catch (e) {
            console.error('Failed to parse alert:', e);
        }
    };

    eventSource.onerror = function() {
        console.log('SSE connection error, reconnecting in 5s...');
        setTimeout(connectAlertStream, 5000);
    };
}

function addAlertToLog(alert) {
    const logContainer = document.getElementById('alertLog');
    const emptyMsg = logContainer.querySelector('.alert-heartbeat');
    if (emptyMsg) emptyMsg.remove();

    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert-item';
    alertDiv.innerHTML = `
        <span class="alert-time">[${alert.time}]</span>
        <span class="alert-message">${alert.message}</span>
    `;

    logContainer.insertBefore(alertDiv, logContainer.firstChild);

    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

async function clearAlerts() {
    await apiCall('/api/alerts/clear', 'POST');
    const logContainer = document.getElementById('alertLog');
    logContainer.innerHTML = '<div class="alert-heartbeat">等待预警事件...</div>';
    showToast('日志已清空', 'info');
}

// ============================================================
// 表格列拖拽调整宽度
// ============================================================

function initColResize() {
    const table = document.getElementById('configTable');
    if (!table) return;

    const headers = table.querySelectorAll('thead th');
    let resizing = false;
    let startX = 0;
    let startWidth = 0;
    let currentTh = null;

    table.addEventListener('mousedown', function(e) {
        const handle = e.target.closest('.col-resize');
        if (!handle) return;

        e.preventDefault();
        resizing = true;
        currentTh = handle.parentElement;
        startX = e.clientX;
        startWidth = currentTh.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', function(e) {
        if (!resizing || !currentTh) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(30, startWidth + diff);
        currentTh.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (resizing) {
            resizing = false;
            document.querySelectorAll('.col-resize').forEach(h => h.classList.remove('active'));
            document.body.style.cursor = '';
            currentTh = null;
        }
    });
}

// ============================================================
// 面板分割拖拽
// ============================================================

function initPanelSplitter() {
    const splitter = document.getElementById('panelSplitter');
    const configPanel = document.getElementById('configPanel');
    const alertPanel = document.getElementById('alertPanel');
    const dataRow = splitter.parentElement;

    let dragging = false;
    let startX = 0;
    let startConfigFlex = 3;
    let startAlertFlex = 2;

    splitter.addEventListener('mousedown', function(e) {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startConfigFlex = parseFloat(getComputedStyle(configPanel).flexGrow) || 3;
        startAlertFlex = parseFloat(getComputedStyle(alertPanel).flexGrow) || 2;
        splitter.classList.add('active');
        document.body.style.cursor = 'col-resize';
        // 防止iframe捕获鼠标
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;

        const dataRowWidth = dataRow.offsetWidth;
        const diff = e.clientX - startX;
        const diffRatio = diff / dataRowWidth * (startConfigFlex + startAlertFlex);

        const newConfigFlex = Math.max(1, startConfigFlex + diffRatio);
        const newAlertFlex = Math.max(1, startAlertFlex - diffRatio);

        configPanel.style.flex = newConfigFlex;
        alertPanel.style.flex = newAlertFlex;
    });

    document.addEventListener('mouseup', function() {
        if (dragging) {
            dragging = false;
            splitter.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// ============================================================
// 股票名称解析 + 排序
// ============================================================

async function resolveStockNames(codes) {
    // 过滤掉已有名称的（name !== code）
    const needResolve = codes.filter(code => {
        const existing = currentConfig.alerts.find(a => a.code === code);
        return existing && existing.name === code;
    });

    if (needResolve.length === 0) return;

    try {
        const result = await apiCall('/api/resolve_names', 'POST', { codes: needResolve });
        if (result.success && result.data) {
            let updated = 0;
            currentConfig.alerts.forEach(a => {
                if (result.data[a.code] && result.data[a.code] !== a.code) {
                    a.name = result.data[a.code];
                    updated++;
                }
            });
            if (updated > 0) {
                saveConfig(currentConfig);
                showToast(`已识别 ${updated} 只股票名称`, 'info');
            }
        }
    } catch (e) {
        console.error('Failed to resolve stock names:', e);
    }
}

function sortAlerts() {
    if (!currentConfig || !currentConfig.alerts) return;
    currentConfig.alerts.sort((a, b) => {
        // 按股票名称（或代码）分组
        const nameCmp = (a.name || a.code).localeCompare(b.name || b.code, 'zh');
        if (nameCmp !== 0) return nameCmp;
        // 同股票按目标价降序（高价在上）
        const priceCmp = (b.target || 0) - (a.target || 0);
        if (priceCmp !== 0) return priceCmp;
        // 同价时空仓在上
        const posA = a.position === '空仓' ? 0 : 1;
        const posB = b.position === '空仓' ? 0 : 1;
        return posA - posB;
    });
}

// ============================================================
// CSV一键导入
// ============================================================

function importCSV(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            if (lines.length < 2) {
                showToast('CSV文件为空或格式错误', 'warning');
                return;
            }

            // 解析表头
            const header = lines[0].split(',').map(h => h.trim());
            const codeIdx = header.indexOf('证券代码');
            const typeIdx = header.indexOf('委托类型');
            const priceIdx = header.indexOf('委托价格');
            const qtyIdx = header.indexOf('委托数量');

            if (codeIdx === -1 || typeIdx === -1 || priceIdx === -1 || qtyIdx === -1) {
                showToast('CSV表头缺少必要列：证券代码/委托类型/委托价格/委托数量', 'warning');
                return;
            }

            const newAlerts = [];
            const skipped = [];

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim());
                if (cols.length < 4) continue;

                // 证券代码：SH.603077 → sh603077
                let code = cols[codeIdx].replace('.', '').toLowerCase();
                if (!/^(sh|sz)\d{6}$/.test(code)) {
                    skipped.push(cols[codeIdx]);
                    continue;
                }

                // 委托类型 → 委托方向 + 监控方向
                const type = cols[typeIdx];
                let position, dir;
                if (type.includes('买入')) {
                    position = '多仓';
                    dir = 'below';  // 买入：跌破目标价提醒
                } else if (type.includes('卖出')) {
                    position = '空仓';
                    dir = 'above';  // 卖出：涨破目标价提醒
                } else {
                    position = '多仓';
                    dir = 'below';
                }

                // 委托价格 → 目标价格
                const target = parseFloat(cols[priceIdx]);
                if (isNaN(target) || target <= 0) {
                    skipped.push(cols[codeIdx] + '(价格无效)');
                    continue;
                }

                // 委托数量 → 手数（股数÷100）
                const shares = parseInt(cols[qtyIdx]);
                const lots = isNaN(shares) ? null : Math.round(shares / 100);

                // 查找股票名称（从现有配置中获取）
                const existing = currentConfig.alerts.find(a => a.code === code);
                const name = existing ? existing.name : code;

                const alert = {
                    code,
                    name,
                    target,
                    dir,
                    position,
                    status: 'enabled'
                };
                if (lots > 0) alert.lots = lots;

                newAlerts.push(alert);
            }

            if (newAlerts.length === 0) {
                showToast('未解析到有效数据', 'warning');
                return;
            }

            // 追加到现有配置
            currentConfig.alerts.push(...newAlerts);
            sortAlerts();
            saveConfig(currentConfig);

            let msg = `成功导入 ${newAlerts.length} 条监控`;
            if (skipped.length > 0) {
                msg += `，跳过 ${skipped.length} 条（${skipped.join(', ')}）`;
            }
            showToast(msg, 'success');

            // 异步解析股票名称
            resolveStockNames(newAlerts.map(a => a.code));

        } catch (err) {
            showToast('CSV解析失败: ' + err.message, 'danger');
        }
    };

    reader.readAsText(file, 'GBK');
    // 清空input，允许重复导入同一文件
    input.value = '';
}

// ============================================================
// 股票管理
// ============================================================

function addStock() {
    const code = document.getElementById('addCode').value.trim();
    const name = document.getElementById('addName').value.trim();
    const target = parseFloat(document.getElementById('addTarget').value);
    const lots = parseInt(document.getElementById('addLots').value) || null;
    const position = document.getElementById('addPosition').value;
    const direction = document.getElementById('addDirection').value;
    const status = document.getElementById('addStatus').value;

    if (!code || !target) {
        showToast('请填写股票代码和目标价格', 'warning');
        return;
    }

    if (!/^(sh|sz)\d{6}$/.test(code)) {
        showToast('股票代码格式错误，应为 sh+6位数字 或 sz+6位数字', 'warning');
        return;
    }

    const newStock = {
        code,
        name: name || code,
        target,
        dir: direction,
        position: position,
        status: status
    };

    if (lots) {
        newStock.lots = lots;
    }

    currentConfig.alerts.push(newStock);
    sortAlerts();
    saveConfig(currentConfig);

    document.getElementById('addStockForm').reset();
    bootstrap.Modal.getInstance(document.getElementById('addStockModal')).hide();

    // 如果名称是代码，尝试解析
    if (!name) resolveStockNames([code]);
}

function editStock(index) {
    const stock = currentConfig.alerts[index];
    document.getElementById('editIndex').value = index;
    document.getElementById('editCode').value = stock.code;
    document.getElementById('editName').value = stock.name || '';
    document.getElementById('editTarget').value = stock.target;
    document.getElementById('editLots').value = stock.lots || '';
    document.getElementById('editPosition').value = stock.position || '多仓';
    document.getElementById('editDirection').value = stock.dir || 'below';
    document.getElementById('editStatus').value = stock.status || 'enabled';

    const modal = new bootstrap.Modal(document.getElementById('editStockModal'));
    modal.show();
}

function saveEdit() {
    const index = parseInt(document.getElementById('editIndex').value);
    const name = document.getElementById('editName').value.trim();
    const target = parseFloat(document.getElementById('editTarget').value);
    const lots = parseInt(document.getElementById('editLots').value) || null;
    const position = document.getElementById('editPosition').value;
    const direction = document.getElementById('editDirection').value;
    const status = document.getElementById('editStatus').value;

    if (!target) {
        showToast('请填写目标价格', 'warning');
        return;
    }

    currentConfig.alerts[index].name = name || currentConfig.alerts[index].code;
    currentConfig.alerts[index].target = target;
    currentConfig.alerts[index].dir = direction;
    currentConfig.alerts[index].position = position;
    currentConfig.alerts[index].status = status;

    if (lots) {
        currentConfig.alerts[index].lots = lots;
    } else {
        delete currentConfig.alerts[index].lots;
    }

    // 清除该条的触发记录，使其可以重新触发
    const oldAlertKey = `${currentConfig.alerts[index].code}_${target}_${direction}`;
    triggeredAlerts.delete(oldAlertKey);

    sortAlerts();
    saveConfig(currentConfig);
    bootstrap.Modal.getInstance(document.getElementById('editStockModal')).hide();
}

function deleteStock() {
    const index = parseInt(document.getElementById('editIndex').value);
    const stock = currentConfig.alerts[index];

    if (confirm(`确定要删除 ${stock.name || stock.code} 吗？`)) {
        // 清除触发记录
        const alertKey = `${stock.code}_${stock.target}_${stock.dir || 'below'}`;
        triggeredAlerts.delete(alertKey);

        currentConfig.alerts.splice(index, 1);
        saveConfig(currentConfig);
        bootstrap.Modal.getInstance(document.getElementById('editStockModal')).hide();
    }
}

// ============================================================
// 节点管理
// ============================================================

async function loadNodes() {
    const result = await apiCall('/api/nodes');
    if (result.success) {
        renderNodeList(result.data.nodes);
        updateCurrentNodeDisplay(result.data.current);
    }
}

function renderNodeList(nodes) {
    const nodeList = document.getElementById('nodeList');
    nodeList.innerHTML = nodes.map(node => `
        <li>
            <a class="dropdown-item d-flex justify-content-between align-items-center ${node.is_current ? 'active' : ''} ${!node.is_available ? 'text-muted' : ''}"
               href="#" onclick="switchNode('${node.id}')">
                <span>
                    <i class="bi bi-geo-alt"></i> ${node.name}
                    <small class="text-muted">(${node.host})</small>
                </span>
                <span>
                    ${node.is_current ? '<i class="bi bi-check-circle-fill text-success"></i>' : ''}
                    ${!node.is_available ? '<i class="bi bi-x-circle-fill text-danger"></i>' : ''}
                </span>
            </a>
        </li>
    `).join('');
}

function updateCurrentNodeDisplay(node) {
    if (node && node.name) {
        document.getElementById('currentNodeName').textContent = node.name;
    }
}

async function switchNode(nodeId) {
    const result = await apiCall('/api/nodes/switch', 'POST', { node_id: nodeId });
    if (result.success) {
        showToast(`已切换到 ${result.node.name}`, 'success');
        loadNodes();
    } else {
        showToast('切换失败: ' + (result.error || '未知错误'), 'danger');
    }
}

// ============================================================
// 工具函数
// ============================================================

function formatPrice(price) {
    if (price === null || price === undefined || price === '--') return '--';
    return parseFloat(price).toFixed(2);
}

function formatChange(changePct) {
    if (changePct === null || changePct === undefined) return '--';
    const sign = changePct >= 0 ? '+' : '';
    return `${sign}${parseFloat(changePct).toFixed(2)}%`;
}

function getPriceClass(changePct) {
    if (changePct === null || changePct === undefined) return 'stock-flat';
    if (changePct > 0) return 'stock-up';
    if (changePct < 0) return 'stock-down';
    return 'stock-flat';
}

function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }

    const toastId = 'toast_' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHtml);

    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}
