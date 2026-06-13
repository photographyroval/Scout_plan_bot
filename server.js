const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Экранирование для MarkdownV2
function esc(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

function addMinutes(timeStr, mins) {
    if (!timeStr) timeStr = '00:00';
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + parseInt(mins || 0);
    const rh = Math.floor(total / 60) % 24;
    const rm = total % 60;
    return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function formatDuration(mins) {
    mins = parseInt(mins) || 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
}

function buildMessage(data) {
    const {
        title, date, meetingTime, departureTime,
        meetingPlace, meetingAddress, meetingMapUrl,
        allPointsMapUrl, coordinates,
        hasTransport, carNumber, driverName, driverPhone,
        routePoints
    } = data;

    let msg = '';

    // Заголовок
    msg += `📋 *План скаута на ${esc(date)}*\n`;
    msg += `*${esc(title)}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Ссылка на все точки
    if (allPointsMapUrl) {
        msg += `🗺 [Все точки на карте](${allPointsMapUrl})\n\n`;
    }

    // Транспорт
    if (hasTransport && (carNumber || driverName)) {
        msg += `🚘 *Транспорт:*\n`;
        if (carNumber) msg += `Авто: *${esc(carNumber)}*\n`;
        if (driverName || driverPhone) {
            msg += `Водитель: ${esc(driverName)}`;
            if (driverPhone) msg += ` — ${esc(driverPhone)}`;
            msg += `\n`;
        }
        msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Место сбора
    msg += `🟢 *Сбор:* `;
    if (meetingMapUrl) {
        msg += `[${esc(meetingPlace)}](${meetingMapUrl})`;
    } else {
        msg += `*${esc(meetingPlace)}*`;
    }
    msg += ` — 🕐 ${esc(meetingTime)}\n`;

    if (meetingAddress) {
        msg += `📌 ${esc(meetingAddress)}\n`;
    }
    if (coordinates) {
        msg += `📡 \`${esc(coordinates)}\`\n`;
    }

    msg += `🔴 *Выезд:* ${esc(departureTime)}\n\n`;

    // Маршрут
    let runningTime = departureTime;
    let locCounter = 1;
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

    routePoints.forEach((point) => {
        const dur = parseInt(point.duration) || 0;

        if (point.type === 'transit') {
            msg += `   🚗 *Переезд* ~${esc(formatDuration(dur))}\n\n`;
            runningTime = addMinutes(runningTime, dur);
        } else if (point.type === 'lunch') {
            const end = addMinutes(runningTime, dur);
            msg += `🍽️ *Ланч* — ${esc(runningTime)}–${esc(end)} \\(${esc(formatDuration(dur))}\\)\n\n`;
            runningTime = end;
        } else if (point.type === 'location') {
            const end = addMinutes(runningTime, dur);
            const emoji = emojis[locCounter - 1] || `${locCounter}\\.`;

            msg += `${emoji} `;
            if (point.link) {
                msg += `[${esc(point.title)}](${point.link})`;
            } else {
                msg += `*${esc(point.title)}*`;
            }
            msg += ` — 🕐 ${esc(runningTime)}–${esc(end)}\n`;
            msg += `   ⏱ ${esc(formatDuration(dur))}\n`;

            if (point.mapUrl) {
                msg += `   📍 [Точка на карте](${point.mapUrl})\n`;
            }
            if (point.coords) {
                msg += `   📡 \`${esc(point.coords)}\`\n`;
            }

            msg += `\n`;
            locCounter++;
            runningTime = end;
        }
    });

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏁 *Возвращение: ~${esc(runningTime)}*`;

    return msg;
}

// Основной эндпоинт
app.post('/send-plan', async (req, res) => {
    try {
        const { chatId, data } = req.body;

        if (!chatId || !data) {
            return res.status(400).json({ error: 'chatId и data обязательны' });
        }

        const messageText = buildMessage(data);

        // Если есть фото авто — сначала фото с подписью
        if (data.hasTransport && data.carPhotoBase64) {
            const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');

            const formData = new FormData();
            formData.append('chat_id', chatId);
            const blob = new Blob([Buffer.from(photoBase64, 'base64')], { type: 'image/jpeg' });
            formData.append('photo', blob, 'car.jpg');
            formData.append('caption', `🚘 ${data.carNumber || 'Авто'} — ${data.driverName || ''}`);

            await fetch(`${TELEGRAM_API}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
        }

        // Отправляем основное сообщение
        const tgRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: messageText,
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true
            })
        });

        const tgData = await tgRes.json();

        if (!tgData.ok) {
            console.error('Telegram error:', tgData);
            return res.status(500).json({ error: tgData.description });
        }

        res.json({ ok: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
