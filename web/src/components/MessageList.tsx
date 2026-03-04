import React, { useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { DisplayMessage } from '../types';
import { formatTime, escapeHtml } from '../utils/format';

interface MessageListProps {
  chatId: string;
  isCompose: boolean;
}

function groupKey(m: DisplayMessage): string | null {
  if (!m.forwardFrom) return null;
  const bid = m.forwardBatchId;
  if (bid != null && bid !== '') return bid;
  return `ts:${m.timestamp}`;
}

export function MessageList({ chatId, isCompose }: MessageListProps) {
  const { state, dispatch } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);

  const list = chatId ? (state.messagesByChat[chatId] ?? []) : [];
  const pendingList = Object.values(state.pendingByClientId).filter(
    (p) => p.chatId === (chatId || '')
  );

  const combined = useMemo(() => {
    const filtered = list.filter((m) => !state.deletedMessageIdsForMe.includes(m.id));
    const fromPending: DisplayMessage[] = pendingList.map((p) => ({
      id: p.clientMessageId,
      clientMessageId: p.clientMessageId,
      chatId: p.chatId,
      senderId: state.currentUserId,
      content: p.content,
      timestamp: p.sentAt,
      status: p.status,
      isOwn: true,
    }));
    return [...filtered, ...fromPending].sort((a, b) => {
      const t = a.timestamp - b.timestamp;
      if (t !== 0) return t;
      const oa = a.forwardFrom?.originalTimestamp ?? a.timestamp;
      const ob = b.forwardFrom?.originalTimestamp ?? b.timestamp;
      if (oa !== ob) return oa - ob;
      return a.id < b.id ? -1 : 1;
    });
  }, [
    list,
    pendingList,
    state.deletedMessageIdsForMe,
    state.currentUserId,
  ]);

  const groups = useMemo(() => {
    const result: DisplayMessage[][] = [];
    let run: DisplayMessage[] = [];
    for (const m of combined) {
      const bid = groupKey(m);
      const prevBid = run.length > 0 ? groupKey(run[0]!) : null;
      if (bid && run.length > 0 && prevBid !== null && prevBid !== bid) {
        result.push([...run]);
        run = [];
      }
      // Обычное сообщение (без forwardFrom) после пересланных — закрываем блок пересланных,
      // иначе «Спишь?» попадал бы в один блок с ними и отображался как пересланное.
      if (!bid && run.length > 0 && prevBid !== null) {
        result.push([...run]);
        run = [];
      }
      run.push(m);
      if (!bid) {
        result.push([...run]);
        run = [];
      }
    }
    if (run.length > 0) result.push(run);
    return result;
  }, [combined]);

  const readThreshold = chatId ? (state.lastReadByChat[chatId] ?? 0) : 0;
  const selectedSet = useMemo(
    () => new Set(state.selectedMessageIds),
    [state.selectedMessageIds]
  );

  useEffect(() => {
    containerRef.current && (containerRef.current.scrollTop = containerRef.current.scrollHeight);
  }, [combined.length]);

  if (isCompose && combined.length === 0) {
    return (
      <div id="messages" ref={containerRef}>
        {pendingList.map((p) => (
          <div key={p.clientMessageId} className="message own">
            <span className="content">{escapeHtml(p.content)}</span>
            <span className="meta">⏳ {formatTime(p.sentAt)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div id="messages" ref={containerRef}>
      {groups.map((group, gi) => {
        const first = group[0];
        const useBlock = group.length >= 1 && (first?.forwardFrom != null);
        const blockSelected = group.some((m) => selectedSet.has(m.id));
        const blockHasUnread = group.some(
          (m) => !m.isOwn && m.timestamp > readThreshold
        );

        if (useBlock && first) {
          return (
            <div
              key={gi}
              className={`forwarded-block ${blockSelected ? 'selected' : ''} ${blockHasUnread ? 'forwarded-block-unread' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const ids = group.map((m) => m.id);
                const anySelected = ids.some((id) => selectedSet.has(id));
                ids.forEach((id) => {
                  const isSelected = selectedSet.has(id);
                  if (anySelected && isSelected) dispatch({ type: 'TOGGLE_MESSAGE_SELECTION', payload: id });
                  if (!anySelected && !isSelected) dispatch({ type: 'TOGGLE_MESSAGE_SELECTION', payload: id });
                });
              }}
            >
              {group.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  readThreshold={readThreshold}
                  selected={selectedSet.has(m.id)}
                  onToggleSelect={() => {}}
                  insideBlock
                />
              ))}
              <div className="forwarded-block-meta">
                {first.timestamp != null ? formatTime(first.timestamp) : ''}
              </div>
            </div>
          );
        }

        return (
          <React.Fragment key={gi}>
            {group.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                readThreshold={readThreshold}
                selected={selectedSet.has(m.id)}
                onToggleSelect={() =>
                  dispatch({ type: 'TOGGLE_MESSAGE_SELECTION', payload: m.id })
                }
                insideBlock={false}
              />
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MessageBubble({
  m,
  readThreshold,
  selected,
  onToggleSelect,
  insideBlock,
}: {
  m: DisplayMessage;
  readThreshold: number;
  selected: boolean;
  onToggleSelect: () => void;
  insideBlock: boolean;
}) {
  const isUnread = !m.isOwn && m.timestamp > readThreshold;
  const statusText =
    m.status === 'sending'
      ? '⏳'
      : m.status === 'failed'
        ? '❌'
        : m.isOwn
          ? m.status === 'read' || m.status === 'delivered'
            ? '✓✓'
            : '✓'
          : '';
  const editedLabel = m.editedAt ? (
    <span className="meta-edited">ред.</span>
  ) : null;
  const forwardedBy = m.senderUsername
    ? `Переслал: ${escapeHtml(m.senderUsername)}`
    : '';
  const forwardLines = m.forwardFrom && (
    <div className="message-forward-from">
      {forwardedBy ? (
        <span className="meta-forward-by">{forwardedBy}</span>
      ) : null}
      <span className="meta-forward">
        Переслано от {escapeHtml(m.forwardFrom.senderName)}
      </span>
      {m.forwardFrom.originalTimestamp != null ? (
        <span className="meta-forward-original">
          Оригинал: {formatTime(m.forwardFrom.originalTimestamp)}
        </span>
      ) : null}
    </div>
  );

  const className = `message ${m.isOwn ? 'own' : 'other'}${isUnread ? ' unread' : ''}${!insideBlock && selected ? ' selected' : ''}`;

  const content = (
    <>
      {forwardLines}
      <span className="content">{escapeHtml(m.content)}</span>
      {!insideBlock ? (
        <span className="meta-row">
          <span className="meta">
            {statusText} {formatTime(m.timestamp)}
          </span>
          {editedLabel}
        </span>
      ) : null}
    </>
  );

  if (insideBlock) {
    return <div className={className}>{content}</div>;
  }
  return (
    <div
      className={className}
      data-message-id={m.id}
      data-is-own={String(m.isOwn)}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect();
      }}
    >
      {content}
    </div>
  );
}
