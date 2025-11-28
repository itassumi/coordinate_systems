/// Элементы DOM
const dataDiv = document.getElementById('data');
const canvas = document.getElementById('myChart');
const ctx = canvas.getContext('2d');

// Массивы для хранения данных
let satellites = []; // Массив спутников {id, x, y}
let analyticalObjectPosition = { x: null, y: null }; // Позиция аналитическим методом
let numericalObjectPosition = { x: null, y: null }; // Позиция численным методом

// Подключение к WebSocket
const socket = new WebSocket('ws://localhost:4001');

socket.onopen = function(event) {
    console.log('WebSocket подключен');
    dataDiv.innerHTML += '<p>Підключено до емулятора GPS</p>';
};

socket.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('Получены данные:', message);

    // Обрабатываем данные спутника
    updateSatelliteData(message);

    // Вычисляем позицию объекта
    calculateObjectPosition();

    // Отрисовываем сцену
    drawScene();

    // Выводим сырые данные
    dataDiv.innerHTML = `<p>Останнє оновлення: ${new Date().toLocaleTimeString()}</p>`;
    dataDiv.innerHTML += `<pre>${JSON.stringify(message, null, 2)}</pre>`;
};

socket.onerror = function(error) {
    console.error('WebSocket ошибка:', error);
    dataDiv.innerHTML += '<p style="color: red;">Помилка підключення WebSocket</p>';
};

function updateSatelliteData(satelliteMsg) {
    // Ищем, есть ли уже спутник с таким id
    const index = satellites.findIndex(s => s.id === satelliteMsg.id);
    
    if (index !== -1) {
        // Обновляем существующий спутник
        satellites[index] = satelliteMsg;
    } else {
        // Добавляем новый спутник
        satellites.push(satelliteMsg);
    }
    
    // Ограничиваем количество спутников (например, 10 последних)
    if (satellites.length > 10) {
        satellites = satellites.slice(-10);
    }
}

function calculateAnalyticalPosition() {
    // Нам нужно минимум 3 спутника для расчета
    if (satellites.length < 3) {
        console.warn('Недостаточно спутников для аналитического расчета');
        return null;
    }
    
    // Берем последние 3 спутника
    const s1 = satellites[satellites.length - 1];
    const s2 = satellites[satellites.length - 2];
    const s3 = satellites[satellites.length - 3];
    
    // Вычисляем расстояния на основе времени прохождения сигнала
    // Скорость света ≈ 300 000 км/с, время в секундах
    const c = 300000; // км/с
    const dt1 = (s1.receivedAt - s1.sentAt) / 1000; // секунды
    const dt2 = (s2.receivedAt - s2.sentAt) / 1000;
    const dt3 = (s3.receivedAt - s3.sentAt) / 1000;
    
    const r1 = dt1 * c; // расстояние до спутника 1
    const r2 = dt2 * c; // расстояние до спутника 2
    const r3 = dt3 * c; // расстояние до спутника 3
    
    // Упрощенный аналитический метод для 2D
    // Основан на решении системы уравнений окружностей
    const A = 2 * (s2.x - s1.x);
    const B = 2 * (s2.y - s1.y);
    const C = r1 * r1 - r2 * r2 - s1.x * s1.x + s2.x * s2.x - s1.y * s1.y + s2.y * s2.y;
    
    const D = 2 * (s3.x - s2.x);
    const E = 2 * (s3.y - s2.y);
    const F = r2 * r2 - r3 * r3 - s2.x * s2.x + s3.x * s3.x - s2.y * s2.y + s3.y * s3.y;
    
    const determinant = A * E - B * D;
    
    if (Math.abs(determinant) < 1e-10) {
        console.warn('Спутники выровнены, невозможно вычислить позицию');
        return null;
    }
    
    const x = (C * E - B * F) / determinant;
    const y = (A * F - C * D) / determinant;
    
    return { x, y };
}

function calculateNumericalPosition() {
    if (satellites.length < 3) {
        console.warn('Недостаточно спутников для численного расчета');
        return null;
    }
    
    // Вычисляем расстояния
    const distances = satellites.map(sat => {
        const dt = (sat.receivedAt - sat.sentAt) / 1000;
        return dt * 300000; // км
    });
    
    // Функция потерь: сумма квадратов разностей между измеренными 
    // и расчетными расстояниями
    const lossFunction = (params) => {
        const [x, y] = params;
        let error = 0;
        
        for (let i = 0; i < satellites.length; i++) {
            const sat = satellites[i];
            const calculatedDist = Math.sqrt(
                Math.pow(x - sat.x, 2) + Math.pow(y - sat.y, 2)
            );
            error += Math.pow(calculatedDist - distances[i], 2);
        }
        
        return error;
    };
    
    // Начальное приближение - среднее положение спутников
    const initialX = satellites.reduce((sum, sat) => sum + sat.x, 0) / satellites.length;
    const initialY = satellites.reduce((sum, sat) => sum + sat.y, 0) / satellites.length;
    
    // Используем numeric.js для минимизации
    try {
        const result = numeric.uncmin(lossFunction, [initialX, initialY]);
        return { x: result.solution[0], y: result.solution[1] };
    } catch (error) {
        console.error('Ошибка численного метода:', error);
        return null;
    }
}

function calculateObjectPosition() {
    analyticalObjectPosition = calculateAnalyticalPosition();
    numericalObjectPosition = calculateNumericalPosition();
}

function drawScene() {
    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Масштабирование для отображения (зона 200x200 км)
    const scale = 3; // 1 км = 3 пикселя
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Рисуем сетку (опционально)
    drawGrid(scale, centerX, centerY);
    
    // Рисуем спутники
    satellites.forEach(sat => {
        const x = centerX + sat.x * scale;
        const y = centerY - sat.y * scale; // Инвертируем Y для привычной системы координат
        
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Подписываем спутники
        ctx.fillStyle = 'black';
        ctx.fillText(sat.id.substring(0, 8), x + 8, y - 8);
    });
    
    // Рисуем аналитическую позицию
    if (analyticalObjectPosition && analyticalObjectPosition.x !== null) {
        const x = centerX + analyticalObjectPosition.x * scale;
        const y = centerY - analyticalObjectPosition.y * scale;
        
        ctx.fillStyle = 'green';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText('Аналітич.', x + 10, y - 10);
    }
    
    // Рисуем численную позицию
    if (numericalObjectPosition && numericalObjectPosition.x !== null) {
        const x = centerX + numericalObjectPosition.x * scale;
        const y = centerY - numericalObjectPosition.y * scale;
        
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText('Численний', x + 10, y + 15);
    }
}

function drawGrid(scale, centerX, centerY) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    
    // Вертикальные линии
    for (let x = -300; x <= 300; x += 50) {
        const canvasX = centerX + x * scale;
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, canvas.height);
        ctx.stroke();
    }
    
    // Горизонтальные линии
    for (let y = -300; y <= 300; y += 50) {
        const canvasY = centerY - y * scale;
        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(canvas.width, canvasY);
        ctx.stroke();
    }
    
    // Центральные оси
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
}

// Сделай функцию глобальной, чтобы HTML мог ее найти
window.updateConfig = async function() {
    const satelliteSpeed = document.getElementById('satelliteSpeed').value;
    const objectSpeed = document.getElementById('objectSpeed').value;
    
    const config = {
        satelliteSpeed: parseInt(satelliteSpeed),
        objectSpeed: parseInt(objectSpeed)
    };
    
    try {
        const response = await fetch('http://localhost:4001/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            alert('Параметри успішно оновлено!');
        } else {
            alert('Помилка при оновленні параметрів');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Помилка підключення до сервера');
    }
}