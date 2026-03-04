import type { DisplayMessage } from '../types';
import type { AppState, AppAction } from './types';

function setMessageStatus(
  msg: DisplayMessage,
  status: DisplayMessage['status']
): DisplayMessage {
  return { ...msg, status };
}

function replaceInList(
  list: DisplayMessage[],
  id: string,
  updater: (m: DisplayMessage) => DisplayMessage
): DisplayMessage[] {
  return list.map((m) => (m.id === id || m.clientMessageId === id ? updater(m) : m));
}

function removeFromList(list: DisplayMessage[], messageId: string): DisplayMessage[] {
  return list.filter((m) => m.id !== messageId);
}

export const initialAppState: AppState = {
  connectionState: 'disconnected',
  currentUserId: '',
  messagesByChat: {},
  pendingByClientId: {},
  chatNames: {},
  chatLastMessageTime: {},
  chatLastMessagePreview: {},
  selectedChatId: '',
  composeToUsername: null,
  lastReadByChat: {},
  unreadByChat: {},
  selectedMessageIds: [],
  replyingToMessageIds: [],
  deletedMessageIdsForMe: [],
  deletedChatIdsForMe: [],
  findUser: { status: 'idle', users: [], pendingOpenUsername: null },
  loginError: '',
  showRegister: false,
  register: {
    usernameError: '',
    emailError: '',
    result: '',
    resultStatus: '',
  },
  contextMenu: null,
  modal: null,
  pendingDeleteMessageIds: [],
  modalDeleteForAll: false,
  modalDeleteChatId: '',
  modalDeleteChatForBoth: false,
  editMessageTarget: null,
  editMessageContent: '',
  notificationsPermission: null,
  showNotificationsBanner: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.payload };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        currentUserId: action.payload,
        loginError: '',
        showRegister: false,
        register: initialAppState.register,
      };

    case 'LOGOUT':
      return {
        ...initialAppState,
        notificationsPermission: state.notificationsPermission,
      };

    case 'SET_MESSAGES': {
      const { chatId, messages } = action.payload;
      return {
        ...state,
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...messages],
        },
      };
    }

    case 'MERGE_MESSAGES': {
      const { chatId, messages } = action.payload;
      const existing = state.messagesByChat[chatId] ?? [];
      const byId = new Map(existing.map((m) => [m.id, m]));
      for (const m of messages) {
        const current = byId.get(m.id);
        if (current) {
          byId.set(m.id, { ...current, ...m });
        } else {
          byId.set(m.id, m);
        }
      }
      const merged = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
      return {
        ...state,
        messagesByChat: { ...state.messagesByChat, [chatId]: merged },
      };
    }

    case 'UPDATE_MESSAGE_STATUS': {
      const { chatId, messageId, status } = action.payload;
      const list = state.messagesByChat[chatId] ?? [];
      const next = replaceInList(list, messageId, (m) => setMessageStatus(m, status));
      return {
        ...state,
        messagesByChat: { ...state.messagesByChat, [chatId]: next },
      };
    }

    case 'ADD_PENDING': {
      const payload = action.payload;
      const preview = payload.content.slice(0, 30) + (payload.content.length > 30 ? '…' : '');
      return {
        ...state,
        pendingByClientId: {
          ...state.pendingByClientId,
          [payload.clientMessageId]: payload,
        },
        chatLastMessagePreview:
          payload.chatId
            ? {
                ...state.chatLastMessagePreview,
                [payload.chatId]: { text: preview, isOwn: true },
              }
            : state.chatLastMessagePreview,
      };
    }
    case 'REMOVE_PENDING': {
      const { [action.payload]: _, ...rest } = state.pendingByClientId;
      return { ...state, pendingByClientId: rest };
    }

    case 'ACK_MESSAGE': {
      const { clientMessageId, serverId, chatId } = action.payload;
      const pending = state.pendingByClientId[clientMessageId];
      if (!pending) return state;
      const ackChatId = chatId ?? pending.chatId;
      let messagesByChat = { ...state.messagesByChat };
      const list = messagesByChat[ackChatId] ?? [];
      const idx = list.findIndex((m) => m.clientMessageId === clientMessageId);
      if (idx >= 0) {
        const arr = [...list];
        const item = arr[idx];
        if (item) {
          arr[idx] = { ...item, id: serverId, status: 'sent' as const };
        }
        messagesByChat = { ...messagesByChat, [ackChatId]: arr };
      } else {
        const newMsg: DisplayMessage = {
          id: serverId,
          clientMessageId,
          chatId: ackChatId,
          senderId: state.currentUserId,
          content: pending.content,
          timestamp: pending.sentAt,
          status: 'sent',
          isOwn: true,
        };
        const arr = [...list, newMsg].sort((a, b) => a.timestamp - b.timestamp);
        messagesByChat = { ...messagesByChat, [ackChatId]: arr };
      }
      const { [clientMessageId]: __, ...pendingRest } = state.pendingByClientId;
      return {
        ...state,
        messagesByChat,
        pendingByClientId: pendingRest,
        ...(ackChatId && pending.chatId === '' ? { selectedChatId: ackChatId, composeToUsername: null } : {}),
      };
    }

    case 'SET_CHAT_NAMES':
      return { ...state, chatNames: { ...action.payload } };
    case 'SET_CHAT_LAST_MESSAGE_TIMES':
      return { ...state, chatLastMessageTime: { ...action.payload } };
    case 'SET_CHAT_LAST_MESSAGE_TIME':
      return {
        ...state,
        chatLastMessageTime: {
          ...state.chatLastMessageTime,
          [action.payload.chatId]: Math.max(
            state.chatLastMessageTime[action.payload.chatId] ?? 0,
            action.payload.time
          ),
        },
      };
    case 'SET_CHAT_LAST_MESSAGE_PREVIEW': {
      const { chatId, text, isOwn, attachmentKind } = action.payload;
      return {
        ...state,
        chatLastMessagePreview: {
          ...state.chatLastMessagePreview,
          [chatId]: { text, isOwn, attachmentKind },
        },
      };
    }
    case 'SET_CHAT_NAME':
      return {
        ...state,
        chatNames: { ...state.chatNames, [action.payload.chatId]: action.payload.name },
      };

    case 'SELECT_CHAT':
      return {
        ...state,
        selectedChatId: action.payload,
        composeToUsername: null,
        unreadByChat: { ...state.unreadByChat, [action.payload]: 0 },
      };

    case 'OPEN_COMPOSE':
      return {
        ...state,
        composeToUsername: action.payload,
        selectedChatId: '',
      };

    case 'BACK_TO_LIST':
      return {
        ...state,
        selectedChatId: '',
        composeToUsername: null,
        selectedMessageIds: [],
      };

    case 'SET_LAST_READ': {
      const { chatId, ts } = action.payload;
      const prev = state.lastReadByChat[chatId] ?? 0;
      const nextTs = Math.max(prev, ts, Date.now());
      return {
        ...state,
        lastReadByChat: { ...state.lastReadByChat, [chatId]: nextTs },
        unreadByChat: { ...state.unreadByChat, [chatId]: 0 },
      };
    }

    case 'RECOMPUTE_UNREAD': {
      const unreadByChat: Record<string, number> = {};
      for (const [chatId, list] of Object.entries(state.messagesByChat)) {
        const threshold = state.lastReadByChat[chatId] ?? 0;
        const count = list.filter((m) => !m.isOwn && m.timestamp > threshold).length;
        if (count > 0) unreadByChat[chatId] = count;
      }
      return { ...state, unreadByChat };
    }

    case 'INCREMENT_UNREAD': {
      const chatId = action.payload;
      const cur = state.unreadByChat[chatId] ?? 0;
      return {
        ...state,
        unreadByChat: { ...state.unreadByChat, [chatId]: cur + 1 },
      };
    }

    case 'CLEAR_UNREAD':
      return {
        ...state,
        unreadByChat: { ...state.unreadByChat, [action.payload]: 0 },
      };

    case 'TOGGLE_MESSAGE_SELECTION': {
      const id = action.payload;
      const set = new Set(state.selectedMessageIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...state, selectedMessageIds: Array.from(set) };
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedMessageIds: [], replyingToMessageIds: [] };
    case 'SET_REPLYING_TO':
      return { ...state, replyingToMessageIds: action.payload ?? [] };

    case 'DELETE_MESSAGE_FOR_ME':
      return {
        ...state,
        deletedMessageIdsForMe: [...state.deletedMessageIdsForMe, action.payload],
      };

    case 'DELETE_MESSAGE_FROM_CHAT': {
      const { chatId, messageId } = action.payload;
      const list = state.messagesByChat[chatId] ?? [];
      const next = removeFromList(list, messageId);
      return {
        ...state,
        messagesByChat: { ...state.messagesByChat, [chatId]: next },
      };
    }

    case 'DELETE_CHAT_FOR_ME':
      return {
        ...state,
        deletedChatIdsForMe: [...state.deletedChatIdsForMe, action.payload],
        ...(state.selectedChatId === action.payload
          ? { selectedChatId: '', composeToUsername: null, selectedMessageIds: [] }
          : {}),
      };

    case 'DELETE_CHAT_FOR_BOTH': {
      const chatId = action.payload;
      const { [chatId]: _, ...messagesByChat } = state.messagesByChat;
      const { [chatId]: __, ...chatNames } = state.chatNames;
      return {
        ...state,
        messagesByChat,
        chatNames,
        ...(state.selectedChatId === chatId
          ? { selectedChatId: '', composeToUsername: null, selectedMessageIds: [] }
          : {}),
      };
    }

    case 'EDIT_MESSAGE_CONTENT': {
      const { chatId, messageId, content, editedAt } = action.payload;
      const list = state.messagesByChat[chatId] ?? [];
      const next = replaceInList(list, messageId, (m) => ({ ...m, content, editedAt }));
      return {
        ...state,
        messagesByChat: { ...state.messagesByChat, [chatId]: next },
      };
    }

    case 'SET_MESSAGE_READ': {
      const { chatId, messageIds } = action.payload;
      const list = state.messagesByChat[chatId] ?? [];
      const set = new Set(messageIds);
      const next = list.map((m) =>
        set.has(m.id) && m.isOwn ? { ...m, status: 'read' as const } : m
      );
      return {
        ...state,
        messagesByChat: { ...state.messagesByChat, [chatId]: next },
      };
    }

    case 'FIND_USER_START':
      return {
        ...state,
        findUser: {
          status: 'searching',
          users: [],
          pendingOpenUsername: action.payload,
        },
      };

    case 'FIND_USER_RESULT':
      return {
        ...state,
        findUser: {
          status: 'found',
          users: action.payload.users,
          pendingOpenUsername: action.payload.pendingOpenUsername,
        },
      };

    case 'FIND_USER_NOT_FOUND':
      return {
        ...state,
        findUser: {
          status: 'not-found',
          users: [],
          pendingOpenUsername: action.payload,
        },
      };

    case 'SET_LOGIN_ERROR':
      return { ...state, loginError: action.payload };

    case 'SHOW_REGISTER':
      return { ...state, showRegister: true };
    case 'HIDE_REGISTER':
      return {
        ...state,
        showRegister: false,
        register: initialAppState.register,
      };

    case 'REGISTER_USER_CREATED':
      return {
        ...state,
        showRegister: false,
        register: initialAppState.register,
      };

    case 'REGISTER_ERROR': {
      const { message, field } = action.payload;
      const reg = state.register;
      if (field === 'username') {
        return {
          ...state,
          register: {
            ...reg,
            usernameError: message,
            emailError: '',
            result: '',
            resultStatus: 'error',
          },
        };
      }
      if (field === 'email') {
        return {
          ...state,
          register: {
            ...reg,
            emailError: message,
            usernameError: '',
            result: '',
            resultStatus: 'error',
          },
        };
      }
      return {
        ...state,
        register: { ...reg, result: message, resultStatus: 'error' },
      };
    }

    case 'REGISTER_SET_RESULT':
      return {
        ...state,
        register: {
          ...state.register,
          result: action.payload.result,
          resultStatus: action.payload.status,
        },
      };

    case 'CLEAR_REGISTER_FIELD_ERRORS':
      return {
        ...state,
        register: {
          ...state.register,
          usernameError: '',
          emailError: '',
        },
      };

    case 'SHOW_CONTEXT_MENU':
      return {
        ...state,
        contextMenu: {
          x: action.payload.x,
          y: action.payload.y,
          target: { type: 'chat', chatId: action.payload.chatId },
        },
      };
    case 'HIDE_CONTEXT_MENU':
      return { ...state, contextMenu: null };

    case 'OPEN_MODAL_DELETE_MESSAGES':
      return {
        ...state,
        modal: 'delete-messages',
        pendingDeleteMessageIds: action.payload,
        modalDeleteForAll: false,
      };
    case 'OPEN_MODAL_DELETE_CHAT':
      return {
        ...state,
        modal: 'delete-chat',
        modalDeleteChatId: action.payload,
        modalDeleteChatForBoth: false,
      };
    case 'OPEN_MODAL_FORWARD':
      return { ...state, modal: 'forward' };
    case 'OPEN_MODAL_EDIT_MESSAGE':
      return {
        ...state,
        modal: 'edit-message',
        editMessageTarget: {
          chatId: action.payload.chatId,
          messageId: action.payload.messageId,
        },
        editMessageContent: action.payload.content,
      };
    case 'CLOSE_MODAL':
      return {
        ...state,
        modal: null,
        pendingDeleteMessageIds: [],
        editMessageTarget: null,
      };
    case 'SET_MODAL_DELETE_FOR_ALL':
      return { ...state, modalDeleteForAll: action.payload };
    case 'SET_MODAL_DELETE_CHAT_FOR_BOTH':
      return { ...state, modalDeleteChatForBoth: action.payload };
    case 'SET_EDIT_MESSAGE_CONTENT':
      return { ...state, editMessageContent: action.payload };

    case 'SET_NOTIFICATIONS_PERMISSION':
      return { ...state, notificationsPermission: action.payload };
    case 'SET_SHOW_NOTIFICATIONS_BANNER':
      return { ...state, showNotificationsBanner: action.payload };

    case 'INIT_STATE':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}
