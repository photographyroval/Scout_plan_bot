const express = require('express');
const cors = require('cors');

const app = express();
// Разрешаем CORS, чтобы наш фронтенд (например, с GitHub Pages) мог слать запросы
app.use(cors());
// Ограничение на размер прилетающего плана (важно для Base64 картинок машин)
app.use(express.json({ limit: '50mb' }));

// Токен бота и ID чата берем из переменных окружения сервера (например, на Railway)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Проверочный роут, чтобы видеть, что сервер живой
app.get('/', (req, res) => {
  res.send('Scout Planner Server ис alive!');
});

// Главный роут отправки плана
app.post('/send-plan', async (req, res) => {
  try {
    const { chatId, data } = req.body;
    
    if (!data) {
      return res.status(400).json({ ok: false, error: 'Нет данных плана' });
    }

    // Формируем красивый текстовый маркдаун для Telegram
    let message = `📋 *ПЛАН СКАУТА: ${data.title || 'Без названия'}*\n`;
    message += `📅 Дата: ${data.date || '—'}\n`;
    message += `🟢 Сбор: *${data.meetingTime || '—'}* · Выезд: *${data.departureTime || '—'}*\n`;
    message += `📍 Место: ${data.meetingPlace || '—'}\n`;
    if (data.meetingAddress) message += `🏠 Адрес: ${data.meetingAddress}\n`;
    if (data.meetingMapUrl) message += `🗺 [Место сбора на карте](${data.meetingMapUrl})\n`;
    if (data.coordinates) message += `📡 GPS: \`${data.coordinates}\`\n`;

    if (data.hasTransport) {
      message += `\n🚘 *Транспорт:*\n`;
      message += `· Авто: ${data.carBrand || '—'} (${data.carNumber || '—'})\n`;
      message += `· Водитель: ${data.driverName || '—'} ${data.driverPhone || ''}\n`;
    }

    if (data.allPointsMapUrl) {
      message += `\n🗺 *[ОБЩАЯ КАРТА МАРШРУТА](${data.allPointsMapUrl})*\n`;
    }

    if (data.routePoints && data.routePoints.length > 0) {
      message += `\n📍 *Маршрутный лист:*\n`;
      data.routePoints.forEach((p, idx) => {
        let icon = '🔹';
        if (p.type === 'location') icon = '📍';
        if (p.type === 'transit') icon = '🚗';
        if (p.type === 'lunch') icon = '🍽';
        
        message += `${idx + 1}. ${icon} *${p.title}* (${p.duration} мин)\n`;
        if (p.mapUrl) message += `   └ 🗺 [Точка на карте](${p.mapUrl})\n`;
        if (p.link) message += `   └ 📷 [Фото локации](${p.link})\n`;
        if (p.coords) message += `   └ 📡 GPS: \`${p.coords}\`\n`;
      });
    }

    const targetChatId = TELEGRAM_CHAT_ID || chatId;

    // Если у нас есть фото машины в Base64, отправляем как фото с подписью
    if (data.hasTransport && data.carPhotoBase64 && data.carPhotoBase64.startsWith('data:image')) {
      // Отсекаем заголовок data:image/...;base64,
      const base64Data = data.carPhotoBase64.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      
      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      formData.append('caption', message);
      formData.append('parse_mode', 'Markdown');
      
      // Создаем blob для отправки файла в теле запроса
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      formData.append('photo', blob, 'car.jpg');

      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      const resData = await response.json();

      if (!resData.ok) {
        throw new Error(resData.description || 'Ошибка Telegram API при отправке фото');
      }
    } else {
      // Иначе шлем обычным текстовым сообщением
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        })
      });
      const resData = await response.json();

      if (!resData.ok) {
        throw new Error(resData.description || 'Ошибка Telegram API при отправке текста');
      }
    }

    res.json({ ok: true });

  } catch (error) {
    console.error('Ошибка на сервере:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
