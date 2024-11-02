// Constants
const QUOTE_CURRENCIES = ['USDT', 'BUSD', 'BTC'];
const WS_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';
let ws;


// Thêm constants cho cảnh báo
const ALERT_THRESHOLDS = {
    HIGH: 5,
    EXTREME: 10
};

const TIME_WINDOWS = {
    '1h': 3600000,
    '4h': 14400000,
    '8h': 28800000,
    '24h': 86400000
};

// Thêm state cho cảnh báo
let activeTimeFilter = '1h';
let alertsHistory = new Map(); // Lưu lịch sử cảnh báo
let priceHistory = new Map(); // Lưu lịch sử giá


// State Management
let cryptoData = new Map();
let searchTerm = '';
let currentSort = { column: 'p', direction: 'desc' };
let previousPrices = new Map();

// Utility Functions
function formatNumber(num, decimals = 2) {
    if (!num || isNaN(num)) return '0.00';
    return parseFloat(num).toFixed(decimals);
}

function formatPrice(price) {
    if (!price || isNaN(price)) return '0.00';
    const p = parseFloat(price);
    if (p < 0.1) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 10) return p.toFixed(3);
    return p.toFixed(2);
}

function formatLargeNumber(num) {
    if (!num || isNaN(num)) return '0.00';
    const n = parseFloat(num);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return formatNumber(n);
}

function getPriceChangeClass(change) {
    if (!change || isNaN(change)) return 'neutral';
    return parseFloat(change) > 0 ? 'up' : 'down';
}

// Alert
// Thêm function xử lý cảnh báo
function handlePriceAlert(symbol, currentPrice, timeWindow) {
    if (!priceHistory.has(symbol)) {
        priceHistory.set(symbol, []);
    }

    const history = priceHistory.get(symbol);
    const now = Date.now();

    // Thêm giá mới vào lịch sử
    history.push({ price: currentPrice, timestamp: now });

    // Xóa dữ liệu cũ
    const cutoff = now - TIME_WINDOWS[timeWindow];
    while (history.length > 0 && history[0].timestamp < cutoff) {
        history.shift();
    }

    // Tính % thay đổi
    if (history.length > 1) {
        const oldestPrice = history[0].price;
        const priceChange = ((currentPrice - oldestPrice) / oldestPrice) * 100;
        return {
            change: priceChange,
            level: Math.abs(priceChange) >= ALERT_THRESHOLDS.EXTREME ? 'extreme' : 
                  Math.abs(priceChange) >= ALERT_THRESHOLDS.HIGH ? 'high' : null
        };
    }

    return null;
}
// Function tạo alert item
function createAlertItem(symbol, change, timeWindow, level) {
    const [base, quote] = [symbol.slice(0, -4), symbol.slice(-4)];
    return `
        <div class="alert-item ${level}">
            <img src="https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/32/color/${base.toLowerCase()}.png" 
                 alt="${base}"
                 class="crypto-icon"
                 onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/32/color/generic.png'">
            <strong>${base}</strong>
            <span class="change-value ${change >= 0 ? 'up' : 'down'}">
                ${change >= 0 ? '+' : ''}${formatNumber(change)}%
            </span>
            <span class="time-label">${timeWindow}</span>
        </div>
    `;
}

// Function cập nhật alert list
function updateAlertList() {
    const alertList = document.getElementById('alertList');
    const alerts = [];

    cryptoData.forEach((data, symbol) => {
        const alert = handlePriceAlert(symbol, parseFloat(data.c), activeTimeFilter);
        if (alert && alert.level) {
            alerts.push({
                symbol,
                change: alert.change,
                level: alert.level
            });
        }
    });

    if (alerts.length === 0) {
        alertList.innerHTML = '<div class="no-alerts">Không có cảnh báo biến động</div>';
        return;
    }

    // Sắp xếp alerts theo mức độ biến động
    alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    alertList.innerHTML = alerts.map(alert => 
        createAlertItem(alert.symbol, alert.change, activeTimeFilter, alert.level)
    ).join('');
}

// Thêm event listener cho time filters
function initAlertFilters() {
    document.querySelectorAll('.time-filter').forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.time-filter').forEach(btn => 
                btn.classList.remove('active')
            );
            button.classList.add('active');
            
            // Update time window
            activeTimeFilter = button.dataset.time;
            updateAlertList();
        });
    });
}

// DOM Functions
function createCoinRow(data) {
    const row = document.createElement('tr');
    row.id = `coin-${data.s}`;
    
    const [base, quote] = [
        data.s.slice(0, -4),
        data.s.slice(-4)
    ];
    
    row.innerHTML = `
        <td>
            <div class="symbol-cell">
                <img src="https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/32/color/${base.toLowerCase()}.png" 
                     alt="${base}"
                     class="crypto-icon"
                     onerror="this.src='https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/32/color/generic.png'">
                <div class="symbol-text">
                    <span class="base-symbol">${base}</span>
                    <span class="quote-symbol">${quote}</span>
                </div>
            </div>
        </td>
        <td class="number-cell price-value">${formatPrice(data.c)}</td>
        <td class="number-cell change-value ${getPriceChangeClass(data.P)}">
            ${formatNumber(data.P)}%
        </td>
        <td class="number-cell high-value">${formatPrice(data.h)}</td>
        <td class="number-cell low-value">${formatPrice(data.l)}</td>
        <td class="number-cell volume-value">${formatLargeNumber(data.v)}</td>
    `;
    
    return row;
}

