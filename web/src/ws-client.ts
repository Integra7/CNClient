import type { ClientMessage, ServerMessage } from './types';
import {
  WS_URL,
  ACK_TIMEOUT_MS,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
} from './config';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export type MessageHandler = (msg: ServerMessage) => void;
export type StateHandler = (state: ConnectionState) => void;

export class ChatWsClient {
  private ws: WebSocket | null = null;
  private token: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSends: Array<ClientMessage> = [];
  private ackTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly onMessage: MessageHandler;
  private readonly onStateChange: StateHandler;

  constructor(onMessage: MessageHandler, onStateChange: StateHandler) {
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
  }

  connect(token: string): void {
    this.token = token;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.onStateChange('connecting');
    const url = `${WS_URL}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onStateChange('connected');
      this.flushPending();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === 'ping') {
          this.send({ type: 'pong' });
          return;
        }
        if (msg.type === 'ack' && msg.clientMessageId) {
          this.clearAckTimeout(msg.clientMessageId);
        }
        this.onMessage(msg);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.onStateChange('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // close will be fired after error
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || !this.token) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this.ackTimeouts.forEach((t) => clearTimeout(t));
    this.ackTimeouts.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStateChange('disconnected');
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingSends.push(msg);
    }
  }

  private flushPending(): void {
    while (this.pendingSends.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.pendingSends.shift();
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  sendMessage(chatId: string, content: string, clientMessageId: string): void {
    const msg: ClientMessage = {
      type: 'message',
      chatId,
      content,
      clientMessageId,
    };
    this.send(msg);
    this.setAckTimeout(clientMessageId);
  }

  private setAckTimeout(clientMessageId: string): void {
    this.clearAckTimeout(clientMessageId);
    const timer = setTimeout(() => {
      this.ackTimeouts.delete(clientMessageId);
      this.onMessage({
        type: 'error',
        error: 'Нет подтверждения доставки (timeout)',
        clientMessageId,
      });
    }, ACK_TIMEOUT_MS);
    this.ackTimeouts.set(clientMessageId, timer);
  }

  private clearAckTimeout(clientMessageId: string): void {
    const t = this.ackTimeouts.get(clientMessageId);
    if (t) {
      clearTimeout(t);
      this.ackTimeouts.delete(clientMessageId);
    }
  }

  createUser(username: string, email: string, password: string): void {
    this.send({
      type: 'create_user',
      content: JSON.stringify({ username, email, password }),
    });
  }

  /** Вход по учётным данным (бэкенд должен вернуть login_success с id) */
  login(username: string, password: string): void {
    this.send({
      type: 'login',
      content: JSON.stringify({ username, password }),
    });
  }

  /** Проверить существование пользователя по username (ответ: user_found или error) */
  findUser(username: string): void {
    this.send({
      type: 'find_user',
      content: username,
    });
  }

  /** Получить или создать личный чат с пользователем по username (если бэкенд поддерживает) */
  getOrCreatePrivateChat(username: string): void {
    this.send({
      type: 'get_or_create_private_chat',
      content: JSON.stringify({ username }),
    });
  }

  /** Первое сообщение пользователю по username — бэкенд создаёт чат и может вернуть chatId в ack */
  sendMessageToUser(recipientUsername: string, content: string, clientMessageId: string): void {
    this.send({
      type: 'message_to_user',
      content: JSON.stringify({ recipientUsername, content }),
      clientMessageId,
    });
    this.setAckTimeout(clientMessageId);
  }

  getChats(): void {
    this.send({ type: 'get_chats' });
  }

  getMessages(chatId: string, params?: { limit?: number; offset?: number; afterSequence?: number }): void {
    const content = params ? JSON.stringify(params) : undefined;
    this.send({ type: 'get_messages', chatId, content });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
