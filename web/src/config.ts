// Адрес бэкенда WebSocket
// Можно задать через переменную окружения VITE_WS_URL
// Или использовать автоматическое определение
const getBackendUrl = (): string => {
  // 1. Проверяем переменную окружения (для деплоя)
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  
  // 2. В режиме разработки используем localhost
  if (import.meta.env.DEV) {
    return 'ws://localhost:8080/chat';
  }
  
  // 3. В production используем тот же хост (если клиент и бэкенд на одном домене)
  // Или можно задать конкретный адрес Serveo
  const serveoUrl = 'fd33de80cca4a0ab-146-158-125-45.serveousercontent.com';
  return `wss://${serveoUrl}/chat`;
};

export const WS_URL = getBackendUrl();

export const ACK_TIMEOUT_MS = 5000;
export const PING_INTERVAL_MS = 30000;
export const RECONNECT_DELAY_MS = 2000;
export const MAX_RECONNECT_ATTEMPTS = 10;

export const STORAGE_TOKEN_KEY = 'cn_token';
export const STORAGE_CHAT_ID_KEY = 'cn_chat_id';
export const STORAGE_MESSAGES_PREFIX = 'cn_msgs_';
export const STORAGE_SELECTED_CHAT_PREFIX = 'cn_sel_';
export const STORAGE_CHAT_NAMES_PREFIX = 'cn_chat_names_';
