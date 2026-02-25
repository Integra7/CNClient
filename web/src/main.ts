import { ChatWsClient } from './ws-client';
import type {
  ServerMessage,
  DisplayMessage,
  PendingMessage,
} from './types';
import type { ChatFromServer, MessageFromServer } from './types';
import { setSessionToken, getSessionToken, clearSessionToken } from './session';
import {
  loadMessagesForUser,
  saveMessagesForUser,
  loadSelectedChatId,
  saveSelectedChatId,
  loadChatNames,
  saveChatNames,
  loadLastRead,
  saveLastRead,
} from './persistence';
import './styles.css';

const NOTIFICATION_SOUND_URL = `${import.meta.env.BASE_URL}sounds/when-604.mp3`;

function playNotificationSound(): void {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {}
}

function showMessageNotification(senderName: string, bodyPreview: string): void {
  const isTabVisible = document.visibilityState === 'visible';

  if (isTabVisible) {
    showInPageToast(senderName, bodyPreview);
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(senderName, {
        body: bodyPreview,
        icon: `${import.meta.env.BASE_URL}favicon.ico`,
        tag: 'cn-msg',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 5000);
    } catch {}
  }
}

function showInPageToast(title: string, body: string): void {
  const toast = document.createElement('div');
  toast.className = 'cn-toast';
  const preview = body.length > 80 ? body.slice(0, 80) + '…' : body;
  toast.innerHTML = `
    <span class="cn-toast-title">${escapeHtml(title)}</span>
    <span class="cn-toast-body">${escapeHtml(preview)}</span>
  `;
  toast.addEventListener('click', () => {
    toast.remove();
    window.focus();
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('cn-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('cn-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

const loginScreen = document.getElementById('login-screen') as HTMLElement;
const appMain = document.getElementById('app-main') as HTMLElement;
const loginUsername = document.getElementById('login-username') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginError = document.getElementById('login-error') as HTMLElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
const showRegisterBtn = document.getElementById('show-register-btn') as HTMLButtonElement;
const registerBlock = document.getElementById('register-block') as HTMLElement;
const loginFormBlock = document.getElementById('login-form-block') as HTMLElement;
const regUsername = document.getElementById('reg-username') as HTMLInputElement;
const regEmail = document.getElementById('reg-email') as HTMLInputElement;
const regPassword = document.getElementById('reg-password') as HTMLInputElement;
const registerBtn = document.getElementById('register-btn') as HTMLButtonElement;
const registerResult = document.getElementById('register-result') as HTMLElement;
const registerUsernameError = document.getElementById('register-username-error') as HTMLElement;
const registerEmailError = document.getElementById('register-email-error') as HTMLElement;
const hideRegisterBtn = document.getElementById('hide-register-btn') as HTMLButtonElement;
const notificationsBtn = document.getElementById('notifications-btn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;

const statusEl = document.getElementById('status') as HTMLElement;
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;
const chatSection = document.getElementById('chat-section') as HTMLElement;
const newChatUsernameInput = document.getElementById('new-chat-username') as HTMLInputElement;
const findUserResult = document.getElementById('find-user-result') as HTMLElement;
const chatListEl = document.getElementById('chat-list') as HTMLUListElement;
const chatPlaceholder = document.getElementById('chat-placeholder') as HTMLElement;
const chatPanel = document.getElementById('chat-panel') as HTMLElement;
const chatHeader = document.getElementById('chat-header') as HTMLElement;
const chatBackBtn = document.getElementById('chat-back-btn') as HTMLButtonElement;
const messagesEl = document.getElementById('messages') as HTMLElement;
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;

let wsClient: ChatWsClient | null = null;
let authClient: ChatWsClient | null = null;
const messagesByChat = new Map<string, DisplayMessage[]>();
const pendingByClientId = new Map<string, PendingMessage>();
const chatNames: Record<string, string> = {};
let currentUserId: string = '';
let selectedChatId: string = '';
let composeToUsername: string | null = null;
let pendingUsernameForChat: string | null = null;
let pendingOpenComposeUsername: string | null = null;
let findUserDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let authConnectionTimeout: ReturnType<typeof setTimeout> | null = null;

let lastReadByChat: Record<string, number> = {};
let unreadByChat: Record<string, number> = {};

function persistMessages(): void {
  if (currentUserId) saveMessagesForUser(currentUserId, messagesByChat);
}

function persistChatNames(): void {
  if (currentUserId) saveChatNames(currentUserId, chatNames);
}

function recomputeUnreadFromMessages(): void {
  unreadByChat = {};
  for (const [chatId, list] of messagesByChat) {
    const threshold = lastReadByChat[chatId] ?? 0;
    const count = list.filter((m) => !m.isOwn && m.timestamp > threshold).length;
    if (count > 0) unreadByChat[chatId] = count;
  }
}

function updateBackButtonUnread(): void {
  const total = Object.values(unreadByChat).reduce((s, n) => s + n, 0);
  chatBackBtn.textContent = total > 0 ? `← Чаты (${total})` : '← Чаты';
}

function setConnectionState(state: 'disconnected' | 'connecting' | 'connected'): void {
  statusEl.textContent = state === 'connected' ? 'Подключено' : state === 'connecting' ? 'Подключение…' : 'Отключено';
  statusEl.dataset.state = state;
  disconnectBtn.disabled = state !== 'connected';
  chatSection.hidden = state !== 'connected';
  if (state === 'connected') {
    wsClient?.getChats();
    renderChatList();
    updateBackButtonUnread();
    if (selectedChatId) {
      chatSection.classList.add('chat-open');
      chatPlaceholder.setAttribute('hidden', '');
      chatPanel.removeAttribute('hidden');
      chatHeader.textContent = chatNames[selectedChatId] ?? shortId(selectedChatId);
      renderMessages(selectedChatId);
      wsClient?.getMessages(selectedChatId);
    } else if (composeToUsername) {
      chatSection.classList.add('chat-open');
      chatPlaceholder.setAttribute('hidden', '');
      chatPanel.removeAttribute('hidden');
      chatHeader.textContent = `@${composeToUsername}`;
      renderComposePending();
      messageInput.focus();
    } else {
      chatSection.classList.remove('chat-open');
      chatPlaceholder.removeAttribute('hidden');
      chatPanel.setAttribute('hidden', '');
    }
  }
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '…';
}

function getChatIdsSorted(): string[] {
  const ids: string[] = [];
  const lastTime = new Map<string, number>();
  for (const [chatId, list] of messagesByChat) {
    const last = list.length > 0 ? list[list.length - 1] : undefined;
    if (last) {
      ids.push(chatId);
      lastTime.set(chatId, last.timestamp);
    }
  }
  for (const chatId of Object.keys(chatNames)) {
    if (!ids.includes(chatId)) ids.push(chatId);
    if (!lastTime.has(chatId)) lastTime.set(chatId, 0);
  }
  return ids.sort((a, b) => (lastTime.get(b) ?? 0) - (lastTime.get(a) ?? 0));
}

function renderChatList(): void {
  chatListEl.innerHTML = '';
  const ids = getChatIdsSorted();
  for (const chatId of ids) {
    const list = messagesByChat.get(chatId) ?? [];
    const last = list.length > 0 ? list[list.length - 1] : undefined;
    const rawPreview = last ? (last.content.slice(0, 30) + (last.content.length > 30 ? '…' : '')) : 'Нет сообщений';
    const preview = last?.isOwn ? `Вы: ${rawPreview}` : rawPreview;
    const timeStr = last ? formatChatListTime(last.timestamp) : '';
    const displayName = chatNames[chatId] ?? shortId(chatId);
    const unread = unreadByChat[chatId] ?? 0;
    const unreadBadge = unread > 0 ? `<span class="chat-unread-badge">${unread > 99 ? '99+' : unread}</span>` : '';
    const li = document.createElement('li');
    li.dataset.chatId = chatId;
    li.className = selectedChatId === chatId ? 'selected' : '';
    li.innerHTML = `
      <span class="chat-id-row">
        <span class="chat-id">${escapeHtml(displayName)}</span>
        ${unreadBadge}
      </span>
      <span class="chat-preview-row">
        <span class="chat-preview">${escapeHtml(preview)}</span>
        <span class="chat-time">${escapeHtml(timeStr)}</span>
      </span>
    `;
    li.addEventListener('click', () => selectChat(chatId));
    chatListEl.appendChild(li);
  }
}

function selectChat(chatId: string): void {
  selectedChatId = chatId;
  composeToUsername = null;
  if (currentUserId) saveSelectedChatId(currentUserId, chatId);
  unreadByChat[chatId] = 0;
  const list = messagesByChat.get(chatId) ?? [];
  const lastTs = list.length > 0 ? Math.max(...list.map((m) => m.timestamp)) : 0;
  lastReadByChat[chatId] = Math.max(lastReadByChat[chatId] ?? 0, lastTs, Date.now());
  if (currentUserId) saveLastRead(currentUserId, lastReadByChat);
  chatSection.classList.add('chat-open');
  chatPlaceholder.setAttribute('hidden', '');
  chatPanel.removeAttribute('hidden');
  chatHeader.textContent = chatNames[chatId] ?? shortId(chatId);
  renderChatList();
  updateBackButtonUnread();
  renderMessages(chatId);
  wsClient?.getMessages(chatId);
  messageInput.focus();
}

function getChatIdByUsername(username: string): string | null {
  const u = username.toLowerCase();
  for (const [chatId, name] of Object.entries(chatNames)) {
    if (name.toLowerCase() === u) return chatId;
  }
  return null;
}

function openComposeToUsername(username: string): void {
  composeToUsername = username;
  selectedChatId = '';
  chatSection.classList.add('chat-open');
  chatPlaceholder.setAttribute('hidden', '');
  chatPanel.removeAttribute('hidden');
  chatHeader.textContent = `@${username}`;
  renderComposePending();
  renderChatList();
  messageInput.focus();
}

function backToChatList(): void {
  selectedChatId = '';
  composeToUsername = null;
  chatSection.classList.remove('chat-open');
  chatPlaceholder.removeAttribute('hidden');
  chatPanel.setAttribute('hidden', '');
  chatHeader.textContent = '';
  renderChatList();
}

function openChatWithUser(username: string): void {
  const existingChatId = getChatIdByUsername(username);
  if (existingChatId) {
    selectChat(existingChatId);
  } else {
    openComposeToUsername(username);
  }
}

function renderComposePending(): void {
  messagesEl.innerHTML = '';
  const pendingList = [...pendingByClientId.values()].filter((p) => p.chatId === '');
  for (const p of pendingList) {
    const div = document.createElement('div');
    div.className = 'message own';
    div.innerHTML = `
      <span class="content">${escapeHtml(p.content)}</span>
      <span class="meta">⏳ ${formatTime(p.sentAt)}</span>
    `;
    messagesEl.appendChild(div);
  }
  scrollMessagesToBottom();
}

function handleAuthMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'login_success': {
      const token = msg.id;
      if (token) {
        setSessionToken(token);
        authClient?.disconnect();
        authClient = null;
        showApp(token);
      }
      break;
    }
    case 'user_created': {
      const token = msg.id ?? null;
      if (token) {
        setSessionToken(token);
        authClient?.disconnect();
        authClient = null;
        registerBlock.hidden = true;
        registerResult.textContent = '';
        showApp(token);
      }
      break;
    }
    case 'error': {
      const err = msg.error ?? 'Ошибка';
      loginError.textContent = err;
      loginError.hidden = false;
      clearRegisterFieldErrors();
      if (err === 'Username already exists') {
        registerUsernameError.textContent = 'Этот username уже занят';
        registerUsernameError.hidden = false;
        regUsername.classList.add('field-error');
        regUsername.focus();
        registerResult.textContent = '';
      } else if (err === 'Email already exists') {
        registerEmailError.textContent = 'Этот email уже используется';
        registerEmailError.hidden = false;
        regEmail.classList.add('field-error');
        regEmail.focus();
        registerResult.textContent = '';
      } else {
        registerResult.textContent = err;
        registerResult.dataset.status = 'error';
      }
      break;
    }
    default:
      break;
  }
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'user_found': {
      const content = msg.content;
      let users: Array<{ id: string; username: string }> = [];
      try {
        const data = typeof content === 'string' ? JSON.parse(content) : content;
        if (Array.isArray(data)) {
          users = data.filter((u: unknown) => u && typeof u === 'object' && 'username' in u).map((u: { id?: string; username?: string }) => ({ id: String(u.id ?? ''), username: String(u.username ?? '') }));
        } else if (data && typeof data === 'object' && Array.isArray(data.users)) {
          users = data.users.map((u: { id?: string; username?: string }) => ({ id: String(u.id ?? ''), username: String(u.username ?? '') }));
        } else if (data?.username) {
          users = [{ id: String(data.id ?? ''), username: String(data.username) }];
        }
      } catch {}
      users = users.filter((u) => u.id !== currentUserId);
      if (users.length === 0) {
        findUserResult.innerHTML = '';
        findUserResult.textContent = 'Пользователь не найден';
        findUserResult.className = 'find-user-result not-found';
        findUserResult.hidden = false;
        findUserResult.title = '';
        pendingOpenComposeUsername = null;
      } else {
        findUserResult.innerHTML = '';
        findUserResult.className = 'find-user-result found';
        findUserResult.hidden = false;
        findUserResult.title = 'Нажмите на пользователя, чтобы открыть чат';
        for (const u of users) {
          const item = document.createElement('div');
          item.className = 'find-user-item';
          item.textContent = `✓ @${u.username}`;
          item.dataset.username = u.username;
          item.title = `Открыть чат с @${u.username}`;
          findUserResult.appendChild(item);
        }
        const first = users[0];
        if (users.length === 1 && pendingOpenComposeUsername && first && first.username.toLowerCase() === pendingOpenComposeUsername.toLowerCase()) {
          pendingOpenComposeUsername = null;
          openChatWithUser(first.username);
        } else {
          pendingOpenComposeUsername = null;
        }
      }
      break;
    }
    case 'error': {
      if (pendingOpenComposeUsername) {
        findUserResult.textContent = 'Пользователь не найден';
        findUserResult.className = 'find-user-result not-found';
        findUserResult.hidden = false;
        findUserResult.title = '';
        pendingOpenComposeUsername = null;
      }
      if (msg.clientMessageId) {
        const pending = pendingByClientId.get(msg.clientMessageId);
        if (pending) {
          pending.status = 'failed';
          pendingByClientId.delete(msg.clientMessageId);
          persistMessages();
          renderChatList();
          if (selectedChatId === pending.chatId) renderMessages(selectedChatId);
        }
      }
      if (pendingUsernameForChat) {
        pendingUsernameForChat = null;
      }
      break;
    }
    case 'chat':
    case 'chat_created': {
      const chatId = (msg as ServerMessage & { chatId?: string }).chatId ?? msg.id;
      if (chatId) {
        if (pendingUsernameForChat) {
          chatNames[chatId] = pendingUsernameForChat;
          persistChatNames();
          pendingUsernameForChat = null;
        }
        if (!messagesByChat.has(chatId)) messagesByChat.set(chatId, []);
        selectChat(chatId);
      }
      break;
    }
    case 'chats_list': {
      if (!msg.content) break;
      try {
        const data = JSON.parse(msg.content) as { chats?: ChatFromServer[] };
        const chats = data.chats ?? [];
        for (const c of chats) {
          chatNames[c.id] = c.name ?? chatNames[c.id] ?? shortId(c.id);
          if (!messagesByChat.has(c.id)) messagesByChat.set(c.id, []);
        }
        persistChatNames();
        renderChatList();
      } catch {}
      break;
    }
    case 'messages_list': {
      if (!msg.chatId || !msg.content) break;
      try {
        const data = JSON.parse(msg.content) as { messages?: MessageFromServer[] };
        const list = messagesByChat.get(msg.chatId) ?? [];
        const existingIds = new Set(list.map((m) => m.id));
        for (const m of data.messages ?? []) {
          if (m.isDeleted) continue;
          if (existingIds.has(m.id)) continue;
          existingIds.add(m.id);
          list.push({
            id: m.id,
            clientMessageId: m.clientMessageId ?? undefined,
            chatId: m.chatId,
            senderId: m.senderId,
            content: m.content,
            sequenceNumber: m.sequenceNumber,
            timestamp: m.createdAt ?? m.updatedAt ?? 0,
            status: 'sent',
            isOwn: m.senderId === currentUserId,
          });
        }
        list.sort((a, b) => a.timestamp - b.timestamp);
        messagesByChat.set(msg.chatId, list);
        persistMessages();
        renderChatList();
        if (selectedChatId === msg.chatId) renderMessages(selectedChatId);
      } catch {}
      break;
    }
    case 'ack': {
      if (!msg.clientMessageId || !msg.id) break;
      const pending = pendingByClientId.get(msg.clientMessageId);
      if (!pending) break;
      const ackChatId = (msg as ServerMessage & { chatId?: string }).chatId;
      if (pending.chatId === '' && ackChatId) {
        pending.chatId = ackChatId;
        if (composeToUsername) {
          chatNames[ackChatId] = composeToUsername;
          persistChatNames();
          selectedChatId = ackChatId;
          if (currentUserId) saveSelectedChatId(currentUserId, ackChatId);
          composeToUsername = null;
          chatHeader.textContent = chatNames[ackChatId] ?? shortId(ackChatId);
        }
        const list = messagesByChat.get(ackChatId) ?? [];
        const idx = list.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        if (idx === -1) {
          list.push({
            id: msg.id,
            clientMessageId: msg.clientMessageId,
            chatId: ackChatId,
            senderId: currentUserId,
            content: pending.content,
            timestamp: pending.sentAt,
            status: 'sent',
            isOwn: true,
          });
          list.sort((a, b) => a.timestamp - b.timestamp);
          messagesByChat.set(ackChatId, list);
        } else {
          const item = list[idx];
          if (item) {
            item.id = msg.id;
            item.status = 'sent';
          }
        }
      } else if (pending.chatId !== '') {
        const list = messagesByChat.get(pending.chatId) ?? [];
        const idx = list.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        const item = idx !== -1 ? list[idx] : undefined;
        if (item && msg.id) {
          item.id = msg.id;
          item.status = 'sent';
        }
        messagesByChat.set(pending.chatId, list);
      }
      pending.status = 'sent';
      pendingByClientId.delete(msg.clientMessageId);
      persistMessages();
      renderChatList();
      if (selectedChatId) renderMessages(selectedChatId);
      break;
    }
    case 'message':
      if (msg.chatId && msg.senderId != null && msg.content != null) {
        if (composeToUsername && !chatNames[msg.chatId]) {
          chatNames[msg.chatId] = composeToUsername;
          persistChatNames();
          selectedChatId = msg.chatId;
          if (currentUserId) saveSelectedChatId(currentUserId, msg.chatId);
          composeToUsername = null;
        }
        const extendedMsg = msg as ServerMessage & { senderUsername?: string };
        if (extendedMsg.senderUsername && msg.senderId !== currentUserId) {
          const currentName = chatNames[msg.chatId];
          if (!currentName || currentName === shortId(msg.chatId)) {
            chatNames[msg.chatId] = extendedMsg.senderUsername;
            persistChatNames();
          }
        }
        const list = messagesByChat.get(msg.chatId) ?? [];
        const existing = list.some(
          (m) => m.id === msg.id || m.clientMessageId === msg.clientMessageId
        );
        if (!existing) {
          list.push({
            id: msg.id ?? crypto.randomUUID(),
            clientMessageId: msg.clientMessageId,
            chatId: msg.chatId,
            senderId: msg.senderId,
            content: msg.content,
            sequenceNumber: msg.sequenceNumber,
            timestamp: msg.timestamp ?? Date.now(),
            status: 'sent',
            isOwn: msg.senderId === currentUserId,
          });
          list.sort((a, b) => a.timestamp - b.timestamp);
          messagesByChat.set(msg.chatId, list);
          persistMessages();
          if (msg.senderId !== currentUserId) {
            playNotificationSound();
            if (selectedChatId !== msg.chatId) {
              unreadByChat[msg.chatId] = (unreadByChat[msg.chatId] ?? 0) + 1;
              const name = chatNames[msg.chatId] ?? 'Новое сообщение';
              const preview = typeof msg.content === 'string' ? msg.content : '';
              showMessageNotification(name, preview);
            } else if (document.visibilityState !== 'visible') {
              const name = chatNames[msg.chatId] ?? 'Новое сообщение';
              const preview = typeof msg.content === 'string' ? msg.content : '';
              showMessageNotification(name, preview);
            }
          }
          if (selectedChatId === msg.chatId) {
            unreadByChat[msg.chatId] = 0;
            const ts = msg.timestamp ?? Date.now();
            lastReadByChat[msg.chatId] = Math.max(lastReadByChat[msg.chatId] ?? 0, ts);
            if (currentUserId) saveLastRead(currentUserId, lastReadByChat);
          }
          renderChatList();
          updateBackButtonUnread();
          if (selectedChatId === msg.chatId) renderMessages(selectedChatId);
        }
      }
      break;
    default:
      break;
  }
}

function renderMessages(chatId: string): void {
  messagesEl.innerHTML = '';
  const list = messagesByChat.get(chatId) ?? [];
  const pendingList = [...pendingByClientId.values()].filter((p) => p.chatId === chatId);
  const combined: DisplayMessage[] = [
    ...list,
    ...pendingList.map((p): DisplayMessage => ({
      id: p.clientMessageId,
      clientMessageId: p.clientMessageId,
      chatId: p.chatId,
      senderId: currentUserId,
      content: p.content,
      timestamp: p.sentAt,
      status: p.status,
      isOwn: true,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  for (const m of combined) {
    const div = document.createElement('div');
    div.className = `message ${m.isOwn ? 'own' : 'other'}`;
    const status = m.status === 'sending' ? '⏳' : m.status === 'failed' ? '❌' : '';
    div.innerHTML = `
      <span class="content">${escapeHtml(m.content)}</span>
      <span class="meta">${status} ${formatTime(m.timestamp)}</span>
    `;
    messagesEl.appendChild(div);
  }
  scrollMessagesToBottom();
}

function scrollMessagesToBottom(): void {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatChatListTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (msgDay.getTime() === yesterday.getTime()) {
    return 'вчера';
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function showApp(token: string): void {
  loginScreen.setAttribute('hidden', '');
  appMain.removeAttribute('hidden');
  currentUserId = token;
  if (wsClient) wsClient.disconnect();
  wsClient = new ChatWsClient(handleServerMessage, setConnectionState);
  const saved = loadMessagesForUser(token);
  saved.forEach((list, chatId) => messagesByChat.set(chatId, list));
  Object.assign(chatNames, loadChatNames(token));
  lastReadByChat = loadLastRead(token);
  recomputeUnreadFromMessages();
  const savedChat = loadSelectedChatId(token);
  if (savedChat) selectedChatId = savedChat;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    notificationsBtn.textContent = 'Уведомления ✓';
    notificationsBtn.title = 'Уведомления включены';
  }
  wsClient.connect(token);
}

function logout(): void {
  wsClient?.disconnect();
  wsClient = null;
  currentUserId = '';
  selectedChatId = '';
  composeToUsername = null;
  lastReadByChat = {};
  unreadByChat = {};
  clearSessionToken();
  appMain.setAttribute('hidden', '');
  loginScreen.removeAttribute('hidden');
  loginError.hidden = true;
  registerBlock.hidden = true;
  loginFormBlock.hidden = false;
  registerResult.textContent = '';
}

function disconnect(): void {
  wsClient?.disconnect();
  setConnectionState('disconnected');
}

function tryLoginWithCredentials(): void {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) {
    loginError.textContent = 'Введите имя и пароль';
    loginError.hidden = false;
    return;
  }
  loginError.hidden = true;
  loginError.textContent = '';
  if (authConnectionTimeout) clearTimeout(authConnectionTimeout);
  authConnectionTimeout = null;
  if (authClient) authClient.disconnect();
  authClient = new ChatWsClient(handleAuthMessage, (state) => {
    if (state === 'connected') {
      if (authConnectionTimeout) clearTimeout(authConnectionTimeout);
      authConnectionTimeout = null;
      authClient?.login(username, password);
    }
  });
  authClient.connect('');
  authConnectionTimeout = setTimeout(() => {
    if (!authClient?.connected) {
      loginError.textContent = 'Не удалось подключиться. Проверьте интернет и попробуйте снова.';
      loginError.hidden = false;
    }
    authConnectionTimeout = null;
  }, 10000);
}

function tryRegister(): void {
  const username = regUsername.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value;
  if (!username || !email || !password) {
    registerResult.textContent = 'Заполните все поля';
    registerResult.dataset.status = 'error';
    return;
  }
  if (username.length < 3 || username.length > 50) {
    registerResult.textContent = 'Имя пользователя: 3–50 символов';
    registerResult.dataset.status = 'error';
    return;
  }
  if (password.length < 6) {
    registerResult.textContent = 'Пароль: минимум 6 символов';
    registerResult.dataset.status = 'error';
    return;
  }
  registerResult.textContent = 'Отправка…';
  registerResult.dataset.status = '';
  clearRegisterFieldErrors();
  if (authConnectionTimeout) clearTimeout(authConnectionTimeout);
  authConnectionTimeout = null;
  if (authClient) authClient.disconnect();
  authClient = new ChatWsClient(handleAuthMessage, (state) => {
    if (state === 'connected') {
      if (authConnectionTimeout) clearTimeout(authConnectionTimeout);
      authConnectionTimeout = null;
      authClient?.createUser(username, email, password);
    }
  });
  authClient.connect('');
  authConnectionTimeout = setTimeout(() => {
    if (!authClient?.connected) {
      registerResult.textContent = 'Не удалось подключиться к серверу.';
      registerResult.dataset.status = 'error';
    }
    authConnectionTimeout = null;
  }, 10000);
}

function clearRegisterFieldErrors(): void {
  registerUsernameError.textContent = '';
  registerUsernameError.hidden = true;
  registerEmailError.textContent = '';
  registerEmailError.hidden = true;
  regUsername.classList.remove('field-error');
  regEmail.classList.remove('field-error');
}

function sendMessage(): void {
  const content = messageInput.value.trim();
  if (!content || !wsClient?.connected) return;
  const clientMessageId = crypto.randomUUID();
  if (composeToUsername && !selectedChatId) {
    const pending: PendingMessage = {
      clientMessageId,
      content,
      chatId: '',
      status: 'sending',
      sentAt: Date.now(),
    };
    pendingByClientId.set(clientMessageId, pending);
    wsClient.sendMessageToUser(composeToUsername, content, clientMessageId);
    messageInput.value = '';
    renderComposePending();
    return;
  }
  const chatId = selectedChatId;
  if (!chatId) return;
  const pending: PendingMessage = {
    clientMessageId,
    content,
    chatId,
    status: 'sending',
    sentAt: Date.now(),
  };
  pendingByClientId.set(clientMessageId, pending);
  const list = messagesByChat.get(chatId) ?? [];
  list.push({
    id: clientMessageId,
    clientMessageId,
    chatId,
    senderId: currentUserId,
    content,
    timestamp: pending.sentAt,
    status: 'sending',
    isOwn: true,
  });
  list.sort((a, b) => a.timestamp - b.timestamp);
  messagesByChat.set(chatId, list);
  wsClient.sendMessage(chatId, content, clientMessageId);
  messageInput.value = '';
  persistMessages();
  renderChatList();
  renderMessages(chatId);
}

loginBtn.addEventListener('click', tryLoginWithCredentials);
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLoginWithCredentials();
});
showRegisterBtn.addEventListener('click', () => {
  loginFormBlock.hidden = true;
  registerBlock.hidden = false;
});
hideRegisterBtn.addEventListener('click', () => {
  registerBlock.hidden = true;
  loginFormBlock.hidden = false;
  registerResult.textContent = '';
  clearRegisterFieldErrors();
});
regUsername.addEventListener('input', () => {
  registerUsernameError.hidden = true;
  regUsername.classList.remove('field-error');
});
regEmail.addEventListener('input', () => {
  registerEmailError.hidden = true;
  regEmail.classList.remove('field-error');
});
registerBtn.addEventListener('click', tryRegister);
disconnectBtn.addEventListener('click', disconnect);
notificationsBtn.addEventListener('click', async () => {
  if (typeof Notification === 'undefined') return;
  const p = await Notification.requestPermission();
  notificationsBtn.title = p === 'granted' ? 'Уведомления включены' : p === 'denied' ? 'Уведомления заблокированы' : 'Включить уведомления в фоне';
  if (p === 'granted') notificationsBtn.textContent = 'Уведомления ✓';
});
logoutBtn.addEventListener('click', logout);
chatBackBtn.addEventListener('click', backToChatList);
findUserResult.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.find-user-item');
  if (item && item instanceof HTMLElement && item.dataset.username) {
    openChatWithUser(item.dataset.username);
  }
});
newChatUsernameInput.addEventListener('input', () => {
  const username = newChatUsernameInput.value.trim();
  if (findUserDebounceTimer) clearTimeout(findUserDebounceTimer);
  findUserResult.hidden = true;
  if (!username) return;
  findUserDebounceTimer = setTimeout(() => {
    findUserDebounceTimer = null;
    if (!wsClient?.connected) return;
    findUserResult.hidden = false;
    findUserResult.textContent = 'Поиск…';
    findUserResult.className = 'find-user-result searching';
    wsClient.findUser(username);
  }, 1000);
});
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

const savedToken = getSessionToken();
if (savedToken) {
  showApp(savedToken);
} else {
  loginScreen.removeAttribute('hidden');
  appMain.setAttribute('hidden', '');
}
