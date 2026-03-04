import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { ChatWsClient } from '../ws-client';
import { setSessionToken, getSessionToken, clearSessionToken } from '../session';
import {
  loadMessagesForUser,
  saveMessagesForUser,
  loadSelectedChatId,
  saveSelectedChatId,
  loadChatNames,
  saveChatNames,
  loadLastRead,
  saveLastRead,
} from '../persistence';
import { appReducer, initialAppState } from '../store/reducer';
import type { AppState, AppAction } from '../store/types';
import { createServerMessageHandler } from '../store/serverMessageHandler';
import { shortId } from '../utils/format';
import { playNotificationSound, showMessageNotification, showInPageToast } from '../utils/notifications';
import { createCallManager } from '../callManager';
import type { CallManager } from '../callManager';
import type { ClientMessage } from '../types';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  getState: () => AppState;
  wsClientRef: React.MutableRefObject<ChatWsClient | null>;
  authClientRef: React.MutableRefObject<ChatWsClient | null>;
  callManagerRef: React.MutableRefObject<CallManager | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function persistState(s: AppState): void {
  if (!s.currentUserId) return;
  const messagesMap = new Map(Object.entries(s.messagesByChat));
  saveMessagesForUser(s.currentUserId, messagesMap);
  saveChatNames(s.currentUserId, s.chatNames);
  saveLastRead(s.currentUserId, s.lastReadByChat);
  if (s.selectedChatId) saveSelectedChatId(s.currentUserId, s.selectedChatId);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const getState = useCallback(() => stateRef.current, []);
  const wsClientRef = useRef<ChatWsClient | null>(null);
  const authClientRef = useRef<ChatWsClient | null>(null);
  const callManagerRef = useRef<CallManager | null>(null);

  const onNotify = useCallback((senderName: string, bodyPreview: string) => {
    playNotificationSound();
    showMessageNotification(senderName, bodyPreview, showInPageToast);
  }, []);

  useEffect(() => {
    if (!state.currentUserId) return;
    persistState(state);
  }, [
    state.currentUserId,
    state.messagesByChat,
    state.chatNames,
    state.lastReadByChat,
    state.selectedChatId,
  ]);

  useEffect(() => {
    if (!state.currentUserId) return;
    const token = state.currentUserId;
    if (wsClientRef.current) wsClientRef.current.disconnect();
    callManagerRef.current = null;

    const send = (msg: ClientMessage) => {
      wsClientRef.current?.send(msg);
    };
    const callManager = createCallManager(send, dispatch);
    callManagerRef.current = callManager;

    const handleServerMessage = createServerMessageHandler(
      dispatch,
      getState,
      shortId,
      persistState,
      onNotify,
      callManager
    );

    const client = new ChatWsClient(handleServerMessage, (connectionState) => {
      dispatch({ type: 'SET_CONNECTION_STATE', payload: connectionState });
    });
    wsClientRef.current = client;
    const saved = loadMessagesForUser(token);
    const messagesByChat: Record<string, import('../types').DisplayMessage[]> = {};
    saved.forEach((list, chatId) => {
      // Убираем устаревшие forwardFrom/forwardBatchId из кэша, иначе старые сохранённые
      // сообщения продолжают отображаться как «пересланные». Актуальное состояние придёт с сервера при запросе messages_list.
      messagesByChat[chatId] = list.map(({ forwardFrom, forwardBatchId, ...m }) => m);
    });
    const chatNames = loadChatNames(token);
    let lastReadByChat = loadLastRead(token);
    const selectedChatId = loadSelectedChatId(token) ?? '';
    // Чат, который был открыт при последнем визите, считаем прочитанным до последнего сообщения
    if (selectedChatId) {
      const list = messagesByChat[selectedChatId] ?? [];
      const lastTs = list.length > 0 ? Math.max(...list.map((m) => m.timestamp)) : 0;
      const current = lastReadByChat[selectedChatId] ?? 0;
      lastReadByChat = {
        ...lastReadByChat,
        [selectedChatId]: Math.max(current, lastTs, Date.now()),
      };
    }
    const unreadByChat: Record<string, number> = {};
    for (const [chatId, list] of Object.entries(messagesByChat)) {
      const threshold = lastReadByChat[chatId] ?? 0;
      const count = list.filter((m) => !m.isOwn && m.timestamp > threshold).length;
      if (count > 0) unreadByChat[chatId] = count;
    }
    dispatch({
      type: 'INIT_STATE',
      payload: {
        messagesByChat,
        chatNames,
        lastReadByChat,
        selectedChatId,
        unreadByChat,
      },
    });
    client.connect(token);
    client.getChats();
    return () => {
      client.disconnect();
      wsClientRef.current = null;
      callManagerRef.current = null;
    };
  }, [state.currentUserId, getState, onNotify]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppContextValue = {
    state,
    dispatch,
    getState,
    wsClientRef,
    authClientRef,
    callManagerRef,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { getSessionToken, setSessionToken, clearSessionToken };
