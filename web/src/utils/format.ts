export function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatChatListTime(ts: number): string {
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

export function shortId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '…';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Имя файла для отображения: не более 15 символов основы + "...." + расширение (например 177264052102163....jpg) */
export function formatFileName(name: string, maxBaseLen = 15): string {
  if (!name || name.length <= maxBaseLen + 5) return name;
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  if (base.length <= maxBaseLen) return name;
  return base.slice(0, maxBaseLen) + '....' + ext;
}
