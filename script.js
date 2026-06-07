// CryptoLux — 加密行情主程式（完整版）
// 支持 ARK 與主流幣，Dexscreener API + Binance API

let allTickers = [];
let arkData = null;
let currentSymbol = 'BTCUSDT';
let currentInterval = '1d';
let klineData = [];
let alerts = JSON.parse(localStorage.getItem('cryptoAlerts') || '[]');
let refreshTimer = null;
let alertCheckTimer = null;

// 主流幣列表
const MAIN_COINS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
    'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT'
];

// BSC 生態流動性 Top 10
const BSC_COINS = [
    'BNBUSDT', 'CAKEUSDT', 'XVSUSDT', 'BAKEUSDT', 'BURGERUSDT',
    'ALPACAUSDT', 'BELTUSDT', 'DODOUSDT', 'SPSUSDT', 'TWTUSDT'
];

// ETH 生態流動性 Top 10
const ETH_COINS = [
    'ETHUSDT', 'UNIUSDT', 'AAVEUSDT', 'LINKUSDT', 'MKRUSDT',
    'COMPUSDT', 'SUSHIUSDT', 'SNXUSDT', 'CRVUSDT', 'DYDXUSDT'
];

// ARK 配置
const ARK_CONFIG = {
    symbol: 'ARK',
    name: 'ARK',
    contract: '0xCae117ca6Bc8A341D2E7207F30E180f0e5618B9D',
    dexscreenerApi: 'https://api.dexscreener.com/latest/dex/pairs/bsc/0xcaaf3c41a40103a23eeaa4bba468af3cf5b0e0d8',
    dexscreenerPage: 'https://dexscreener.com/bsc/0xcaaf3c41a40103a23eeaa4bba468af3cf5b0e0d8'
};

// 幣種圖標
const COIN_ICONS = {
    'BTC': '₿', 'ETH': 'Ξ', 'BNB': '◆', 'SOL': '◎',
    'XRP': '✕', 'DOGE': 'Ð', 'ADA': '₳', 'AVAX': '▲',
    'DOT': '●', 'MATIC': '⬡', 'LINK': '⬡', 'UNI': '🦄',
    'LTC': 'Ł', 'ATOM': '⚛', 'NEAR': 'Ⓝ', 'CAKE': '🥞',
    'XVS': '◈', 'BAKE': '🍞', 'BURGER': '🍔', 'ALPACA': '🦙',
    'BELT': '⚡', 'DODO': '🐦', 'SPS': '🎴', 'TWT': '🔐',
    'AAVE': '👻', 'MKR': '◈', 'COMP': '◈', 'SUSHI': '🍣',
    'SNX': '◈', 'CRV': '◈', 'DYDX': '◈', 'ARK': '◈'
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSearch();
    initModals();
    initKlinePage();
    loadAlerts();
    fetchAllData();
    fetchArkData();
    startAutoRefresh();
    startAlertChecker();
});

// ===== Tab 切換 =====
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`page-${target}`).classList.add('active');
            
            if (target === 'bsc') renderTable('bscTableBody', BSC_COINS);
            if (target === 'eth') renderTable('ethTableBody', ETH_COINS);
        });
    });
}

// ===== 搜索 =====
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toUpperCase().trim();
        if (!q) {
            renderMainTable(MAIN_COINS);
            return;
        }
        const filtered = allTickers
            .filter(t => t.symbol.includes(q) || t.symbol.replace('USDT','').includes(q))
            .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 20)
            .map(t => t.symbol);
        renderMainTable(filtered);
    });
}

