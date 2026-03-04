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

/**
 * TURN для звонков с телефона (4G/5G). В .env задать:
 *   VITE_TURN_URL=turn:<хост>:3478
 *   VITE_TURN_USERNAME=cosanostra
 *   VITE_TURN_CREDENTIAL=changeme
 * Хост: localhost (разработка), IP машины в LAN (тест с телефона в Wi‑Fi), домен сервера (прод).
 */
export function getTurnIceServers(): RTCIceServer[] {
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (!url?.trim()) return [];
  const cred = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  const user = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  return [{ urls: url.trim(), credential: cred || undefined, username: user || undefined }];
}

export const STORAGE_TOKEN_KEY = 'cn_token';
export const STORAGE_CHAT_ID_KEY = 'cn_chat_id';
export const STORAGE_MESSAGES_PREFIX = 'cn_msgs_';
export const STORAGE_SELECTED_CHAT_PREFIX = 'cn_sel_';
export const STORAGE_CHAT_NAMES_PREFIX = 'cn_chat_names_';
export const STORAGE_LAST_READ_PREFIX = 'cn_last_read_';
