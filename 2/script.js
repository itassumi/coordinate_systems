const WS_URL = 'ws://localhost:4000/';
const API_URL = 'http://localhost:4000/config';

let socket = null;
let targets = [];
let isConnected = false;
let mockInterval = null;
let currentAngle = 0;

// Елементи DOM
const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const updateConfigBtn = document.getElementById('updateConfigBtn');
const targetCountEl = document.getElementById('targetCount');
const lastAngleEl = document.getElementById('lastAngle');
const lastTimeEl = document.getElementById('lastTime');

// Ініціалізація графіка
const radarPlot = document.getElementById('radarPlot');
const layout = {
    title: {
        text: '📡 Радарна діаграма цілей',
        font: { color: '#e0e0e0', size: 20 }
    },
    polar: {
        radialaxis: {
            title: { text: 'Відстань (км)', font: { color: '#e0e0e0' } },
            range: [0, 200],
            tickangle: 0,
            gridcolor: '#555',
            linecolor: '#777',
            tickfont: { color: '#e0e0e0' }
        },
        angularaxis: {
            direction: 'clockwise',
            rotation: 90,
            gridcolor: '#555',
            linecolor: '#777',
            tickfont: { color: '#e0e0e0' }
        },
        bgcolor: 'rgba(10,20,30,0.9)'
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#e0e0e0', family: 'Arial' },
    showlegend: true,
    legend: {
        x: 1.1,
        y: 1,
        font: { color: '#e0e0e0' },
        bgcolor: 'rgba(30,45,60,0.8)'
    },
    height: 600,
    margin: { t: 50, r: 150, b: 50, l: 50 }
};

const config = {
    displayModeBar: true,
    displaylogo: false,
    responsive: true
};

// Ініціалізуємо графік з порожніми даними
Plotly.newPlot(radarPlot, [], layout, config);

// Функція підключення до WebSocket
function connectWebSocket() {
    if (socket) {
        socket.close();
    }

    updateStatus('⏳ Підключення до радару...', 'warning');

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        isConnected = true;
        updateStatus('✅ Підключено до радару', 'success');
        console.log('WebSocket підключено');
        
        // Зупинити тестові дані якщо WebSocket працює
        if (mockInterval) {
            clearInterval(mockInterval);
            mockInterval = null;
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📡 Отримані дані з радару:', data);
            processRadarData(data);
        } catch (error) {
            console.error('Помилка парсингу даних:', error);
        }
    };

    socket.onclose = () => {
        isConnected = false;
        updateStatus('❌ З\'єднання з радаром втрачено', 'error');
        console.log('WebSocket з\'єднання закрито');
        
        // Якщо WebSocket не працює, запустити тестові дані
        setTimeout(() => {
            if (!isConnected && !mockInterval) {
                startMockData();
            }
        }, 2000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket помилка:', error);
        updateStatus('❌ Помилка підключення', 'error');
        
        // Запустити тестові дані якщо WebSocket не працює
        setTimeout(() => {
            if (!isConnected && !mockInterval) {
                startMockData();
            }
        }, 1000);
    };
}

// Генерація тестових даних
function startMockData() {
    updateStatus('🔄 Використовуються тестові дані', 'warning');
    
    if (mockInterval) {
        clearInterval(mockInterval);
    }
    
    // Генерувати тестові дані кожні 300 мс
    mockInterval = setInterval(() => {
        generateMockRadarData();
    }, 300);
    
    // Перша генерація відразу
    generateMockRadarData();
}

function generateMockRadarData() {
    // Генеруємо кут, що плавно змінюється
    currentAngle = (currentAngle + 5) % 360;
    
    // Створюємо фіктивні дані радару
    const mockData = {
        scanAngle: currentAngle,
        pulseDuration: 1,
        echoResponses: []
    };
    
    // Генеруємо 2-5 випадкових цілей
    const numTargets = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < numTargets; i++) {
        const time = 0.00005 + Math.random() * 0.00025; // Час 50-300 мкс
        const power = Math.random(); // Потужність 0-1
        
        mockData.echoResponses.push({
            time: time,
            power: power
        });
    }
    
    console.log('🎲 Тестові дані:', mockData);
    processRadarData(mockData);
}

// Обробка даних радару
function processRadarData(data) {
    const angle = data.scanAngle;
    lastAngleEl.textContent = angle.toFixed(1);
    
    if (data.echoResponses.length > 0) {
        lastTimeEl.textContent = data.echoResponses[0].time.toFixed(6);
    }

    // Очистити старі дані кожні 360 градусів
    if (angle < 5 && targets.length > 50) {
        targets = targets.slice(-20); // Залишити тільки останні 20
    }

    data.echoResponses.forEach(echo => {
        // Конвертуємо час у відстань (км): R = c * t / 2
        const distance = (300000 * echo.time) / 2 / 1000; // в км
        const power = echo.power;

        targets.push({
            angle: angle,
            distance: distance,
            power: power,
            color: getPowerColor(power)
        });
    });

    // Обмежити кількість точок для продуктивності
    if (targets.length > 100) {
        targets = targets.slice(-80);
    }

    targetCountEl.textContent = targets.length;
    updatePlot();
}

