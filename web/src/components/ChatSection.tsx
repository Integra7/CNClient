import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { getChatIdsSorted } from '../utils/chatList';
import { Sidebar } from './Sidebar';
import { ChatMain } from './ChatMain';

export function ChatSection() {
  const { state } = useApp();

  const chatIds = useMemo(
    () =>
      getChatIdsSorted(
        state.messagesByChat,
        state.chatNames,
        state.deletedChatIdsForMe,
        state.chatLastMessageTime
      ),
    [state.messagesByChat, state.chatNames, state.deletedChatIdsForMe, state.chatLastMessageTime]
  );

  const isOpen = state.connectionState === 'connected';
  const showChatPanel = isOpen && (!!state.selectedChatId || !!state.composeToUsername);

  return (
    <div
      id="chat-section"
      className={showChatPanel ? 'chat-section chat-open' : 'chat-section'}
      hidden={!isOpen}
    >
      <Sidebar chatIds={chatIds} />
      <ChatMain showChatPanel={showChatPanel} chatIds={chatIds} />
    </div>
  );
}
