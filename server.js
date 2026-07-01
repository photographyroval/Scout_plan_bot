const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://photographyroval.github.io/Scout_plan_bot/';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── УТИЛИТЫ ──────────────────────────────────────────────────────────────────

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

// ─── ОТПРАВКА TELEGRAM СООБЩЕНИЙ ─────────────────────────────────────────────

async function tgRequest(method, body) {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) console.error(`Telegram ${method} error:`, data.description);
    return data;
}

async function sendMessage(chatId, text, extra = {}) {
    return tgRequest('sendMessage', {
        chat_id: String(chatId),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra
    });
}

// Кнопки под каждым сообщением бота
function mainKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '📋 Открыть Scout Planner', web_app: { url: WEBAPP_URL } }],
            [
                { text: '❓ Помощь', callback_data: 'help' },
                { text: 'ℹ️ О боте', callback_data: 'about' }
            ],
            [{ text: '🐛 Сообщить о проблеме', callback_data: 'report' }]
        ]
    };
}

// ─── ТЕКСТЫ СООБЩЕНИЙ ─────────────────────────────────────────────────────────

const TEXT_START = `👋 <b>Привет! Я Scout Planner.</b>

Помогаю организовать скаутинг локаций — быстро, удобно и красиво.

Ты заполняешь информацию о плане, а я формирую готовое сообщение с маршрутом, временем и всеми ссылками — и отправляю прямо в этот чат.

Нажми кнопку ниже чтобы начать 👇`;

const TEXT_HELP = `❓ <b>Как пользоваться Scout Planner</b>

<b>1. Создай проект</b>
Нажми «+ Создать новый проект» и заполни основную информацию — название, дату, время и место сбора.

<b>2. Добавь транспорт</b> (по желанию)
Укажи марку авто, номер, имя и телефон водителя. Можно прикрепить фото машины.

<b>3. Составь маршрут</b>
Добавляй локации, переезды и перерывы на ланч. Перетаскивай карточки чтобы менять порядок. Бот автоматически посчитает время!

<b>4. Отправь план</b>
Нажми «📤 Отправить план в Telegram» — и готовое сообщение со всеми ссылками и временами придёт прямо сюда.

<b>Лимит локаций:</b> до 15 точек маршрута.`;

const TEXT_REPORT = `🐛 <b>Сообщить о проблеме</b>

Напишите напрямую разработчику — опишите что пошло не так и приложите скриншот если возможно.

👉 <a href="https://t.me/photographyroval">@photographyroval</a>

Постараемся помочь как можно скорее!`;

const TEXT_ABOUT = `ℹ️ <b>Scout Planner</b>

Инструмент для планирования скаутинга локаций для съёмок, мероприятий и продакшена.

<b>Возможности:</b>
• Создание маршрутных планов с таймингом
• Автоматический подсчёт времени возвращения
• Ссылки на карты и фото прямо в сообщении
• Данные о транспорте и водителе
• Тёмная и светлая тема
• Сохранение проектов и черновиков
`;

// ─── WEBHOOK ОБРАБОТЧИК ───────────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Всегда отвечаем 200 сразу

    const update = req.body;

    try {
        // Обработка обычных сообщений / команд
        if (update.message) {
            const msg = update.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';
            const firstName = msg.from?.first_name || 'друг';

            if (text === '/start') {
                await sendMessage(chatId,
                    TEXT_START.replace('👋 <b>Привет!', `👋 <b>Привет, ${esc(firstName)}!`),
                    { reply_markup: mainKeyboard() }
                );
            } else if (text === '/help') {
                await sendMessage(chatId, TEXT_HELP, { reply_markup: mainKeyboard() });
            } else if (text === '/about') {
                await sendMessage(chatId, TEXT_ABOUT, { reply_markup: mainKeyboard() });
            } else if (text === '/plan') {
                // Быстрый запуск приложения
                await sendMessage(chatId, '📋 Открываю планировщик...', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📋 Открыть Scout Planner', web_app: { url: WEBAPP_URL } }
                        ]]
                    }
                });
            } else if (msg.web_app_data) {
                // Данные из мини-апп (если используется sendData)
                await sendMessage(chatId, '✅ Данные получены от приложения.');
            } else {
                // Любое другое сообщение — показываем кнопки
                await sendMessage(chatId,
                    `Используй кнопку ниже чтобы открыть Scout Planner 👇`,
                    { reply_markup: mainKeyboard() }
                );
            }
        }

        // Обработка нажатий inline-кнопок
        if (update.callback_query) {
            const cb = update.callback_query;
            const chatId = cb.message.chat.id;
            const data = cb.data;

            // Отвечаем на callback чтобы убрать "часики"
            await tgRequest('answerCallbackQuery', { callback_query_id: cb.id });

            if (data === 'help') {
                await sendMessage(chatId, TEXT_HELP, { reply_markup: mainKeyboard() });
            } else if (data === 'about') {
                await sendMessage(chatId, TEXT_ABOUT, { reply_markup: mainKeyboard() });
            } else if (data === 'report') {
                await sendMessage(chatId, TEXT_REPORT, { reply_markup: mainKeyboard() });
            }
        }

    } catch (err) {
        console.error('Webhook handler error:', err);
    }
});