// Оновлення графіка
function updatePlot() {
    if (targets.length === 0) return;

    // Розділимо точки за кольорами для легенди
    const highPowerTargets = targets.filter(t => t.power > 0.7);
    const mediumPowerTargets = targets.filter(t => t.power > 0.3 && t.power <= 0.7);
    const lowPowerTargets = targets.filter(t => t.power <= 0.3);

    const traces = [];

    // Високі потужності (червоні)
    if (highPowerTargets.length > 0) {
        traces.push({
            r: highPowerTargets.map(t => t.distance),
            theta: highPowerTargets.map(t => t.angle),
            mode: 'markers',
            type: 'scatterpolar',
            name: 'Висока потужність (> 0.7)',
            marker: {
                size: 16,
                color: '#ff3333',
                opacity: 0.9,
                line: {
                    color: '#ffffff',
                    width: 1
                },
                symbol: 'circle'
            }
        });
    }

    // Середні потужності (жовті)
    if (mediumPowerTargets.length > 0) {
        traces.push({
            r: mediumPowerTargets.map(t => t.distance),
            theta: mediumPowerTargets.map(t => t.angle),
            mode: 'markers',
            type: 'scatterpolar',
            name: 'Середня потужність (0.3-0.7)',
            marker: {
                size: 12,
                color: '#ffaa00',
                opacity: 0.9,
                line: {
                    color: '#ffffff',
                    width: 1
                },
                symbol: 'circle'
            }
        });
    }

    // Низькі потужності (зелені)
    if (lowPowerTargets.length > 0) {
        traces.push({
            r: lowPowerTargets.map(t => t.distance),
            theta: lowPowerTargets.map(t => t.angle),
            mode: 'markers',
            type: 'scatterpolar',
            name: 'Низька потужність (< 0.3)',
            marker: {
                size: 8,
                color: '#33ff33',
                opacity: 0.9,
                line: {
                    color: '#ffffff',
                    width: 1
                },
                symbol: 'circle'
            }
        });
    }

    Plotly.react(radarPlot, traces, layout, config);
}

// Оновлення параметрів радару через API
async function updateRadarConfig() {
    const configData = {
        measurementsPerRotation: parseInt(document.getElementById('measurementsPerRotation').value) || 360,
        rotationSpeed: parseInt(document.getElementById('rotationSpeed').value) || 60,
        targetSpeed: parseInt(document.getElementById('targetSpeed').value) || 100,
        numberOfTargets: 5,
        emulationZoneSize: 200
    };

    updateStatus('⏳ Оновлення параметрів...', 'warning');

    try {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });

        if (response.ok) {
            updateStatus('✅ Параметри оновлено успішно', 'success');
            console.log('⚙️ Параметри оновлено:', configData);
            
            // Очистити графік при зміні параметрів
            targets = [];
            updatePlot();
        } else {
            updateStatus('⚠️ API не відповідає (використовуються тестові дані)', 'warning');
            console.warn('API не відповідає, продовжую з тестовими даними');
        }
    } catch (error) {
        console.error('Помилка API:', error);
        updateStatus('🔧 API недоступне (тестові дані)', 'warning');
    }
}

// Допоміжні функції
function getPowerColor(power) {
    if (power > 0.7) return '#ff3333'; // Висока
    if (power > 0.3) return '#ffaa00'; // Середня
    return '#33ff33'; // Низька
}

function updateStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = '';
    
    const styles = {
        success: 'color: #33ff33; background: rgba(51, 255, 51, 0.2); padding: 10px; border-radius: 5px;',
        warning: 'color: #ffaa00; background: rgba(255, 170, 0, 0.2); padding: 10px; border-radius: 5px;',
        error: 'color: #ff3333; background: rgba(255, 51, 51, 0.2); padding: 10px; border-radius: 5px;'
    };

    statusEl.style.cssText = styles[type] || '';
}

// Обробники подій
connectBtn.addEventListener('click', () => {
    if (mockInterval) {
        clearInterval(mockInterval);
        mockInterval = null;
    }
    connectWebSocket();
});

updateConfigBtn.addEventListener('click', updateRadarConfig);

// Запуск при завантаженні
document.addEventListener('DOMContentLoaded', () => {
    // Спроба підключитися до реального WebSocket
    connectWebSocket();
    
    // Якщо через 3 секунди не підключилось, запустити тестові дані
    setTimeout(() => {
        if (!isConnected && !mockInterval) {
            startMockData();
        }
    }, 3000);
    
   
    setTimeout(() => {
        if (targets.length === 0) {
           
            startMockData();
        }
    }, 5000);
});