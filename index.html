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

    // Заголовок — название, дата, ссылка на карту всех точек
    lines.push(`📋 <b>${esc(title || 'План')}</b> — ${esc(date || '')}`);
    if (allPointsMapUrl) {
        lines.push(`🗺 <a href="${allPointsMapUrl}">Все точки на карте</a>`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━`);

    // Транспорт — без лишних подписей, только значения
    if (hasTransport && (carBrand || carNumber || driverName)) {
        lines.push(`🚘 <b>Транспорт:</b>`);
        if (carBrand)  lines.push(`<b>${esc(carBrand)}</b>`);
        if (carNumber) lines.push(`<b>${esc(carNumber)}</b>`);
        if (driverName) {
            let dl = `👤 ${esc(driverName)}`;
            if (driverPhone) dl += ` · ${esc(driverPhone)}`;
            lines.push(dl);
        }
        lines.push('');
    }

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
        console.log('Message preview:', messageText.slice(0, 300));

        // Если есть фото авто — всегда пробуем отправить фото + план вместе
        if (data.hasTransport && data.carPhotoBase64) {
            try {
                const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
                const photoBuffer = Buffer.from(photoBase64, 'base64');

                if (messageText.length <= 1024) {
                    // Короткий план — всё в одном сообщении (фото + caption)
                    const formData = new FormData();
                    formData.append('chat_id', String(chatId));
                    formData.append('photo', new Blob([photoBuffer], {type:'image/jpeg'}), 'car.jpg');
                    formData.append('caption', messageText);
                    formData.append('parse_mode', 'HTML');
                    const r = await fetch(`${TELEGRAM_API}/sendPhoto`, {method:'POST', body:formData});
                    const rd = await r.json();
                    if (rd.ok) return res.json({ ok: true });
                    console.error('Short caption failed:', rd);
                }

                // Длинный план (или caption не прошёл) —
                // фото с короткой подписью, затем сразу текст плана
                // Они придут вместе как два сообщения подряд — выглядит как одно
                const formData2 = new FormData();
                formData2.append('chat_id', String(chatId));
                formData2.append('photo', new Blob([photoBuffer], {type:'image/jpeg'}), 'car.jpg');
                // Короткая подпись с данными авто
                let shortCaption = '';
                if (data.carBrand)  shortCaption += `🚘 ${data.carBrand}`;
                if (data.carNumber) shortCaption += (shortCaption ? ' · ' : '🚘 ') + data.carNumber;
                if (data.driverName) shortCaption += `
👤 ${data.driverName}`;
                if (data.driverPhone) shortCaption += ` · ${data.driverPhone}`;
                formData2.append('caption', shortCaption || '🚘 Фото транспорта');
                await fetch(`${TELEGRAM_API}/sendPhoto`, {method:'POST', body:formData2});

                // Сразу следом — полный план текстом
                await sendTextMessage(chatId, messageText);
                return res.json({ ok: true });

            } catch (photoErr) {
                console.error('Photo send error:', photoErr);
                // Fallback — просто текст
            }
        }

        // Нет фото — просто текстовое сообщение
        await sendTextMessage(chatId, messageText);
        res.json({ ok: true });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function sendPhotoOnly(data, chatId) {
    try {
        const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        const blob = new Blob([Buffer.from(photoBase64, 'base64')], { type: 'image/jpeg' });
        formData.append('photo', blob, 'car.jpg');
        await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });
    } catch(e) { console.error(e); }
}

async function sendTextMessage(chatId, text) {
    const tgRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: String(chatId),
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        })
    });
    const tgData = await tgRes.json();
    console.log('Text response:', JSON.stringify(tgData).slice(0, 300));
    if (!tgData.ok) throw new Error(tgData.description || 'Telegram error');
    return tgData;
}

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
