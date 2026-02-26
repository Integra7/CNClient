import { useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { shortId, formatChatListTime } from '../utils/format';

const FIND_USER_DEBOUNCE_MS = 1000;

interface SidebarProps {
  chatIds: string[];
}

function getChatIdByUsername(
  chatNames: Record<string, string>,
  username: string
): string | null {
  const u = username.toLowerCase();
  for (const [chatId, name] of Object.entries(chatNames)) {
    if (name.toLowerCase() === u) return chatId;
  }
  return null;
}

export function Sidebar({ chatIds }: SidebarProps) {
  const { state, dispatch, wsClientRef } = useApp();
  const findUserDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newChatInputRef = useRef<HTMLInputElement>(null);

  const openChatWithUser = useCallback(
    (username: string) => {
      const chatId = getChatIdByUsername(state.chatNames, username);
      if (chatId) {
        dispatch({ type: 'SELECT_CHAT', payload: chatId });
        const list = state.messagesByChat[chatId] ?? [];
        const lastTs =
          list.length > 0 ? Math.max(...list.map((m) => m.timestamp)) : 0;
        dispatch({
          type: 'SET_LAST_READ',
          payload: {
            chatId,
            ts: Math.max(state.lastReadByChat[chatId] ?? 0, lastTs, Date.now()),
          },
        });
      } else {
        dispatch({ type: 'OPEN_COMPOSE', payload: username });
      }
    },
    [state.chatNames, state.messagesByChat, state.lastReadByChat, dispatch]
  );

  useEffect(() => {
    const input = newChatInputRef.current;
    if (!input) return;
    const onInput = () => {
      const username = input.value.trim();
      if (findUserDebounceRef.current) clearTimeout(findUserDebounceRef.current);
      if (!username) {
        dispatch({
          type: 'FIND_USER_NOT_FOUND',
          payload: null,
        });
        return;
      }
      findUserDebounceRef.current = setTimeout(() => {
        findUserDebounceRef.current = null;
        if (!wsClientRef.current?.connected) return;
        dispatch({ type: 'FIND_USER_START', payload: username });
        wsClientRef.current.findUser(username);
      }, FIND_USER_DEBOUNCE_MS);
    };
    input.addEventListener('input', onInput);
    return () => {
      input.removeEventListener('input', onInput);
      if (findUserDebounceRef.current) clearTimeout(findUserDebounceRef.current);
    };
  }, [dispatch, wsClientRef]);

  useEffect(() => {
    const fu = state.findUser;
    if (fu.status !== 'found' || fu.users.length !== 1 || !fu.pendingOpenUsername) return;
    const first = fu.users[0];
    if (first && first.username.toLowerCase() === fu.pendingOpenUsername.toLowerCase()) {
      openChatWithUser(first.username);
      dispatch({
        type: 'FIND_USER_RESULT',
        payload: { users: fu.users, pendingOpenUsername: null },
      });
    }
  }, [state.findUser, openChatWithUser, dispatch]);

  const selectChat = useCallback(
    (chatId: string) => {
      dispatch({ type: 'SELECT_CHAT', payload: chatId });
      const list = state.messagesByChat[chatId] ?? [];
      const lastTs =
        list.length > 0 ? Math.max(...list.map((m) => m.timestamp)) : 0;
      dispatch({
        type: 'SET_LAST_READ',
        payload: {
          chatId,
          ts: Math.max(state.lastReadByChat[chatId] ?? 0, lastTs, Date.now()),
        },
      });
    },
    [state.messagesByChat, state.lastReadByChat, dispatch]
  );

  return (
    <aside className="sidebar">
      <h2>Мои чаты</h2>
      <div className="new-chat-row">
        <input
          ref={newChatInputRef}
          id="new-chat-username"
          type="text"
          placeholder="Имя пользователя (username)"
          autoComplete="off"
        />
      </div>
      <FindUserResult
        findUser={state.findUser}
        onSelectUser={openChatWithUser}
      />
      <p className="sidebar-hint">Введите username и выберите пользователя из списка.</p>
      <ul id="chat-list">
        {chatIds.map((chatId) => {
          const list = state.messagesByChat[chatId] ?? [];
          const last = list.length > 0 ? list[list.length - 1] : undefined;
          const rawPreview = last
            ? last.content.slice(0, 30) + (last.content.length > 30 ? '…' : '')
            : 'Нет сообщений';
          const preview = last?.isOwn ? `Вы: ${rawPreview}` : rawPreview;
          const timeStr = last ? formatChatListTime(last.timestamp) : '';
          const displayName = state.chatNames[chatId] ?? shortId(chatId);
          const unread = state.unreadByChat[chatId] ?? 0;
          const unreadBadge =
            unread > 0 ? (
              <span className="chat-unread-badge">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null;
          return (
            <li
              key={chatId}
              data-chat-id={chatId}
              className={state.selectedChatId === chatId ? 'selected' : ''}
              onClick={() => selectChat(chatId)}
              onContextMenu={(e) => {
                e.preventDefault();
                dispatch({
                  type: 'SHOW_CONTEXT_MENU',
                  payload: { x: e.clientX, y: e.clientY, chatId },
                });
              }}
            >
              <span className="chat-id-row">
                <span className="chat-id">{displayName}</span>
                {unreadBadge}
              </span>
              <span className="chat-preview-row">
                <span className="chat-preview">{preview}</span>
                <span className="chat-time">{timeStr}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function FindUserResult({
  findUser,
  onSelectUser,
}: {
  findUser: { status: string; users: Array<{ id: string; username: string }> };
  onSelectUser: (username: string) => void;
}) {
  if (findUser.status === 'idle') return null;
  const className =
    findUser.status === 'searching'
      ? 'find-user-result searching'
      : findUser.status === 'found'
        ? 'find-user-result found'
        : 'find-user-result not-found';
  return (
    <div
      id="find-user-result"
      className={className}
      title={
        findUser.status === 'found'
          ? 'Нажмите на пользователя, чтобы открыть чат'
          : undefined
      }
    >
      {findUser.status === 'searching' && 'Поиск…'}
      {findUser.status === 'not-found' && 'Пользователь не найден'}
      {findUser.status === 'found' &&
        findUser.users.map((u) => (
          <div
            key={u.id}
            className="find-user-item"
            data-username={u.username}
            title={`Открыть чат с @${u.username}`}
            onClick={() => onSelectUser(u.username)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              e.key === 'Enter' && onSelectUser(u.username)
            }
          >
            ✓ @{u.username}
          </div>
        ))}
    </div>
  );
}
