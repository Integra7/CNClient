/**
 * Сообщения от клиента к серверу (ClientMessage)
 */
export interface ClientMessage {
  type: string;
  chatId?: string;
  content?: string;
  clientMessageId?: string;
}

/**
 * Сообщения от сервера к клиенту (ServerMessage)
 */
export interface ServerMessage {
  type: string;
  id?: string;
  chatId?: string;
  senderId?: string;
  content?: string;
  clientMessageId?: string;
  sequenceNumber?: number;
  timestamp?: number;
  error?: string;
}

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface PendingMessage {
  clientMessageId: string;
  content: string;
  chatId: string;
  status: MessageStatus;
  sentAt: number;
}

export interface DisplayMessage {
  id: string;
  clientMessageId?: string;
  chatId: string;
  senderId: string;
  content: string;
  sequenceNumber?: number;
  timestamp: number;
  status: MessageStatus;
  isOwn: boolean;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
}

/** Чат из ответа get_chats (chats_list) */
export interface ChatFromServer {
  id: string;
  name: string | null;
  type: 'private' | 'group';
  createdAt: number;
  updatedAt: number;
  lastMessageId: string | null;
  lastMessageTime: number | null;
}

/** Сообщение из ответа get_messages (messages_list) */
export interface MessageFromServer {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  clientMessageId: string | null;
  sequenceNumber: number;
  createdAt: number;
  updatedAt: number;
  status: string;
  isDeleted: boolean;
}
