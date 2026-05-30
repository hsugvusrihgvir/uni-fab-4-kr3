const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { Server } = require('socket.io');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3001;
const SSL_PORT = 3443;
const DIR = path.join(__dirname, '..', 'client');
const SSL_KEY = path.join(__dirname, 'certs', 'localhost-key.pem');
const SSL_CERT = path.join(__dirname, 'certs', 'localhost-cert.pem');

// практика 16. VAPID ключи
const keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  ? {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    }
  : {
      publicKey: 'BJiE1huRlIOTOa9AZxXdft_LY_1fau_ofsdcy-iUpNfT80lmkJkPe8LF2dBZE2XFnPytWeqXzws7wVMTIXcXefk',
      privateKey: 'W96pyb_KCYRGGpc-vIT_pqwiyMOFS-jwhSD2OFgvXoo'
    };

// регистрируем VAPID данные в webpush
webpush.setVapidDetails(
  'mailto:student@example.com',
  keys.publicKey,
  keys.privateKey
);

// практика 16. push подписки
const subs = new Map();
// практика 17. таймеры напоминаний
const reminders = new Map();

app.use(express.json());
app.use(express.static(DIR));

// практика 16. клиент запрашивает публичный VAPID ключ перед подпиской
app.get('/vapidPublicKey', (req, res) => {
  res.type('text/plain').send(keys.publicKey);
});

// сохраняет подписку
app.post('/subscribe', (req, res) => {
  subs.set(req.body.endpoint, req.body);
  res.status(201).json({ message: 'Подписка сохранена' });
});

// удаляет подписку
app.post('/unsubscribe', (req, res) => {
  subs.delete(req.body.endpoint);
  res.json({ message: 'Подписка удалена' });
});

// практика 17. переносит напоминание на 5 минут
app.post('/snooze', (req, res) => {
  const id = Number(req.query.reminderId);

  if (!reminders.has(id)) {
    return res.status(404).json({ error: 'Напоминание не найдено' });
  }

  const reminder = reminders.get(id);
  clearTimeout(reminder.timeoutId);

  const delay = 5 * 60 * 1000;
  const timer = setTimeout(() => {
    sendPush({
      title: 'Напоминание отложено',
      body: reminder.text,
      reminderId: id
    });
    reminders.delete(id);
  }, delay);

  reminders.set(id, {
    text: reminder.text,
    timeoutId: timer,
    reminderTime: Date.now() + delay
  });

  res.json({ message: 'Напоминание отложено на 5 минут' });
});

io.on('connection', s => {
  console.log('Клиент подключился:', s.id);

  // клиент отправляет newTask при добавлении заметки
  s.on('newTask', task => {
    // taskAdded уходит в другие вкладки
    s.broadcast.emit('taskAdded', task);
    // push уведомление уходит клиентам
    sendPush({
      title: 'Новая заметка',
      body: task.text
    });
  });

  // клиент отправляет newReminder для заметки с датой
  s.on('newReminder', reminder => {
    const delay = reminder.reminderTime - Date.now();

    if (delay <= 0) {
      return;
    }

    // практика 17. setTimeout планирует отправку push в выбранное время
    const timer = setTimeout(() => {
      sendPush({
        title: 'Напоминание',
        body: reminder.text,
        reminderId: reminder.id
      });
      reminders.delete(reminder.id);
    }, delay);

    reminders.set(reminder.id, {
      text: reminder.text,
      reminderTime: reminder.reminderTime,
      timeoutId: timer
    });
  });
});

function sendPush(data) {
  const msg = JSON.stringify(data);

  subs.forEach((sub, url) => {
    webpush.sendNotification(sub, msg).catch(err => {
      console.error('Ошибка push:', err.message);

      if (err.statusCode === 404 || err.statusCode === 410) {
        subs.delete(url);
      }
    });
  });
}

server.listen(PORT, () => {
  console.log(`HTTP:  http://localhost:${PORT}`);
  console.log('VAPID public key:', keys.publicKey);
});

// HTTPS-версия
if (fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
  const sslServer = https.createServer({
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT)
  }, app);

  io.attach(sslServer);

  sslServer.listen(SSL_PORT, () => {
    console.log(`HTTPS: https://localhost:${SSL_PORT}`);
  });
}