// ===== 彈窗管理 =====
function initModals() {
    const alertModal = document.getElementById('alertModal');
    const addAlertBtn = document.getElementById('addAlertBtn');
    const closeAlertModal = document.getElementById('closeAlertModal');
    const cancelAlert = document.getElementById('cancelAlert');
    const saveAlert = document.getElementById('saveAlert');
    const klineAlertBtn = document.getElementById('klineAlertBtn');

    addAlertBtn.addEventListener('click', () => alertModal.classList.add('show'));
    klineAlertBtn.addEventListener('click', () => {
        document.getElementById('alertSymbol').value = currentSymbol;
        alertModal.classList.add('show');
    });
    closeAlertModal.addEventListener('click', () => alertModal.classList.remove('show'));
    cancelAlert.addEventListener('click', () => alertModal.classList.remove('show'));
    
    alertModal.addEventListener('click', (e) => {
        if (e.target === alertModal) alertModal.classList.remove('show');
    });

    saveAlert.addEventListener('click', () => {
        const symbol = document.getElementById('alertSymbol').value;
        const condition = document.getElementById('alertCondition').value;
        const price = parseFloat(document.getElementById('alertPrice').value);
        
        if (!price || isNaN(price)) {
            showNotification('錯誤', '請輸入有效的價格');
            return;
        }
        
        alerts.push({
            id: Date.now(),
            symbol,
            condition,
            price,
            triggered: false
        });
        localStorage.setItem('cryptoAlerts', JSON.stringify(alerts));
        loadAlerts();
        alertModal.classList.remove('show');
        document.getElementById('alertPrice').value = '';
        showNotification('成功', `已設定 ${symbol.replace('USDT','')} ${condition === 'above' ? '高於' : '低於'} $${price}`);
    });

    document.getElementById('alertBtn').addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="alerts"]').classList.add('active');
        document.getElementById('page-alerts').classList.add('active');
    });
}

// ===== K 線圖頁面 =====
function initKlinePage() {
    document.getElementById('backBtn').addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="overview"]').classList.add('active');
        document.getElementById('page-overview').classList.add('active');
    });

    document.querySelectorAll('.interval').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.interval').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentInterval = btn.dataset.interval;
            fetchKlineData();
        });
    });
}

// ===== API 請求 =====
async function fetchAllData() {
    try {
        const resp = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await resp.json();
        allTickers = data.filter(t => t.symbol.endsWith('USDT'));
        
        renderStatsCards();
        renderMainTable(MAIN_COINS);
        updateAlertBadge();
        
        const now = new Date();
        document.getElementById('updateTime').textContent = `更新於 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

async function fetchArkData() {
    try {
        const resp = await fetch(ARK_CONFIG.dexscreenerApi);
        const data = await resp.json();
        if (data.pair) {
            arkData = data.pair;
            renderArkStatsCard();
        }
    } catch (err) {
        console.error('ARK fetch error:', err);
    }
}

async function fetchKlineData() {
    try {
        const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${currentInterval}&limit=100`);
        klineData = await resp.json();
        drawKlineChart();
    } catch (err) {
        console.error('Kline fetch error:', err);
    }
}

// ===== 渲染統計卡片 =====
function renderStatsCards() {
    const coins = ['BTC', 'ETH', 'BNB', 'SOL'];
    coins.forEach(coin => {
        const ticker = allTickers.find(t => t.symbol === `${coin}USDT`);
        if (!ticker) return;
        
        const price = parseFloat(ticker.lastPrice);
        const change = parseFloat(ticker.priceChangePercent);
        const isUp = change >= 0;
        
        document.getElementById(`${coin.toLowerCase()}Price`).textContent = formatPrice(price);
        const changeEl = document.getElementById(`${coin.toLowerCase()}Change`);
        changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `stat-change ${isUp ? 'up' : 'down'}`;
    });
}

