// практика 16. подключаемся к Socket.IO
const socket = window.io ? window.io() : null;

// практика 15. main контейнер для страниц
const app = document.getElementById('app');
const toastBox = document.getElementById('toast-box');

// практика 13. берем заметки из localStorage
function getNotes() {
  return JSON.parse(localStorage.getItem('notes') || '[]');
}

// практика 13. сохраняем массив заметок в localStorage
function saveNotes(notes) {
  localStorage.setItem('notes', JSON.stringify(notes));
}

// практика 16. всплывающее сообщение для события из другой вкладки
function showToast(text) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  toastBox.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// практика 17. показываем дату напоминания если у заметки есть reminder
function formatReminder(reminder) {
  if (!reminder) {
    return 'без напоминания';
  }

  return `напоминание: ${new Date(reminder).toLocaleString('ru-RU')}`;
}

// Практика 13. выводим список заметок на страницу
function renderNotes() {
  const list = document.getElementById('notes-list');

  if (!list) {
    return;
  }

  const notes = getNotes();

  if (notes.length === 0) {
    list.innerHTML = '<li class="empty-state">Пока пусто. Можно добавить первую заметку.</li>';
    return;
  }

  list.innerHTML = notes.map(note => `
    <li class="note-item">
      <div>
        <p class="note-text">${escapeHtml(note.text)}</p>
        <p class="note-meta">${formatReminder(note.reminder)}</p>
      </div>
      <button class="delete-note" type="button" data-delete="${note.id}" aria-label="Удалить заметку">x</button>
    </li>
  `).join('');
}

//  добавляем заметку в localStorage
function addNote(text, reminder = null) {
  const notes = getNotes();
  const note = {
    id: Date.now(),
    text,
    reminder
  };

  notes.push(note);
  saveNotes(notes);
  renderNotes();

  // практика 16. отправляем событие newTask на сервер
  if (socket && !reminder) {
    socket.emit('newTask', { text, timestamp: Date.now() });
  }

  // практика 17. отправляем newReminder
  if (socket && reminder) {
    socket.emit('newReminder', {
      id: note.id,
      text,
      reminderTime: reminder
    });
  }
}

function deleteNote(id) {
  saveNotes(getNotes().filter(note => note.id !== id));
  renderNotes();
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// практика 15. динамические страницы из папки content
async function loadPage(url) {
  try {
    const res = await fetch(url);
    app.innerHTML = await res.text();
    updateActiveLink(url);

    if (url.includes('/content/home.html')) {
      initNotesPage();
    }
  } catch (err) {
    app.innerHTML = '<p class="loading">Не получилось загрузить страницу. Попробуйте обновить.</p>';
    console.error('Ошибка загрузки страницы:', err);
  }
}

// практика 15. подсвечиваем активную ссылку в App Shell
function updateActiveLink(url) {
  document.querySelectorAll('[data-link]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === url);
  });
}

function initNotesPage() {
  const form = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  const remForm = document.getElementById('reminder-form');
  const reminderText = document.getElementById('reminder-text');
  const reminderTime = document.getElementById('reminder-time');
  const list = document.getElementById('notes-list');

  // практика 13. обработчик submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();

    if (text) {
      addNote(text);
      input.value = '';
    }
  });

  // практика 17. обработчик формы с проверкой даты
  remForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = reminderText.value.trim();
    const time = new Date(reminderTime.value).getTime();

    if (!text || !time) {
      return;
    }

    if (time <= Date.now()) {
      alert('Дата напоминания должна быть в будущем');
      return;
    }

    addNote(text, time);
    reminderText.value = '';
    reminderTime.value = '';
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete]');
    if (btn) {
      deleteNote(Number(btn.dataset.delete));
    }
  });

  renderNotes();
  initPushButtons();
}

async function initPushButtons() {
  const onBtn = document.getElementById('enable-push');
  const offBtn = document.getElementById('disable-push');
  const status = document.getElementById('push-status');

  if (!onBtn || !offBtn || !status) {
    return;
  }

  if (!('Notification' in window)) {
    onBtn.disabled = true;
    status.textContent = 'Уведомления не поддерживаются в этом браузере';
    return;
  }

  // практика 16
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    onBtn.disabled = true;
    status.textContent = 'Push API не поддерживается в этом браузере';
    return;
  }

  // ждем готовый Service Worker перед созданием push подписки
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  setPushButtonsState(Boolean(sub));

  onBtn.addEventListener('click', subscribeToPush);
  offBtn.addEventListener('click', unsubscribeFromPush);
}

// практика 16. меняем вид кнопок в зависимости от наличия подписки
function setPushButtonsState(on) {
  const onBtn = document.getElementById('enable-push');
  const offBtn = document.getElementById('disable-push');
  const status = document.getElementById('push-status');

  if (!onBtn || !offBtn || !status) {
    return;
  }

  onBtn.hidden = on;
  offBtn.hidden = !on;
  status.textContent = on ? 'Уведомления включены' : 'Уведомления выключены';
}

async function subscribeToPush() {
  const status = document.getElementById('push-status');

  try {
    status.textContent = 'Создаю подписку...';

    // практика 16. просим разрешение браузера на уведомления
    const ok = await Notification.requestPermission();

    if (ok !== 'granted') {
      status.textContent = 'Уведомления не разрешены';
      alert('Нужно разрешить уведомления в браузере');
      return;
    }

    // получаем Service Worker registration
    const reg = await navigator.serviceWorker.ready;
    // берем публичный ключ с сервера
    const res = await fetch('/vapidPublicKey');
    const key = await res.text();

    // PushManager создает подписку браузера
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });

    // отправляем подписку на /subscribe
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });

    setPushButtonsState(true);
  } catch (err) {
    console.error('Ошибка подписки:', err);
    status.textContent = 'Не получилось включить уведомления';
    alert('Не получилось включить уведомления. Попробуй открыть http://localhost:3001 и обновить страницу через Ctrl + F5.');
  }
}

async function unsubscribeFromPush() {
  // получаем текущую подписку
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    setPushButtonsState(false);
    return;
  }

  // сообщаем серверу удалить подписку
  await fetch('/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint })
  });

  // отключаем подписку в браузере
  await sub.unsubscribe();
  setPushButtonsState(false);
}

function urlBase64ToUint8Array(str) {
  const pad = '='.repeat((4 - str.length % 4) % 4);
  const b64 = (str + pad).replaceAll('-', '+').replaceAll('_', '/');
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

// практика 15. перехватываем клики по меню и загружаем content без полной перезагрузки
document.querySelectorAll('[data-link]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    loadPage(a.getAttribute('href'));
  });
});

// практика 16. принимаем событие taskAdded от сервера
if (socket) {
  socket.on('taskAdded', task => {
    console.log('Задача от другого клиента:', task);
    showToast(`Новая задача: ${task.text}`);
  });
}

// практика 13. регистрируем Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await reg.update();
      console.log('Service Worker зарегистрирован');
    } catch (err) {
      console.error('Ошибка регистрации Service Worker:', err);
    }
  });
}

// практика 15. стартовая динамическая страница внутри App Shell
loadPage('/content/home.html?v=15');
