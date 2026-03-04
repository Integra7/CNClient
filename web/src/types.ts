export interface ClientMessage {
  type: string;
  chatId?: string;
  content?: string;
  clientMessageId?: string;
}

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

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface PendingMessage {
  clientMessageId: string;
  content: string;
  chatId: string;
  status: MessageStatus;
  sentAt: number;
}

/** Элемент replyToData — сообщение, на которое отвечают */
export interface ReplyToMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export interface DisplayMessage {
  id: string;
  clientMessageId?: string;
  chatId: string;
  senderId: string;
  senderUsername?: string;
  content: string;
  sequenceNumber?: number;
  timestamp: number;
  status: MessageStatus;
  isOwn: boolean;
  editedAt?: number;
  forwardFrom?: { senderId: string; senderName: string; originalTimestamp?: number };
  forwardBatchId?: string;
  /** Сообщения, на которые отвечает это сообщение */
  replyTo?: ReplyToMessage[];
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
}

export interface ChatFromServer {
  id: string;
  name: string | null;
  type: 'private' | 'group';
  createdAt: number;
  updatedAt: number;
  lastMessageId: string | null;
  lastMessageTime: number | null;
  /** Превью последнего сообщения (если сервер присылает) */
  lastMessagePreview?: string | null;
  lastMessageIsOwn?: boolean;
}

/** Формат сообщения в ответе бэкенда (messages_list и type: "message") */
export interface MessageFromServer {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername?: string | null;
  content: string;
  clientMessageId: string | null;
  sequenceNumber: number;
  createdAt: number;
  updatedAt: number;
  timestamp?: number;
  status: string;
  isDeleted: boolean;
  editedAt?: number;
  isForwarded?: boolean;
  forwardFromSenderId?: string | null;
  forwardFromSenderName?: string | null;
  forwardFromChatId?: string | null;
  forwardFromTimestamp?: number | null;
  /** Один id на всю пачку пересланных (одно действие пересылки) */
  forwardBatchId?: string | null;
  /** JSON-строка массива ReplyToMessage — сообщения, на которые отвечают */
  replyToData?: string | null;
}