// ===== ARK 統計卡片 =====
function renderArkStatsCard() {
    if (!arkData) return;
    
    const price = parseFloat(arkData.priceUsd || 0);
    const change = parseFloat(arkData.priceChange24hPct || 0);
    const isUp = change >= 0;
    
    document.getElementById('arkPrice').textContent = '$' + formatPrice(price);
    const changeEl = document.getElementById('arkChange');
    changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)}%`;
    changeEl.className = `stat-change ${isUp ? 'up' : 'down'}`;
}

// ===== 渲染表格 =====
function renderMainTable(symbols) {
    const tbody = document.getElementById('mainTableBody');
    tbody.innerHTML = '';
    
    symbols.forEach(symbol => {
        const ticker = allTickers.find(t => t.symbol === symbol);
        if (!ticker) return;
        tbody.innerHTML += createTableRow(ticker, false);
    });
    
    // 加入 ARK 到主流幣表格底部
    if (arkData) {
        const arkRow = createArkTableRow();
        tbody.innerHTML += arkRow;
    }
    
    if (!tbody.innerHTML) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">無數據</td></tr>';
    }
}

function renderTable(tbodyId, symbols) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    
    symbols.forEach((symbol, index) => {
        const ticker = allTickers.find(t => t.symbol === symbol);
        if (!ticker) return;
        tbody.innerHTML += createTableRow(ticker, true, index + 1);
    });
    
    if (!tbody.innerHTML) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">無數據</td></tr>';
    }
}

function createTableRow(ticker, showRank, rank = 0) {
    const coin = ticker.symbol.replace('USDT', '');
    const icon = COIN_ICONS[coin] || '◈';
    const price = parseFloat(ticker.lastPrice);
    const change = parseFloat(ticker.priceChangePercent);
    const volume = parseFloat(ticker.quoteVolume);
    const high = parseFloat(ticker.highPrice);
    const low = parseFloat(ticker.lowPrice);
    const isUp = change >= 0;
    
    let rankCell = showRank ? `<td style="color:var(--gold);font-weight:700">${rank}</td>` : '';
    let extraCells = showRank ? '' : `
        <td class="volume-cell">${formatVolume(high)}</td>
        <td class="volume-cell">${formatVolume(low)}</td>
    `;
    
    return `
        <tr>
            ${rankCell}
            <td>
                <div class="coin-cell">
                    <div class="coin-icon">${icon}</div>
                    <div>
                        <div class="coin-name">${coin}</div>
                        <div class="coin-symbol">${ticker.symbol}</div>
                    </div>
                </div>
            </td>
            <td class="price-cell">${formatPrice(price)}</td>
            <td class="change-cell ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${change.toFixed(2)}%</td>
            <td class="volume-cell">$${formatVolume(volume)}</td>
            ${extraCells}
            <td>
                <button class="btn-kline" onclick="openKline('${ticker.symbol}')">K線</button>
                <button class="btn-alert-small" onclick="quickAlert('${ticker.symbol}')">🔔</button>
            </td>
        </tr>
    `;
}

function createArkTableRow() {
    if (!arkData) return '';
    
    const price = parseFloat(arkData.priceUsd || 0);
    const change = parseFloat(arkData.priceChange24hPct || 0);
    const volume = parseFloat(arkData.volume24h || 0);
    const isUp = change >= 0;
    
    return `
        <tr class="ark-row">
            <td>
                <div class="coin-cell">
                    <div class="coin-icon ark-icon">◈</div>
                    <div>
                        <div class="coin-name">ARK</div>
                        <div class="coin-symbol">BSC/Dexscreener</div>
                    </div>
                </div>
            </td>
            <td class="price-cell" style="color:#d4af37;font-weight:700">$${formatPrice(price)}</td>
            <td class="change-cell ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${change.toFixed(2)}%</td>
            <td class="volume-cell">$${formatVolume(volume)}</td>
            <td colspan="2" class="volume-cell" style="color:#8a8a9a">Dexscreener</td>
            <td>
                <button class="btn-kline" onclick="openArkKline()">K線</button>
                <button class="btn-alert-small" onclick="quickAlert('ARK')">🔔</button>
            </td>
        </tr>
    `;
}

// ===== K 線圖 =====
function openKline(symbol) {
    currentSymbol = symbol;
    const coin = symbol.replace('USDT', '');
    const icon = COIN_ICONS[coin] || '◈';
    
    document.getElementById('klineIcon').textContent = icon;
    document.getElementById('klineName').textContent = `${coin}/USDT`;
    
    const ticker = allTickers.find(t => t.symbol === symbol);
    if (ticker) {
        const price = parseFloat(ticker.lastPrice);
        const change = parseFloat(ticker.priceChangePercent);
        const isUp = change >= 0;
        
        document.getElementById('klinePrice').textContent = `$${formatPrice(price)}`;
        const changeEl = document.getElementById('klineChange');
        changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `kline-change ${isUp ? 'up' : 'down'}`;
        
        document.getElementById('kHigh').textContent = `$${formatPrice(parseFloat(ticker.highPrice))}`;
        document.getElementById('kLow').textContent = `$${formatPrice(parseFloat(ticker.lowPrice))}`;
        document.getElementById('kVolume').textContent = formatVolume(parseFloat(ticker.volume));
        document.getElementById('kQuoteVol').textContent = `$${formatVolume(parseFloat(ticker.quoteVolume))}`;
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-kline').classList.add('active');
    
    fetchKlineData();
}

function openArkKline() {
    // ARK K 線透過 Dexscreener API 獲取
    // 這裡顯示基礎資訊
    if (!arkData) return;
    
    currentSymbol = 'ARKUSDT';
    document.getElementById('klineIcon').textContent = '◈';
    document.getElementById('klineName').textContent = 'ARK/USDT';
    
    const price = parseFloat(arkData.priceUsd);
    const change = parseFloat(arkData.priceChange24hPct);
    const isUp = change >= 0;
    
    document.getElementById('klinePrice').textContent = `$${formatPrice(price)}`;
    const changeEl = document.getElementById('klineChange');
    changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)}%`;
    changeEl.className = `kline-change ${isUp ? 'up' : 'down'}`;
    
    // 顯示底池資訊
    const liquidity = parseFloat(arkData.liquidity?.usd || 0);
    document.getElementById('kHigh').textContent = '底池參考';
    document.getElementById('kLow').textContent = '$' + formatPrice(liquidity);
    document.getElementById('kVolume').textContent = formatVolume(parseFloat(arkData.volume24h || 0));
    document.getElementById('kQuoteVol').textContent = 'Dexscreener';
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-kline').classList.add('active');
    
    // ARK 沒有 K 線數據，清除畫布
    const canvas = document.getElementById('klineCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8a8a9a';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ARK 價格資訊來自 Dexscreener，無法顯示 K 線圖', canvas.width / 2, canvas.height / 2);
}

