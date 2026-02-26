import type { DisplayMessage } from '../types';

/** Сортировка чатов от недавних к давним по времени последнего сообщения. */
export function getChatIdsSorted(
  messagesByChat: Record<string, DisplayMessage[]>,
  chatNames: Record<string, string>,
  deletedChatIdsForMe: string[],
  chatLastMessageTime?: Record<string, number>
): string[] {
  const ids: string[] = [];
  const lastTime = new Map<string, number>();
  for (const [chatId, list] of Object.entries(messagesByChat)) {
    const last = list.length > 0 ? list[list.length - 1] : undefined;
    const fromMessages = last?.timestamp ?? 0;
    const fromServer = chatLastMessageTime?.[chatId] ?? 0;
    const ts = Math.max(fromMessages, fromServer);
    if (ts > 0 || last) ids.push(chatId);
    if (ts > 0) lastTime.set(chatId, ts);
  }
  for (const chatId of Object.keys(chatNames)) {
    if (deletedChatIdsForMe.includes(chatId)) continue;
    if (!ids.includes(chatId)) ids.push(chatId);
    const fromMessages = (messagesByChat[chatId] ?? []).length > 0
      ? (messagesByChat[chatId] ?? [])[(messagesByChat[chatId] ?? []).length - 1]!.timestamp
      : 0;
    const fromServer = chatLastMessageTime?.[chatId] ?? 0;
    const ts = Math.max(fromMessages, fromServer);
    if (!lastTime.has(chatId)) lastTime.set(chatId, ts);
  }
  return ids.sort((a, b) => (lastTime.get(b) ?? 0) - (lastTime.get(a) ?? 0));
}
