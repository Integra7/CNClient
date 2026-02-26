import { useApp } from '../context/AppContext';
import { getChatIdsSorted } from '../utils/chatList';
import { shortId } from '../utils/format';

export function Modals() {
  const { state, dispatch, wsClientRef } = useApp();

  const chatIds = getChatIdsSorted(
    state.messagesByChat,
    state.chatNames,
    state.deletedChatIdsForMe
  );

  const closeModals = () => dispatch({ type: 'CLOSE_MODAL' });

  const showOverlay =
    state.modal === 'delete-messages' ||
    state.modal === 'delete-chat' ||
    state.modal === 'forward' ||
    state.modal === 'edit-message';

  if (!showOverlay) return null;

  return (
    <div
      id="modal-overlay"
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      {/* Delete messages */}
      <div
        id="modal-delete-messages"
        className="modal"
        hidden={state.modal !== 'delete-messages'}
      >
        <p id="modal-delete-messages-text">
          {state.pendingDeleteMessageIds.length === 1
            ? 'Удалить сообщение?'
            : `Удалить сообщений: ${state.pendingDeleteMessageIds.length}?`}
        </p>
        {(() => {
          const list = state.selectedChatId
            ? (state.messagesByChat[state.selectedChatId] ?? [])
            : [];
          const toDelete = list.filter((m) =>
            state.pendingDeleteMessageIds.includes(m.id)
          );
          const hasAnyForeign = toDelete.some((m) => !m.isOwn);
          const showDeleteForAll = toDelete.length > 0 && !hasAnyForeign;
          return (
            <>
              <label
                id="modal-delete-messages-for-all-wrap"
                className="modal-checkbox"
                hidden={!showDeleteForAll}
              >
                  <input
                    type="checkbox"
                    id="modal-delete-messages-for-all"
                    checked={state.modalDeleteForAll}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_MODAL_DELETE_FOR_ALL',
                        payload: e.target.checked,
                      })
                    }
                  />
                  Удалить у всех
                </label>
              <div className="modal-buttons">
                <button
                  type="button"
                  id="modal-delete-messages-ok"
                  onClick={() => {
                    const ids = state.pendingDeleteMessageIds;
                    const forEveryone = state.modalDeleteForAll;
                    const cid = state.selectedChatId;
                    if (!ids.length || !cid || !wsClientRef.current) {
                      closeModals();
                      return;
                    }
                    const list = state.messagesByChat[cid] ?? [];
                    for (const messageId of ids) {
                      const m = list.find((x) => x.id === messageId);
                      const forAll = m?.isOwn ? forEveryone : false;
                      wsClientRef.current.deleteMessage(cid, messageId, forAll);
                      if (forAll) {
                        dispatch({
                          type: 'DELETE_MESSAGE_FROM_CHAT',
                          payload: { chatId: cid, messageId },
                        });
                      } else {
                        dispatch({
                          type: 'DELETE_MESSAGE_FOR_ME',
                          payload: messageId,
                        });
                      }
                    }
                    dispatch({ type: 'CLEAR_SELECTION' });
                    closeModals();
                  }}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  id="modal-delete-messages-cancel"
                  onClick={closeModals}
                >
                  Отмена
                </button>
              </div>
            </>
          );
        })()}
      </div>

      {/* Delete chat */}
      <div
        id="modal-delete-chat"
        className="modal"
        hidden={state.modal !== 'delete-chat'}
      >
        <p>Удалить чат?</p>
        <label className="modal-checkbox">
          <input
            type="checkbox"
            id="modal-delete-chat-for-both"
            checked={state.modalDeleteChatForBoth}
            onChange={(e) =>
              dispatch({
                type: 'SET_MODAL_DELETE_CHAT_FOR_BOTH',
                payload: e.target.checked,
              })
            }
          />
          Удалить у обоих участников
        </label>
        <div className="modal-buttons">
          <button
            type="button"
            id="modal-delete-chat-ok"
            onClick={() => {
              const chatId = state.modalDeleteChatId;
              const forBoth = state.modalDeleteChatForBoth;
              if (!chatId || !wsClientRef.current) {
                closeModals();
                return;
              }
              wsClientRef.current.deleteChat(chatId, forBoth);
              if (forBoth) {
                dispatch({ type: 'DELETE_CHAT_FOR_BOTH', payload: chatId });
              } else {
                dispatch({ type: 'DELETE_CHAT_FOR_ME', payload: chatId });
              }
              closeModals();
            }}
          >
            Удалить
          </button>
          <button
            type="button"
            id="modal-delete-chat-cancel"
            onClick={closeModals}
          >
            Отмена
          </button>
        </div>
      </div>

      {/* Forward */}
      <div
        id="modal-forward"
        className="modal"
        hidden={state.modal !== 'forward'}
      >
        <p>Переслать в чат:</p>
        <ul id="modal-forward-chat-list" className="modal-chat-list">
          {chatIds
            .filter((id) => id !== state.selectedChatId)
            .map((cid) => (
              <li
                key={cid}
                data-chat-id={cid}
                onClick={() => {
                  const ids = state.selectedMessageIds;
                  const fromChatId = state.selectedChatId;
                  if (!ids.length || !fromChatId || !wsClientRef.current) return;
                  wsClientRef.current.forwardMessages(ids, fromChatId, cid);
                  dispatch({ type: 'CLEAR_SELECTION' });
                  closeModals();
                }}
              >
                {state.chatNames[cid] ?? shortId(cid)}
              </li>
            ))}
        </ul>
        <div className="modal-buttons">
          <button
            type="button"
            id="modal-forward-cancel"
            onClick={closeModals}
          >
            Отмена
          </button>
        </div>
      </div>

      {/* Edit message */}
      <div
        id="modal-edit-message"
        className="modal"
        hidden={state.modal !== 'edit-message'}
      >
        <p>Редактировать сообщение:</p>
        <input
          type="text"
          id="modal-edit-message-input"
          value={state.editMessageContent}
          onChange={(e) =>
            dispatch({
              type: 'SET_EDIT_MESSAGE_CONTENT',
              payload: e.target.value,
            })
          }
        />
        <div className="modal-buttons">
          <button
            type="button"
            id="modal-edit-message-ok"
            onClick={() => {
              const target = state.editMessageTarget;
              const newContent = state.editMessageContent.trim();
              if (!target || !wsClientRef.current || !newContent) {
                closeModals();
                return;
              }
              wsClientRef.current.editMessage(
                target.chatId,
                target.messageId,
                newContent
              );
              dispatch({
                type: 'EDIT_MESSAGE_CONTENT',
                payload: {
                  chatId: target.chatId,
                  messageId: target.messageId,
                  content: newContent,
                  editedAt: Date.now(),
                },
              });
              closeModals();
            }}
          >
            Сохранить
          </button>
          <button
            type="button"
            id="modal-edit-message-cancel"
            onClick={closeModals}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
