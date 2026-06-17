const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Настройки Telegram
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Настройки Supabase (подтягиваются из Railway)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Экранирование HTML символов для Telegram
function esc(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Корректное добавление минут
function addMinutes(timeStr, mins) {
    if (!timeStr) timeStr = '00:00';
    const [h, m] = timeStr.split(':').map(Number);
    
    const parsedMins = parseInt(mins, 10);
    const cleanMins = isNaN(parsedMins) ? 0 : parsedMins;
    
    const total = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) + cleanMins;
    
    const finalHours = Math.floor(total / 60) % 24;
    const finalMins = total % 60;
    
    return `${String(finalHours).padStart(2, '0')}:${String(finalMins).padStart(2, '0')}`;
}

// Форматирование длительности
function formatDuration(mins) {
    mins = parseInt(mins, 10) || 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} ч ${m} мин`;
    if (h > 0) return `${h} ч`;
    return `${m} мин`;
}

// Сборка текста сообщения для Telegram
function buildMessage(data, includeTransport = true) {
    const {
        title, date, meetingTime, departureTime,
        meetingPlace, meetingAddress, meetingMapUrl,
        allPointsMapUrl, coordinates,
        hasTransport, carBrand, carNumber, driverName, driverPhone,
        routePoints = []
    } = data;

    const lines = [];

    lines.push(`📋 <b>${esc(title || 'План')}</b> — ${esc(date || '')}`);
    if (allPointsMapUrl) {
        lines.push(`🗺 <a href="${allPointsMapUrl}">Все точки на карте</a>`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━`);

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

    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    let runTime = departureTime || '00:00';
    let locN = 1;

    routePoints.forEach(point => {
        const dur = parseInt(point.duration, 10) || 0;

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

// Подпись к фото авто
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

// Отправка фото в Telegram
async function sendPhoto(chatId, photoBuffer, caption, parseMode = 'HTML') {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    
    const blob = new Blob([photoBuffer], { type: 'image/jpeg' });
    formData.append('photo', blob, 'car.jpg');
    
    if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', parseMode);
    }

    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });
    const d = await res.json();
    if (!d.ok) throw new Error(d.description || 'Telegram sendPhoto error');
    return d;
}

// Отправка текста в Telegram
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
    if (!d.ok) throw new Error(d.description || 'Telegram sendMessage error');
    return d;
}

// Ключевой роут отправки плана и сохранения в БД
app.post('/send-plan', async (req, res) => {
    try {
        const { chatId, userId, data } = req.body;
        if (!chatId || !data) {
            return res.status(400).json({ error: 'chatId и data обязательны' });
        }

        // --- 1. АВТОМАТИЧЕСКОЕ СОХРАНЕНИЕ В SUPABASE ---
        let savedProjectId = null;
        
        if (SUPABASE_URL && SUPABASE_KEY) {
            console.log('Saving project to Supabase...');
            
            // Запись в таблицу projects
            const { data: projectRow, error: projectError } = await supabase
                .from('projects')
                .insert([{
                    user_id: userId ? parseInt(userId, 10) : null, // Если приложение шлет ID юзера
                    title: data.title || 'Новый план',
                    event_date: data.date || null,
                    meeting_place: data.meetingPlace || null,
                    meeting_time: data.meetingTime || null,
                    departure_time: data.departureTime || null,
                    meeting_address: data.meetingAddress || null,
                    meeting_map_url: data.meetingMapUrl || null,
                    show_coordinates: !!data.coordinates,
                    coordinates: data.coordinates || null,
                    status: 'active'
                }])
                .select()
                .single();

            if (projectError) {
                console.error('Supabase project insert error:', projectError.message);
                // Не прерываем отправку в ТГ, если база дала сбой, но логируем это
            } else if (projectRow) {
                savedProjectId = projectRow.id;
                console.log('Project saved successfully with ID:', savedProjectId);

                // Если есть точки маршрута, сохраняем их в таблицу route_points
                if (data.routePoints && data.routePoints.length > 0) {
                    const pointsToInsert = data.routePoints.map((point, index) => ({
                        project_id: savedProjectId,
                        position: index + 1, // Индекс для правильной сортировки
                        type: point.type || 'location',
                        title: point.title || (point.type === 'lunch' ? 'Ланч' : 'Точка'),
                        photo_url: point.link || null, // Ссылка на локацию/фото
                        address: point.address || null,
                        map_url: point.mapUrl || null,
                        duration_minutes: parseInt(point.duration, 10) || 0
                    }));

                    const { error: pointsError } = await supabase
                        .from('route_points')
                        .insert(pointsToInsert);

                    if (pointsError) {
                        console.error('Supabase route_points insert error:', pointsError.message);
                    } else {
                        console.log(`Saved ${pointsToInsert.length} route points.`);
                    }
                }
            }
        }

        // --- 2. ОТПРАВКА В TELEGRAM ---
        const hasPhoto = data.hasTransport && data.carPhotoBase64 && data.carPhotoBase64.length > 20;

        if (hasPhoto) {
            const photoBase64 = data.carPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
            const photoBuffer = Buffer.from(photoBase64, 'base64');
            const fullText = buildMessage(data, true);

            if (fullText.length <= 1024) {
                try {
                    await sendPhoto(chatId, photoBuffer, fullText, 'HTML');
                    return res.json({ ok: true, projectId: savedProjectId });
                } catch (photoErr) {
                    console.warn('Failed combined send, trying separate:', photoErr.message);
                }
            }

            const carCaption = buildCarCaption(data);
            await sendPhoto(chatId, photoBuffer, carCaption, 'HTML');

            const planWithoutTransport = buildMessage(data, false);
            await sendText(chatId, planWithoutTransport);

            return res.json({ ok: true, projectId: savedProjectId });
        }

        const textOnly = buildMessage(data, true);
        await sendText(chatId, textOnly);
        
        // Возвращаем клиенту успешный ответ и ID созданного проекта в БД
        res.json({ ok: true, projectId: savedProjectId });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅ и синхронизирован с Supabase 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
