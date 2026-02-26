import type { DisplayMessage } from '../types';

export function getChatIdsSorted(
  messagesByChat: Record<string, DisplayMessage[]>,
  chatNames: Record<string, string>,
  deletedChatIdsForMe: string[]
): string[] {
  const ids: string[] = [];
  const lastTime = new Map<string, number>();
  for (const [chatId, list] of Object.entries(messagesByChat)) {
    const last = list.length > 0 ? list[list.length - 1] : undefined;
    if (last) {
      ids.push(chatId);
      lastTime.set(chatId, last.timestamp);
    }
  }
  for (const chatId of Object.keys(chatNames)) {
    if (deletedChatIdsForMe.includes(chatId)) continue;
    if (!ids.includes(chatId)) ids.push(chatId);
    if (!lastTime.has(chatId)) lastTime.set(chatId, 0);
  }
  return ids.sort((a, b) => (lastTime.get(b) ?? 0) - (lastTime.get(a) ?? 0));
}
