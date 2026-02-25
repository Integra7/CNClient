import type { DisplayMessage } from './types';
import { STORAGE_MESSAGES_PREFIX, STORAGE_SELECTED_CHAT_PREFIX, STORAGE_CHAT_NAMES_PREFIX, STORAGE_LAST_READ_PREFIX } from './config';

export function loadMessagesForUser(userId: string): Map<string, DisplayMessage[]> {
  const key = `${STORAGE_MESSAGES_PREFIX}${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, DisplayMessage[]>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export function saveMessagesForUser(userId: string, byChat: Map<string, DisplayMessage[]>): void {
  const key = `${STORAGE_MESSAGES_PREFIX}${userId}`;
  const obj = Object.fromEntries(byChat);
  localStorage.setItem(key, JSON.stringify(obj));
}

export function loadSelectedChatId(userId: string): string | null {
  const key = `${STORAGE_SELECTED_CHAT_PREFIX}${userId}`;
  return localStorage.getItem(key);
}

export function saveSelectedChatId(userId: string, chatId: string): void {
  const key = `${STORAGE_SELECTED_CHAT_PREFIX}${userId}`;
  localStorage.setItem(key, chatId);
}

export function loadChatNames(userId: string): Record<string, string> {
  const key = `${STORAGE_CHAT_NAMES_PREFIX}${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveChatNames(userId: string, names: Record<string, string>): void {
  const key = `${STORAGE_CHAT_NAMES_PREFIX}${userId}`;
  localStorage.setItem(key, JSON.stringify(names));
}

export function loadLastRead(userId: string): Record<string, number> {
  const key = `${STORAGE_LAST_READ_PREFIX}${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveLastRead(userId: string, lastRead: Record<string, number>): void {
  const key = `${STORAGE_LAST_READ_PREFIX}${userId}`;
  localStorage.setItem(key, JSON.stringify(lastRead));
}
