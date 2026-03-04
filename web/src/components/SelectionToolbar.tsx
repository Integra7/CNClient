import { useApp } from '../context/AppContext';

export function SelectionToolbar() {
  const { state, dispatch, wsClientRef } = useApp();

  const hasSelection = state.selectedMessageIds.length > 0;
  const selectedChatId = state.selectedChatId;
  const list = selectedChatId ? (state.messagesByChat[selectedChatId] ?? []) : [];
  const singleId =
    state.selectedMessageIds.length === 1 ? state.selectedMessageIds[0]! : null;
  const singleMsg = singleId ? list.find((m) => m.id === singleId) : null;
  const showEdit =
    state.selectedMessageIds.length === 1 && singleMsg?.isOwn === true;
  /** Ответить можно только на чужие; если выбрано хотя бы одно своё — кнопка неактивна */
  const hasOwnInSelection = state.selectedMessageIds.some(
    (id) => list.find((m) => m.id === id)?.isOwn
  );
  const selectedOthersIds = state.selectedMessageIds.filter(
    (id) => !list.find((m) => m.id === id)?.isOwn
  );
  const canReply = selectedOthersIds.length > 0 && !hasOwnInSelection;

  if (!hasSelection) {
    return (
      <div id="selection-toolbar-zone" className="selection-toolbar-zone" />
    );
  }

  const openDeleteModal = () => {
    if (!state.selectedMessageIds.length || !selectedChatId || !wsClientRef.current) return;
    dispatch({
      type: 'OPEN_MODAL_DELETE_MESSAGES',
      payload: state.selectedMessageIds,
    });
  };

  const openForwardModal = () => {
    if (!state.selectedMessageIds.length || !selectedChatId || !wsClientRef.current) return;
    dispatch({ type: 'OPEN_MODAL_FORWARD' });
  };

  const startReply = () => {
    if (!selectedChatId || selectedOthersIds.length === 0) return;
    dispatch({ type: 'SET_REPLYING_TO', payload: selectedOthersIds });
  };

  const openEditModal = () => {
    if (state.selectedMessageIds.length !== 1 || !selectedChatId || !singleId) return;
    const msg = list.find((m) => m.id === singleId);
    if (msg?.isOwn) {
      dispatch({
        type: 'OPEN_MODAL_EDIT_MESSAGE',
        payload: {
          chatId: selectedChatId,
          messageId: singleId,
          content: msg.content,
        },
      });
    }
  };

  const closeSelection = () => {
    dispatch({ type: 'CLEAR_SELECTION' });
    dispatch({ type: 'HIDE_CONTEXT_MENU' });
  };

  return (
    <div
      id="selection-toolbar-zone"
      className="selection-toolbar-zone selection-toolbar-zone-visible"
    >
      <div id="messages-selection-toolbar" className="selection-toolbar">
        <button type="button" onClick={openDeleteModal}>
          Удалить
        </button>
        <button type="button" onClick={openForwardModal}>
          Переслать
        </button>
        <button
          type="button"
          onClick={startReply}
          disabled={!canReply}
          title={canReply ? undefined : 'Можно отвечать только на сообщения других'}
        >
          Ответить
        </button>
        <button
          type="button"
          className="selection-edit-btn"
          style={{ visibility: showEdit ? 'visible' : 'hidden' }}
          disabled={!showEdit}
          onClick={openEditModal}
        >
          <span className="selection-edit-label-full">Редактировать</span>
          <span className="selection-edit-label-short">Ред.</span>
        </button>
        <button
          type="button"
          className="selection-close-btn"
          aria-label="Снять выделение"
          onClick={closeSelection}
        >
          ×
        </button>
      </div>
    </div>
  );
}
