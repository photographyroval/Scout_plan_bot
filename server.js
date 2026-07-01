const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Немного увеличили лимит под Base64 фото

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
    const total = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) + parseInt(mins || 0);
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDuration(mins) {
    mins = parseInt(mins) || 0;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
}

function buildMessage(data, includeTransport = true) {
    const {
        title, date, meetingTime, departureTime,
        meetingPlace, meetingAddress, meetingMapUrl,
        allPointsMapUrl, coordinates,
        hasTransport, carBrand, carNumber, driverName, driverPhone,
        routePoints = []
    } = data;

    const SEP = '──────────────────';
    const lines = [];

    // Заголовок
    lines.push(`<b>${esc(title || 'План')} — ${esc(date || '')}</b>`);
    if (allPointsMapUrl) {
        lines.push(`<a href="${allPointsMapUrl}">Все точки на карте</a>`);
    }
    lines.push(SEP);

    // Транспорт
    if (includeTransport && hasTransport && (carBrand || carNumber || driverName)) {
        lines.push(`🚘 <b>Транспорт</b>`);
        let carLine = [carBrand, carNumber].filter(Boolean).map(s => `<b>${esc(s)}</b>`).join('  ');
        if (carLine) lines.push(carLine);
        if (driverName) {
            let dl = esc(driverName);
            if (driverPhone) dl += `  ${esc(driverPhone)}`;
            lines.push(dl);
        }
        lines.push(SEP);
    }

    // Сбор и выезд — на одной строке через |
    let sborPlace = meetingMapUrl
        ? `<a href="${meetingMapUrl}">${esc(meetingPlace || 'Место')}</a>`
        : `${esc(meetingPlace || '—')}`;
    lines.push(`🟢 <b>Сбор:</b> ${sborPlace} — ${esc(meetingTime || '—')} | 🔴 <b>Выезд:</b> ${esc(departureTime || '—')}`);

    // Адрес — без эмодзи
    if (meetingAddress) lines.push(esc(meetingAddress));
    // Координаты — кликабельные, без эмодзи
    if (coordinates) lines.push(`<code>${esc(coordinates)}</code>`);
    lines.push(SEP);

    const nums = ['1','2','3','4','5','6','7','8','9','10'];
    let runTime = departureTime || '00:00';
    let locN = 1;

    routePoints.forEach(point => {
        const dur = parseInt(point.duration) || 0;

        if (point.type === 'transit') {
            // Переезд — смещение + машинка
            lines.push(`   🚗 Переезд ~${formatDuration(dur)}`);
            lines.push('');
            runTime = addMinutes(runTime, dur);

        } else if (point.type === 'lunch') {
            const end = addMinutes(runTime, dur);
            // Ланч — эмодзи, время, длительность
            lines.push(`🍽 Ланч ${esc(runTime)}–${esc(end)} (${formatDuration(dur)})`);
            lines.push('');
            runTime = end;

        } else if (point.type === 'location') {
            const end = addMinutes(runTime, dur);
            const num = nums[locN - 1] || String(locN);

            // Строка 1: номер + название жирное
            let titleLine = `${num}  `;
            if (point.link) {
                titleLine += `<a href="${point.link}"><b>${esc(point.title || 'Локация')}</b></a>`;
            } else {
                titleLine += `<b>${esc(point.title || 'Локация')}</b>`;
            }
            lines.push(titleLine);

            // Строка 2: 🕐 время–время (длительность)
            lines.push(`🕐 ${esc(runTime)}–${esc(end)} (${formatDuration(dur)})`);

            // Ссылка на карту точки
            if (point.mapUrl) lines.push(`📍 <a href="${point.mapUrl}">Точка на карте</a>`);
            // Координаты точки
            if (point.coords) lines.push(`<code>${esc(point.coords)}</code>`);

            lines.push('');
            locN++;
            runTime = end;
        }
    });

    lines.push(SEP);
    lines.push(`🏁 <b>Возвращение: ~${esc(runTime)}</b>`);

    return lines.join('\n');
}

function buildCarCaption(data) {
    const { carBrand, carNumber, driverName, driverPhone } = data;
    const lines = ['🚘 <b>Транспорт</b>'];
    let carLine = [carBrand, carNumber].filter(Boolean).map(s => `<b>${esc(s)}</b>`).join('  ');
    if (carLine) lines.push(carLine);
    if (driverName) {
        let dl = esc(driverName);
        if (driverPhone) dl += `  ${esc(driverPhone)}`;
        lines.push(dl);
    }
    return lines.join('\n');
}

// Надежный метод отправки через встроенный Node.js fetch и стандартный Multipart без багов Blob
async function sendPhoto(chatId, photoBuffer, caption) {
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
                   `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="car.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
                   `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n--${boundary}--`

    const bodyBuffer = Buffer.concat([
        Buffer.from(header, 'utf-8'),
        photoBuffer,
        Buffer.from(footer, 'utf-8')
    ]);

    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: bodyBuffer
    });
    return res.json();
}

async function sendText(chatId, text) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: String(chatId),
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        })
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.description || 'Telegram error');
    return d;
}

app.post('/send-plan', async (req, res) => {
    try {
        const { chatId, data } = req.body;
        if (!chatId || !data) {
            return res.status(400).json({ error: 'chatId и data обязательны' });
        }

        const hasPhoto = data.hasTransport && data.carPhotoBase64;

        if (hasPhoto) {
            const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
            const photoBuffer = Buffer.from(photoBase64, 'base64');
            const fullText = buildMessage(data, true);

            if (fullText.length <= 1024) {
                const r = await sendPhoto(chatId, photoBuffer, fullText);
                if (r.ok) return res.json({ ok: true });
                console.error('Combined send failed:', r);
            }

            const carCaption = buildCarCaption(data);
            await sendPhoto(chatId, photoBuffer, carCaption);

            const planWithoutTransport = buildMessage(data, false);
            await sendText(chatId, planWithoutTransport);

            return res.json({ ok: true });
        }

        const textOnly = buildMessage(data, true);
        await sendText(chatId, textOnly);
        res.json({ ok: true });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
