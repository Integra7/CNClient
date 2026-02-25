/**
 * Сессия: токен хранится в cookie и localStorage.
 * Cookie даёт сохранение после закрытия вкладки на мобильных.
 */

const COOKIE_NAME = 'cn_token';
const COOKIE_MAX_AGE_DAYS = 365; // 1 год
const STORAGE_KEY = 'cn_token';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  const value = match?.[2];
  return value != null ? decodeURIComponent(value) : null;
}

function setCookie(name: string, value: string, maxAgeDays: number): void {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}

/** Сохранить токен сессии (cookie + localStorage) */
export function setSessionToken(token: string): void {
  setCookie(COOKIE_NAME, token, COOKIE_MAX_AGE_DAYS);
  localStorage.setItem(STORAGE_KEY, token);
}

/** Получить токен: сначала из cookie, затем из localStorage */
export function getSessionToken(): string | null {
  const fromCookie = getCookie(COOKIE_NAME);
  if (fromCookie) return fromCookie;
  return localStorage.getItem(STORAGE_KEY);
}

/** Очистить сессию (выход) */
export function clearSessionToken(): void {
  deleteCookie(COOKIE_NAME);
  localStorage.removeItem(STORAGE_KEY);
}