function drawKlineChart() {
    const canvas = document.getElementById('klineCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = canvas.parentElement.clientWidth * dpr;
    canvas.height = canvas.parentElement.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    
    ctx.clearRect(0, 0, w, h);
    
    if (klineData.length === 0) return;
    
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    let minPrice = Infinity, maxPrice = -Infinity;
    klineData.forEach(k => {
        const low = parseFloat(k[3]);
        const high = parseFloat(k[2]);
        if (low < minPrice) minPrice = low;
        if (high > maxPrice) maxPrice = high;
    });
    
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.05;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    
    const candleW = Math.max(1, (chartW / klineData.length) - 2);
    const gap = 2;
    
    ctx.strokeStyle = 'rgba(42, 42, 58, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        
        const price = maxPrice - ((maxPrice - minPrice) / 5) * i;
        ctx.fillStyle = '#8a8a9a';
        ctx.font = '11px SF Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(formatPrice(price), w - padding.right + 5, y + 4);
    }
    
    klineData.forEach((k, i) => {
        const open = parseFloat(k[1]);
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const close = parseFloat(k[4]);
        const isUp = close >= open;
        
        const x = padding.left + i * (candleW + gap);
        const color = isUp ? '#00c853' : '#ff1744';
        
        const yOpen = padding.top + ((maxPrice - open) / (maxPrice - minPrice)) * chartH;
        const yClose = padding.top + ((maxPrice - close) / (maxPrice - minPrice)) * chartH;
        const yHigh = padding.top + ((maxPrice - high) / (maxPrice - minPrice)) * chartH;
        const yLow = padding.top + ((maxPrice - low) / (maxPrice - minPrice)) * chartH;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + candleW / 2, yHigh);
        ctx.lineTo(x + candleW / 2, yLow);
        ctx.stroke();
        
        ctx.fillStyle = color;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        ctx.fillRect(x, bodyTop, candleW, bodyH);
    });
}

