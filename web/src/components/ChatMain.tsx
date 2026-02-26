import { ChatPanel } from './ChatPanel';

interface ChatMainProps {
  showChatPanel: boolean;
  chatIds: string[];
}

export function ChatMain({ showChatPanel, chatIds }: ChatMainProps) {
  return (
    <main className="chat-main">
      {!showChatPanel ? (
        <div id="chat-placeholder">
          Выберите чат слева или введите username и выберите из списка.
        </div>
      ) : (
        <ChatPanel chatIds={chatIds} />
      )}
    </main>
  );
}
