import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { DisplayMessage, AttachmentResponse } from '../types';
import { formatTime, escapeHtml, formatFileSize, formatDuration } from '../utils/format';
import { buildImageDisplayUrl, getCloudinaryCloudName } from '../utils/upload';

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

/** Если content — это JSON с вложениями ({ text?, attachments }), возвращаем только текст для отображения; иначе сам content */
function getDisplayText(content: string): string {
  if (!content || typeof content !== 'string') return '';
  const trimmed = content.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('{') && trimmed.includes('"attachments"')) {
    try {
      const data = JSON.parse(content) as { text?: string; attachments?: unknown[] };
      if (Array.isArray(data.attachments)) return (data.text ?? '').trim();
    } catch {
      // не JSON или битый — показываем как есть
    }
  }
  return content;
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
    const existingIds = new Set(filtered.map((m) => m.id));
    const fromPending: DisplayMessage[] = pendingList
      .filter((p) => !existingIds.has(p.clientMessageId))
      .map((p) => ({
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
  const [playingVoiceUrl, setPlayingVoiceUrl] = useState<string | null>(null);
  const selectedSet = useMemo(
    () => new Set(state.selectedMessageIds),
    [state.selectedMessageIds]
  );

  const scrollToMessage = useCallback((messageId: string) => {
    const el = containerRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-highlight');
      setTimeout(() => el.classList.remove('message-highlight'), 2000);
    }
  }, []);

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
                  onScrollToMessage={scrollToMessage}
                  messagesInChat={list}
                  chatId={chatId}
                  chatNames={state.chatNames}
                  playingVoiceUrl={playingVoiceUrl}
                  setPlayingVoiceUrl={setPlayingVoiceUrl}
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
                onScrollToMessage={scrollToMessage}
                messagesInChat={list}
                chatId={chatId}
                chatNames={state.chatNames}
                playingVoiceUrl={playingVoiceUrl}
                setPlayingVoiceUrl={setPlayingVoiceUrl}
              />
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const REPLY_PREVIEW_MAX_LEN = 50;

function formatVoiceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const WAVE_BAR_COUNT = 24;

function VoiceMessagePlayer({
  attachment,
  playingVoiceUrl,
  setPlayingVoiceUrl,
}: {
  attachment: AttachmentResponse;
  playingVoiceUrl: string | null;
  setPlayingVoiceUrl: (url: string | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const safeDuration = Number.isFinite(attachment.duration) && attachment.duration! >= 0 ? attachment.duration! : 0;
  const [duration, setDuration] = useState(safeDuration);

  useEffect(() => {
    const audio = new Audio(attachment.url);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d >= 0) setDuration(d);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setPlayingVoiceUrl(null);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    if (safeDuration > 0) setDuration(safeDuration);

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [attachment.url, attachment.duration, setPlayingVoiceUrl]);

  useEffect(() => {
    if (playingVoiceUrl != null && playingVoiceUrl !== attachment.url && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [playingVoiceUrl, attachment.url]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setPlayingVoiceUrl(null);
    } else {
      setPlayingVoiceUrl(attachment.url);
      audio.play().catch(() => {
        setIsPlaying(false);
        setPlayingVoiceUrl(null);
      });
      setIsPlaying(true);
    }
  }, [isPlaying, attachment.url, setPlayingVoiceUrl]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      audio.currentTime = pct * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="attachment attachment-voice">
      <button
        type="button"
        className="voice-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
      >
        {isPlaying ? (
          <svg className="voice-play-btn-icon" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" />
            <rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" />
          </svg>
        ) : (
          <svg className="voice-play-btn-icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5.14v13.72c0 .9 1.02 1.44 1.73.87l11.2-6.86c.78-.48.78-1.58 0-2.06L9.73 4.27C9.02 3.7 8 4.24 8 5.14z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="voice-waveform-wrap">
        <div className="voice-waveform" aria-hidden>
          {Array.from({ length: WAVE_BAR_COUNT }).map((_, i) => (
            <div
              key={i}
              className={`voice-wave-bar ${isPlaying ? 'voice-wave-bar-playing' : ''}`}
              style={{
                height: `${20 + Math.sin((i / WAVE_BAR_COUNT) * Math.PI * 2) * 35}%`,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          ))}
        </div>
        <div
          className="voice-progress-track"
          role="progressbar"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration}
          onClick={handleProgressClick}
        >
          <div className="voice-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="voice-info">
        <span className="voice-time">
          {formatVoiceTime(currentTime)} / {formatVoiceTime(duration)}
        </span>
        <span className="voice-size">{formatFileSize(attachment.fileSize)}</span>
      </div>
    </div>
  );
}

function AttachmentDisplay({
  attachment,
  playingVoiceUrl,
  setPlayingVoiceUrl,
}: {
  attachment: AttachmentResponse;
  playingVoiceUrl: string | null;
  setPlayingVoiceUrl: (url: string | null) => void;
}) {
  if (attachment.isVoiceMessage) {
    return (
      <VoiceMessagePlayer
        attachment={attachment}
        playingVoiceUrl={playingVoiceUrl}
        setPlayingVoiceUrl={setPlayingVoiceUrl}
      />
    );
  }
  if (attachment.resourceType === 'image') {
    const cloudName = getCloudinaryCloudName(attachment.url);
    const src =
      cloudName && attachment.publicId
        ? buildImageDisplayUrl(cloudName, attachment.publicId)
        : attachment.thumbnailUrl || attachment.url;
    return (
      <div className="attachment attachment-image">
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="attachment-image-link">
          <img src={src} alt={attachment.fileName} loading="lazy" />
        </a>
        <div className="attachment-info">
          <span className="attachment-filename">{attachment.fileName}</span>
          <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
        </div>
      </div>
    );
  }
  if (attachment.resourceType === 'video' && !attachment.isVoiceMessage) {
    return (
      <div className="attachment attachment-video">
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="attachment-video-preview">
          {attachment.thumbnailUrl ? (
            <img src={attachment.thumbnailUrl} alt="" />
          ) : (
            <span className="attachment-video-placeholder">▶ Видео</span>
          )}
          {attachment.duration != null ? (
            <span className="attachment-duration">{formatDuration(attachment.duration)}</span>
          ) : null}
        </a>
        <div className="attachment-info">
          <span className="attachment-filename">{attachment.fileName}</span>
          <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="attachment attachment-file">
      <span className="attachment-file-icon">📄</span>
      <div className="attachment-info">
        <span className="attachment-filename">{attachment.fileName}</span>
        <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
      </div>
      <a href={attachment.url} download={attachment.fileName} target="_blank" rel="noopener noreferrer" className="attachment-download">
        Скачать
      </a>
    </div>
  );
}

function MessageBubble({
  m,
  readThreshold,
  selected,
  onToggleSelect,
  insideBlock,
  onScrollToMessage,
  messagesInChat = [],
  chatId,
  chatNames = {},
  playingVoiceUrl,
  setPlayingVoiceUrl,
}: {
  m: DisplayMessage;
  readThreshold: number;
  selected: boolean;
  onToggleSelect: () => void;
  insideBlock: boolean;
  onScrollToMessage?: (messageId: string) => void;
  messagesInChat?: DisplayMessage[];
  chatId?: string;
  chatNames?: Record<string, string>;
  playingVoiceUrl?: string | null;
  setPlayingVoiceUrl?: (url: string | null) => void;
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
  const replyPreview =
    m.replyTo && m.replyTo.length > 0 ? (
      <div className="message-reply-preview">
        {m.replyTo.map((r) => {
          const text = r.content.length > REPLY_PREVIEW_MAX_LEN ? r.content.slice(0, REPLY_PREVIEW_MAX_LEN) + '…' : r.content;
          const originalMsg = messagesInChat.find((msg) => msg.id === r.messageId);
          const displayName =
            originalMsg?.senderUsername ??
            (originalMsg && !originalMsg.isOwn && chatId ? (chatNames[chatId] ?? r.senderName) : r.senderName);
          return (
            <div
              key={r.messageId}
              className="message-reply-preview-item"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onScrollToMessage?.(r.messageId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onScrollToMessage?.(r.messageId);
                }
              }}
            >
              <span className="reply-preview-sender">{escapeHtml(displayName)}:</span>
              <span className="reply-preview-content">{escapeHtml(text)}</span>
              <span className="reply-preview-time">{formatTime(r.timestamp)}</span>
            </div>
          );
        })}
      </div>
    ) : null;

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

  const attachmentsBlock =
    m.attachments && m.attachments.length > 0 ? (
      <div className="message-attachments">
        {m.attachments.map((att) => (
          <AttachmentDisplay
            key={att.id || att.publicId || att.url}
            attachment={att}
            playingVoiceUrl={playingVoiceUrl ?? null}
            setPlayingVoiceUrl={setPlayingVoiceUrl ?? (() => {})}
          />
        ))}
      </div>
    ) : null;

  const className = `message ${m.isOwn ? 'own' : 'other'}${isUnread ? ' unread' : ''}${!insideBlock && selected ? ' selected' : ''}`;
  const displayText = getDisplayText(m.content);

  const content = (
    <>
      {replyPreview}
      {forwardLines}
      {attachmentsBlock}
      {displayText ? <span className="content">{escapeHtml(displayText)}</span> : null}
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