// ===== 價格提醒 =====
function loadAlerts() {
    const list = document.getElementById('alertsList');
    updateAlertBadge();
    
    if (alerts.length === 0) {
        list.innerHTML = '<div class="empty-state">還沒有設定提醒，點擊上方按鈕新增</div>';
        return;
    }
    
    list.innerHTML = alerts.map(a => {
        const coin = a.symbol.replace('USDT', '');
        return `
            <div class="alert-item">
                <div class="alert-info">
                    <span class="alert-symbol">${coin}/USDT</span>
                    <span class="alert-condition">${a.condition === 'above' ? '高於' : '低於'}</span>
                    <span class="alert-target">$${formatPrice(a.price)}</span>
                    ${a.triggered ? '<span style="color:var(--green);font-size:12px">✓ 已觸發</span>' : ''}
                </div>
                <button class="btn-delete-alert" onclick="deleteAlert(${a.id})">刪除</button>
            </div>
        `;
    }).join('');
}

function deleteAlert(id) {
    alerts = alerts.filter(a => a.id !== id);
    localStorage.setItem('cryptoAlerts', JSON.stringify(alerts));
    loadAlerts();
}

function quickAlert(symbol) {
    const symbolSelect = document.getElementById('alertSymbol');
    const ticker = allTickers.find(t => t.symbol === symbol);
    
    // 如果是 ARK，要加到下拉選單
    if (symbol === 'ARK' && !Array.from(symbolSelect.options).some(opt => opt.value === 'ARKUSDT')) {
        const option = document.createElement('option');
        option.value = 'ARKUSDT';
        option.textContent = 'ARK/USDT';
        symbolSelect.appendChild(option);
    }
    
    symbolSelect.value = symbol === 'ARK' ? 'ARKUSDT' : symbol;
    if (ticker) {
        document.getElementById('alertPrice').value = parseFloat(ticker.lastPrice).toFixed(2);
    } else if (arkData && symbol === 'ARK') {
        document.getElementById('alertPrice').value = parseFloat(arkData.priceUsd).toFixed(2);
    }
    document.getElementById('alertModal').classList.add('show');
}

function updateAlertBadge() {
    const active = alerts.filter(a => !a.triggered).length;
    document.getElementById('alertBadge').textContent = active;
}

function startAlertChecker() {
    alertCheckTimer = setInterval(() => {
        alerts.forEach(alert => {
            if (alert.triggered) return;
            
            let price = 0;
            if (alert.symbol === 'ARKUSDT' && arkData) {
                price = parseFloat(arkData.priceUsd);
            } else {
                const ticker = allTickers.find(t => t.symbol === alert.symbol);
                if (!ticker) return;
                price = parseFloat(ticker.lastPrice);
            }
            
            const coin = alert.symbol.replace('USDT', '');
            
            if (alert.condition === 'above' && price >= alert.price) {
                alert.triggered = true;
                showNotification(`🔔 ${coin} 價格提醒`, `${coin} 已漲至 $${formatPrice(price)}，超過目標 $${formatPrice(alert.price)}`);
                playAlertSound();
            } else if (alert.condition === 'below' && price <= alert.price) {
                alert.triggered = true;
                showNotification(`🔔 ${coin} 價格提醒`, `${coin} 已跌至 $${formatPrice(price)}，低於目標 $${formatPrice(alert.price)}`);
                playAlertSound();
            }
        });
        
        localStorage.setItem('cryptoAlerts', JSON.stringify(alerts));
        updateAlertBadge();
    }, 10000);
}

function playAlertSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
        
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            osc2.connect(gain);
            osc2.frequency.value = 1000;
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.3);
        }, 350);
    } catch(e) {}
}

// ===== 通知 =====
function showNotification(title, body) {
    const container = document.getElementById('notificationContainer');
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.innerHTML = `
        <div class="notif-title">${title}</div>
        <div class="notif-body">${body}</div>
    `;
    container.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(100%)';
        notif.style.transition = 'all 0.3s';
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

// ===== 自動刷新 =====
function startAutoRefresh() {
    refreshTimer = setInterval(() => {
        fetchAllData();
        fetchArkData();
    }, 15000);
}

// ===== 工具函數 =====
function formatPrice(price) {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
}

function formatVolume(vol) {
    if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
    return vol.toFixed(2);
}

// 窗口大小改變時重繪 K 線
window.addEventListener('resize', () => {
    if (document.getElementById('page-kline').classList.contains('active')) {
        drawKlineChart();
    }
});
