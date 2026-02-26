import { useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { shortId } from '../utils/format';
import { MessageList } from './MessageList';
import { SelectionToolbar } from './SelectionToolbar';

interface ChatPanelProps {
  chatIds: string[];
}

export function ChatPanel({ chatIds }: ChatPanelProps) {
  const { state, dispatch, wsClientRef } = useApp();
  const messageInputRef = useRef<HTMLInputElement>(null);

  const selectedChatId = state.selectedChatId;
  const composeToUsername = state.composeToUsername;

  useEffect(() => {
    if (state.connectionState === 'connected' && selectedChatId) {
      wsClientRef.current?.getMessages(selectedChatId);
    }
  }, [state.connectionState, selectedChatId, wsClientRef]);

  useEffect(() => {
    messageInputRef.current?.focus();
  }, [selectedChatId, composeToUsername]);

  const backToChatList = useCallback(() => {
    dispatch({ type: 'BACK_TO_LIST' });
  }, [dispatch]);

  const totalUnread = chatIds.reduce((s, id) => s + (state.unreadByChat[id] ?? 0), 0);
  const backButtonText = totalUnread > 0 ? `← Чаты (${totalUnread})` : '← Чаты';

  const headerTitle = selectedChatId
    ? (state.chatNames[selectedChatId] ?? shortId(selectedChatId))
    : composeToUsername
      ? `@${composeToUsername}`
      : '';

  const sendMessage = useCallback(() => {
    const input = messageInputRef.current;
    const content = input?.value.trim();
    if (!content || !wsClientRef.current?.connected) return;
    const clientMessageId = crypto.randomUUID();

    if (composeToUsername && !selectedChatId) {
      dispatch({
        type: 'ADD_PENDING',
        payload: {
          clientMessageId,
          content,
          chatId: '',
          status: 'sending',
          sentAt: Date.now(),
        },
      });
      wsClientRef.current.sendMessageToUser(composeToUsername, content, clientMessageId);
      if (input) input.value = '';
      return;
    }

    if (!selectedChatId) return;
    dispatch({
      type: 'ADD_PENDING',
      payload: {
        clientMessageId,
        content,
        chatId: selectedChatId,
        status: 'sending',
        sentAt: Date.now(),
      },
    });
    const list = state.messagesByChat[selectedChatId] ?? [];
    const newMsg = {
      id: clientMessageId,
      clientMessageId,
      chatId: selectedChatId,
      senderId: state.currentUserId,
      content,
      timestamp: Date.now(),
      status: 'sending' as const,
      isOwn: true,
    };
    dispatch({
      type: 'MERGE_MESSAGES',
      payload: {
        chatId: selectedChatId,
        messages: [...list, newMsg].sort((a, b) => a.timestamp - b.timestamp),
      },
    });
    wsClientRef.current.sendMessage(selectedChatId, content, clientMessageId);
    if (input) input.value = '';
  }, [
    composeToUsername,
    selectedChatId,
    state.currentUserId,
    state.messagesByChat,
    dispatch,
    wsClientRef,
  ]);

  const chatIdForMessages = selectedChatId || (composeToUsername ? '' : '');

  return (
    <div id="chat-panel" className="chat-panel">
      <div className="chat-panel-header">
        <button
          type="button"
          className="chat-back-btn"
          aria-label="К списку чатов"
          onClick={backToChatList}
        >
          {backButtonText}
        </button>
        <div id="chat-header">{headerTitle}</div>
      </div>
      <div className="chat-messages-wrap">
        <SelectionToolbar />
        <MessageList
          chatId={chatIdForMessages}
          isCompose={!!composeToUsername && !selectedChatId}
        />
      </div>
      <div className="send-row">
        <input
          ref={messageInputRef}
          id="message-input"
          type="text"
          placeholder="Сообщение..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button type="button" id="send" onClick={sendMessage}>
          Отправить
        </button>
      </div>
    </div>
  );
}