// ─── ПЛАН МАРШРУТА ────────────────────────────────────────────────────────────

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

    lines.push(`<b>${esc(title || 'План')} — ${esc(date || '')}</b>`);
    if (allPointsMapUrl) {
        lines.push(`<a href="${allPointsMapUrl}">Все точки на карте</a>`);
    }
    lines.push(SEP);

    if (includeTransport && hasTransport && (carBrand || carNumber || driverName)) {
        lines.push(`🚘 <b>Транспорт</b>`);
        const carLine = [carBrand, carNumber].filter(Boolean).map(s => `<b>${esc(s)}</b>`).join('  ');
        if (carLine) lines.push(carLine);
        if (driverName) {
            let dl = esc(driverName);
            if (driverPhone) dl += `  ${esc(driverPhone)}`;
            lines.push(dl);
        }
        lines.push(SEP);
    }

    const sborPlace = meetingMapUrl
        ? `<a href="${meetingMapUrl}">${esc(meetingPlace || 'Место')}</a>`
        : esc(meetingPlace || '—');
    lines.push(`🟢 <b>Сбор:</b> ${sborPlace} — ${esc(meetingTime || '—')} | 🔴 <b>Выезд:</b> ${esc(departureTime || '—')}`);

    if (meetingAddress) lines.push(esc(meetingAddress));
    if (coordinates) lines.push(`<code>${esc(coordinates)}</code>`);
    lines.push(SEP);

    const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣'];
    let runTime = departureTime || '00:00';
    let locN = 1;

    routePoints.forEach(point => {
        const dur = parseInt(point.duration) || 0;

        if (point.type === 'transit') {
            lines.push(`   🚗 Переезд ~${formatDuration(dur)}`);
            lines.push('');
            runTime = addMinutes(runTime, dur);
        } else if (point.type === 'lunch') {
            const end = addMinutes(runTime, dur);
            lines.push(`🍽 Ланч ${esc(runTime)}–${esc(end)} (${formatDuration(dur)})`);
            lines.push('');
            runTime = end;
        } else if (point.type === 'location') {
            const end = addMinutes(runTime, dur);
            const em = nums[locN - 1] || `${locN}.`;
            let locLine = `${em} `;
            if (point.link) {
                locLine += `<a href="${point.link}"><b>${esc(point.title || 'Локация')}</b></a>`;
            } else {
                locLine += `<b>${esc(point.title || 'Локация')}</b>`;
            }
            lines.push(locLine);
            lines.push(`🕐 ${esc(runTime)}–${esc(end)} (${formatDuration(dur)})`);
            if (point.mapUrl) lines.push(`📍 <a href="${point.mapUrl}">Точка на карте</a>`);
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
    const carLine = [carBrand, carNumber].filter(Boolean).map(s => `<b>${esc(s)}</b>`).join('  ');
    if (carLine) lines.push(carLine);
    if (driverName) {
        let dl = esc(driverName);
        if (driverPhone) dl += `  ${esc(driverPhone)}`;
        lines.push(dl);
    }
    return lines.join('\n');
}

async function sendPhoto(chatId, photoBuffer, caption) {
    const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;
    const header =
        `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="car.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer =
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n--${boundary}--`;

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

// ─── ОТПРАВКА ПЛАНА ───────────────────────────────────────────────────────────

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

            // План длиннее 1024 — фото + данные авто отдельно, потом план без транспорта
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

// ─── УСТАНОВКА WEBHOOK ────────────────────────────────────────────────────────

async function setupWebhook() {
    if (!BOT_TOKEN) {
        console.log('BOT_TOKEN не задан — webhook не установлен');
        return;
    }
    const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.SERVER_URL || '';

    if (!RAILWAY_URL) {
        console.log('SERVER_URL не задан — webhook не установлен. Добавь переменную SERVER_URL в Railway.');
        return;
    }

    const webhookUrl = `${RAILWAY_URL}/webhook`;
    const result = await tgRequest('setWebhook', {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
    });

    if (result.ok) {
        console.log(`✅ Webhook установлен: ${webhookUrl}`);
    } else {
        console.error('❌ Webhook error:', result.description);
    }

    // Устанавливаем команды меню бота
    await tgRequest('setMyCommands', {
        commands: [
            { command: 'start', description: '👋 Начать работу' },
            { command: 'plan', description: '📋 Открыть планировщик' },
            { command: 'help', description: '❓ Как пользоваться' },
            { command: 'about', description: 'ℹ️ О боте' }
        ]
    });
    console.log('✅ Команды меню установлены');
}

// ─── ЗАПУСК ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.send('Scout Planner Bot — работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await setupWebhook();
});
