const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function esc(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function addMinutes(timeStr, mins) {
    if (!timeStr) timeStr = '00:00';
    const [h, m] = timeStr.split(':').map(Number);
    const total = (isNaN(h)?0:h) * 60 + (isNaN(m)?0:m) + parseInt(mins || 0);
    return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function formatDuration(mins) {
    mins = parseInt(mins) || 0;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
}

function buildMessage(data) {
    const {
        title, date, meetingTime, departureTime,
        meetingPlace, meetingAddress, meetingMapUrl,
        allPointsMapUrl, coordinates,
        hasTransport, carBrand, carNumber, driverName, driverPhone,
        routePoints = []
    } = data;

    const lines = [];

    // Заголовок
    lines.push(`📋 <b>${esc(title || 'План')}</b> — ${esc(date || '')}`);
    lines.push(`━━━━━━━━━━━━━━━━━━`);

    // Все точки на карте
    if (allPointsMapUrl) {
        lines.push(`🗺 <a href="${allPointsMapUrl}">Все точки на карте</a>`);
    }

    // Транспорт
    if (hasTransport && (carNumber || driverName || carBrand)) {
        lines.push('');
        lines.push(`🚘 <b>Транспорт:</b>`);
        if (carBrand) lines.push(`Марка/цвет: <b>${esc(carBrand)}</b>`);
        if (carNumber) lines.push(`Номер: <b>${esc(carNumber)}</b>`);
        if (driverName) {
            let dl = `👤 ${esc(driverName)}`;
            if (driverPhone) dl += ` · ${esc(driverPhone)}`;
            lines.push(dl);
        }
    }

    lines.push('');
    lines.push(`━━━━━━━━━━━━━━━━━━`);

    // Место сбора
    let sborLine = `🟢 <b>Сбор:</b> `;
    if (meetingMapUrl) {
        sborLine += `<a href="${meetingMapUrl}">${esc(meetingPlace || 'Место')}</a>`;
    } else {
        sborLine += `<b>${esc(meetingPlace || '—')}</b>`;
    }
    sborLine += ` — 🕐 ${esc(meetingTime || '—')}`;
    lines.push(sborLine);

    if (meetingAddress) lines.push(`📌 ${esc(meetingAddress)}`);
    if (coordinates)   lines.push(`📡 <code>${esc(coordinates)}</code>`);
    lines.push(`🔴 <b>Выезд:</b> ${esc(departureTime || '—')}`);
    lines.push('');

    // Маршрут
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    let runTime = departureTime || '00:00';
    let locN = 1;

    routePoints.forEach(point => {
        const dur = parseInt(point.duration) || 0;

        if (point.type === 'transit') {
            lines.push(`   🚗 <i>Переезд</i> ~${formatDuration(dur)}`);
            lines.push('');
            runTime = addMinutes(runTime, dur);

        } else if (point.type === 'lunch') {
            const end = addMinutes(runTime, dur);
            lines.push(`🍽 <b>Ланч</b> — ${esc(runTime)}–${esc(end)} (${formatDuration(dur)})`);
            lines.push('');
            runTime = end;

        } else if (point.type === 'location') {
            const end = addMinutes(runTime, dur);
            const em = emojis[locN - 1] || `${locN}.`;

            let locLine = `${em} `;
            if (point.link) {
                locLine += `<a href="${point.link}">${esc(point.title || 'Локация')}</a>`;
            } else {
                locLine += `<b>${esc(point.title || 'Локация')}</b>`;
            }
            locLine += ` — ${esc(runTime)}–${esc(end)}`;
            lines.push(locLine);
            lines.push(`   ⏱ ${formatDuration(dur)}`);

            if (point.mapUrl) lines.push(`   📍 <a href="${point.mapUrl}">Точка на карте</a>`);
            if (point.coords) lines.push(`   📡 <code>${esc(point.coords)}</code>`);

            lines.push('');
            locN++;
            runTime = end;
        }
    });

    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`🏁 <b>Возвращение: ~${esc(runTime)}</b>`);

    return lines.join('\n');
}

app.post('/send-plan', async (req, res) => {
    try {
        const { chatId, data } = req.body;
        if (!chatId || !data) {
            return res.status(400).json({ error: 'chatId и data обязательны' });
        }

        const messageText = buildMessage(data);
        console.log('Sending to chatId:', chatId);
        console.log('Message preview:', messageText.slice(0, 200));

        // Фото авто отдельным сообщением если есть
        if (data.hasTransport && data.carPhotoBase64) {
            try {
                const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
                const formData = new FormData();
                formData.append('chat_id', String(chatId));
                const blob = new Blob([Buffer.from(photoBase64, 'base64')], { type: 'image/jpeg' });
                formData.append('photo', blob, 'car.jpg');

                let caption = '🚘';
                if (data.carBrand) caption += ` ${data.carBrand}`;
                if (data.carNumber) caption += ` · ${data.carNumber}`;
                if (data.driverName) caption += `\n👤 ${data.driverName}`;
                if (data.driverPhone) caption += ` · ${data.driverPhone}`;
                formData.append('caption', caption);

                const photoRes = await fetch(`${TELEGRAM_API}/sendPhoto`, {
                    method: 'POST',
                    body: formData
                });
                const photoData = await photoRes.json();
                if (!photoData.ok) console.error('Photo error:', photoData);
            } catch (photoErr) {
                console.error('Photo send error:', photoErr);
                // Не останавливаемся — продолжаем отправку текста
            }
        }

        // Основное сообщение
        const tgRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: String(chatId),
                text: messageText,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });

        const tgData = await tgRes.json();
        console.log('Telegram response:', JSON.stringify(tgData).slice(0, 300));

        if (!tgData.ok) {
            console.error('Telegram error:', tgData);
            return res.status(500).json({ error: tgData.description });
        }

        res.json({ ok: true });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
