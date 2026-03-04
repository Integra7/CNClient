const getBackendUrl = (): string => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (import.meta.env.DEV) {
    return 'ws://localhost:8080/chat';
  }
  const host = 'cosanostra.serveousercontent.com';
  return `wss://${host}/chat`;
};

export const WS_URL = getBackendUrl();

/** HTTP URL бэкенда для REST (upload signature и т.д.) */
export function getBackendHttpUrl(): string {
  const ws = getBackendUrl();
  const u = ws.replace(/^ws/, 'http').replace(/^wss/, 'https');
  return u.replace(/\/chat\/?$/, '');
}

export const ACK_TIMEOUT_MS = 5000;
export const PING_INTERVAL_MS = 30000;
export const RECONNECT_DELAY_MS = 2000;
export const MAX_RECONNECT_ATTEMPTS = 10;

export const STORAGE_TOKEN_KEY = 'cn_token';
export const STORAGE_CHAT_ID_KEY = 'cn_chat_id';
export const STORAGE_MESSAGES_PREFIX = 'cn_msgs_';
export const STORAGE_SELECTED_CHAT_PREFIX = 'cn_sel_';
export const STORAGE_CHAT_NAMES_PREFIX = 'cn_chat_names_';
export const STORAGE_LAST_READ_PREFIX = 'cn_last_read_';