function updateCoinRow(data) {
    const row = document.getElementById(`coin-${data.s}`);
    if (!row) return;

    const currentPrice = parseFloat(data.c);
    const prevPrice = previousPrices.get(data.s);

    // Update price with animation
    if (prevPrice !== currentPrice) {
        const priceCell = row.querySelector('.price-value');
        priceCell.textContent = formatPrice(currentPrice);
        
        // Add price change animation
        row.classList.remove('price-up', 'price-down');
        row.classList.add(currentPrice > prevPrice ? 'price-up' : 'price-down');
        setTimeout(() => row.classList.remove('price-up', 'price-down'), 1000);
        
        previousPrices.set(data.s, currentPrice);
    }

    // Update other values
    const changeCell = row.querySelector('.change-value');
    changeCell.textContent = `${formatNumber(data.P)}%`;
    changeCell.className = `number-cell change-value ${getPriceChangeClass(data.P)}`;

    row.querySelector('.high-value').textContent = formatPrice(data.h);
    row.querySelector('.low-value').textContent = formatPrice(data.l);
    row.querySelector('.volume-value').textContent = formatLargeNumber(data.v);

    updateVolatilityStatus(row, parseFloat(data.P));
}

function updateVolatilityStatus(row, change) {
    const absChange = Math.abs(change);
    row.classList.remove('high-volatility', 'extreme-volatility', 'alert-row');
    
    if (absChange >= 10) {
        row.classList.add('extreme-volatility', 'alert-row');
    } else if (absChange >= 5) {
        row.classList.add('high-volatility', 'alert-row');
    }
}

// WebSocket Functions
function initWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket Connected');
        document.querySelector('.loading')?.remove();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (QUOTE_CURRENCIES.some(quote => item.s.endsWith(quote))) {
                        cryptoData.set(item.s, item);
                        if (!document.getElementById(`coin-${item.s}`)) {
                            const tbody = document.querySelector('.crypto-table tbody');
                            tbody.appendChild(createCoinRow(item));
                        } else {
                            updateCoinRow(item);
                        }
                    }
                });
    
                // Update alerts after price updates
                updateAlertList();
    
                if (searchTerm) {
                    filterBySearch(searchTerm);
                }
            }
        } catch (error) {
            console.error('Error processing WebSocket data:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        showError('Lỗi kết nối. Đang thử kết nối lại...');
    };

    ws.onclose = () => {
        console.log('WebSocket Disconnected. Reconnecting...');
        setTimeout(initWebSocket, 5000);
    };
}

// Search and Sort Functions
function filterBySearch(term) {
    document.querySelectorAll('.crypto-table tbody tr').forEach(row => {
        const symbol = row.querySelector('.base-symbol')?.textContent;
        if (symbol) {
            row.style.display = symbol.toLowerCase().includes(term.toLowerCase()) ? '' : 'none';
        }
    });
}

function handleSearch(event) {
    searchTerm = event.target.value;
    filterBySearch(searchTerm);
}

function handleSort(column) {
    const tbody = document.querySelector('.crypto-table tbody');
    const rows = Array.from(tbody.children);

    currentSort.direction = currentSort.column === column ? 
        (currentSort.direction === 'asc' ? 'desc' : 'asc') : 'desc';
    currentSort.column = column;

    rows.sort((a, b) => {
        let aVal, bVal;

        switch(column) {
            case 's':
                aVal = a.querySelector('.base-symbol').textContent;
                bVal = b.querySelector('.base-symbol').textContent;
                return currentSort.direction === 'asc' ? 
                    aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            default:
                aVal = parseFloat(a.querySelector(`.${column}-value`)?.textContent.replace(/[^0-9.-]+/g, '') || 0);
                bVal = parseFloat(b.querySelector(`.${column}-value`)?.textContent.replace(/[^0-9.-]+/g, '') || 0);
                if (isNaN(aVal)) aVal = 0;
                if (isNaN(bVal)) bVal = 0;
                return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });

    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// Error Handling
function showError(message) {
    const tbody = document.querySelector('.crypto-table tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="error">
                ${message}
                <button onclick="location.reload()" class="retry-button">Thử lại</button>
            </td>
        </tr>
    `;
}

// Initialize App
function initApp() {
    // Existing listeners
    document.querySelector('.search-box')?.addEventListener('input', handleSearch);
    
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Initialize alert filters
    initAlertFilters();

    // Start WebSocket connection
    initWebSocket();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (ws) {
            ws.close();
        }
    });
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
