import type { DisplayMessage, PendingMessage } from '../types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface FindUserState {
  status: 'idle' | 'searching' | 'found' | 'not-found';
  users: Array<{ id: string; username: string }>;
  pendingOpenUsername: string | null;
}

export interface RegisterState {
  usernameError: string;
  emailError: string;
  result: string;
  resultStatus: 'success' | 'error' | '';
}

export interface AppState {
  connectionState: ConnectionState;
  currentUserId: string;
  messagesByChat: Record<string, DisplayMessage[]>;
  pendingByClientId: Record<string, PendingMessage>;
  chatNames: Record<string, string>;
  /** Время последнего сообщения в чате из ответа сервера (chats_list), для сортировки и превью */
  chatLastMessageTime: Record<string, number>;
  /** Текст последнего сообщения по чату (для превью в списке, когда сообщения чата ещё не загружены) */
  chatLastMessagePreview: Record<string, { text: string; isOwn: boolean }>;
  selectedChatId: string;
  composeToUsername: string | null;
  lastReadByChat: Record<string, number>;
  unreadByChat: Record<string, number>;
  selectedMessageIds: string[];
  /** Id сообщений, на которые пользователь вводит ответ (режим «Ответить») */
  replyingToMessageIds: string[];
  deletedMessageIdsForMe: string[];
  deletedChatIdsForMe: string[];
  findUser: FindUserState;
  loginError: string;
  showRegister: boolean;
  register: RegisterState;
  contextMenu: { x: number; y: number; target: { type: 'chat'; chatId: string } } | null;
  modal: 'delete-messages' | 'delete-chat' | 'forward' | 'edit-message' | null;
  pendingDeleteMessageIds: string[];
  modalDeleteForAll: boolean;
  modalDeleteChatId: string;
  modalDeleteChatForBoth: boolean;
  editMessageTarget: { chatId: string; messageId: string } | null;
  editMessageContent: string;
  notificationsPermission: 'default' | 'granted' | 'denied' | null;
  showNotificationsBanner: boolean;
}

export type AppAction =
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  | { type: 'LOGIN_SUCCESS'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_MESSAGES'; payload: { chatId: string; messages: DisplayMessage[] } }
  | { type: 'MERGE_MESSAGES'; payload: { chatId: string; messages: DisplayMessage[] } }
  | { type: 'UPDATE_MESSAGE_STATUS'; payload: { chatId: string; messageId: string; status: DisplayMessage['status'] } }
  | { type: 'ADD_PENDING'; payload: PendingMessage }
  | { type: 'REMOVE_PENDING'; payload: string }
  | { type: 'ACK_MESSAGE'; payload: { clientMessageId: string; serverId: string; chatId?: string } }
  | { type: 'SET_CHAT_NAMES'; payload: Record<string, string> }
  | { type: 'SET_CHAT_LAST_MESSAGE_TIMES'; payload: Record<string, number> }
  | { type: 'SET_CHAT_LAST_MESSAGE_TIME'; payload: { chatId: string; time: number } }
  | { type: 'SET_CHAT_LAST_MESSAGE_PREVIEW'; payload: { chatId: string; text: string; isOwn: boolean } }
  | { type: 'SET_CHAT_NAME'; payload: { chatId: string; name: string } }
  | { type: 'SELECT_CHAT'; payload: string }
  | { type: 'OPEN_COMPOSE'; payload: string }
  | { type: 'BACK_TO_LIST' }
  | { type: 'SET_LAST_READ'; payload: { chatId: string; ts: number } }
  | { type: 'RECOMPUTE_UNREAD' }
  | { type: 'INCREMENT_UNREAD'; payload: string }
  | { type: 'CLEAR_UNREAD'; payload: string }
  | { type: 'TOGGLE_MESSAGE_SELECTION'; payload: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_REPLYING_TO'; payload: string[] | null }
  | { type: 'DELETE_MESSAGE_FOR_ME'; payload: string }
  | { type: 'DELETE_MESSAGE_FROM_CHAT'; payload: { chatId: string; messageId: string } }
  | { type: 'DELETE_CHAT_FOR_ME'; payload: string }
  | { type: 'DELETE_CHAT_FOR_BOTH'; payload: string }
  | { type: 'EDIT_MESSAGE_CONTENT'; payload: { chatId: string; messageId: string; content: string; editedAt: number } }
  | { type: 'SET_MESSAGE_READ'; payload: { chatId: string; messageIds: string[] } }
  | { type: 'FIND_USER_START'; payload: string }
  | { type: 'FIND_USER_RESULT'; payload: { users: Array<{ id: string; username: string }>; pendingOpenUsername: string | null } }
  | { type: 'FIND_USER_NOT_FOUND'; payload: string | null }
  | { type: 'SET_LOGIN_ERROR'; payload: string }
  | { type: 'SHOW_REGISTER' }
  | { type: 'HIDE_REGISTER' }
  | { type: 'REGISTER_USER_CREATED' }
  | { type: 'REGISTER_ERROR'; payload: { message: string; field?: 'username' | 'email' } }
  | { type: 'REGISTER_SET_RESULT'; payload: { result: string; status: '' | 'success' | 'error' } }
  | { type: 'CLEAR_REGISTER_FIELD_ERRORS' }
  | { type: 'SHOW_CONTEXT_MENU'; payload: { x: number; y: number; chatId: string } }
  | { type: 'HIDE_CONTEXT_MENU' }
  | { type: 'OPEN_MODAL_DELETE_MESSAGES'; payload: string[] }
  | { type: 'OPEN_MODAL_DELETE_CHAT'; payload: string }
  | { type: 'OPEN_MODAL_FORWARD' }
  | { type: 'OPEN_MODAL_EDIT_MESSAGE'; payload: { chatId: string; messageId: string; content: string } }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SET_MODAL_DELETE_FOR_ALL'; payload: boolean }
  | { type: 'SET_MODAL_DELETE_CHAT_FOR_BOTH'; payload: boolean }
  | { type: 'SET_EDIT_MESSAGE_CONTENT'; payload: string }
  | { type: 'SET_NOTIFICATIONS_PERMISSION'; payload: 'default' | 'granted' | 'denied' | null }
  | { type: 'SET_SHOW_NOTIFICATIONS_BANNER'; payload: boolean }
  | { type: 'INIT_STATE'; payload: Partial<AppState> };
