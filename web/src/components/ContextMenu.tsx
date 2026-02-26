import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function ContextMenu() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!state.contextMenu) return;
      const target = e.target as Node;
      const menu = document.getElementById('context-menu');
      if (menu && !menu.contains(target)) {
        dispatch({ type: 'HIDE_CONTEXT_MENU' });
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [state.contextMenu, dispatch]);

  const target = state.contextMenu?.target;
  const isChat = target?.type === 'chat';

  const handleDeleteChat = () => {
    if (target?.type === 'chat') {
      dispatch({ type: 'HIDE_CONTEXT_MENU' });
      dispatch({ type: 'OPEN_MODAL_DELETE_CHAT', payload: target.chatId });
    }
  };

  return (
    <div
      id="context-menu"
      className="context-menu"
      hidden={!state.contextMenu || !isChat}
      style={
        state.contextMenu
          ? { left: state.contextMenu.x, top: state.contextMenu.y }
          : undefined
      }
    >
      <button type="button" data-action="delete-chat" onClick={handleDeleteChat}>
        Удалить чат
      </button>
    </div>
  );
}
