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



// includeTransport — включать ли блок транспорта в текст

function buildMessage(data, includeTransport = true) {

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

    if (allPointsMapUrl) {

        lines.push(`🗺 <a href="${allPointsMapUrl}">Все точки на карте</a>`);

    }

    lines.push(`━━━━━━━━━━━━━━━━━━`);



    // Транспорт — только если includeTransport=true

    if (includeTransport && hasTransport && (carBrand || carNumber || driverName)) {

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



// Подпись к фото авто (отдельное сообщение)

function buildCarCaption(data) {

    const { carBrand, carNumber, driverName, driverPhone } = data;

    const lines = ['🚘 <b>Транспорт:</b>'];

    if (carBrand)  lines.push(`<b>${esc(carBrand)}</b>`);

    if (carNumber) lines.push(`<b>${esc(carNumber)}</b>`);

    if (driverName) {

        let dl = `👤 ${esc(driverName)}`;

        if (driverPhone) dl += ` · ${esc(driverPhone)}`;

        lines.push(dl);

    }

    return lines.join('\n');

}



async function sendPhoto(chatId, photoBuffer, caption, parseMode = 'HTML') {

    const formData = new FormData();

    formData.append('chat_id', String(chatId));

    formData.append('photo', new Blob([photoBuffer], { type: 'image/jpeg' }), 'car.jpg');

    if (caption) {

        formData.append('caption', caption);

        formData.append('parse_mode', parseMode);

    }

    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });

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



            // Полный план С транспортом

            const fullText = buildMessage(data, true);



            if (fullText.length <= 1024) {

                // ✅ Всё влезает — одно сообщение: фото + весь план

                const r = await sendPhoto(chatId, photoBuffer, fullText, 'HTML');

                if (r.ok) return res.json({ ok: true });

                console.error('Combined send failed:', r);

            }



            // ❌ Не влезает — два сообщения:

            // 1) Фото + данные авто

            // 2) План БЕЗ блока транспорта (чтобы не дублировать)

            console.log('Plan too long, sending separately');

            const carCaption = buildCarCaption(data);

            await sendPhoto(chatId, photoBuffer, carCaption, 'HTML');



            const planWithoutTransport = buildMessage(data, false);

            await sendText(chatId, planWithoutTransport);



            return res.json({ ok: true });

        }



        // Нет фото — просто текст (транспорт включён в план)

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

