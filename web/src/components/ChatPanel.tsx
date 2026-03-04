import { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { shortId } from '../utils/format';
import type { ReplyToMessage, AttachmentRequest, AttachmentResponse } from '../types';
import { MessageList } from './MessageList';
import { SelectionToolbar } from './SelectionToolbar';
import { validateFile, uploadFiles } from '../utils/upload';

interface ChatPanelProps {
  chatIds: string[];
}

export function ChatPanel({ chatIds }: ChatPanelProps) {
  const { state, dispatch, wsClientRef } = useApp();
  const messageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRequest[]>([]);
  /** Файлы в процессе загрузки: сразу показываем превью (для фото) и прогресс */
  const [uploadingFiles, setUploadingFiles] = useState<{ file: File; previewUrl: string | null; progress: number }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedChatId = state.selectedChatId;
  const composeToUsername = state.composeToUsername;
  const canAttach = !!selectedChatId && !composeToUsername;

  useEffect(() => {
    if (state.connectionState === 'connected' && selectedChatId) {
      wsClientRef.current?.getMessages(selectedChatId);
    }
  }, [state.connectionState, selectedChatId, wsClientRef]);

  useEffect(() => {
    messageInputRef.current?.focus();
  }, [selectedChatId, composeToUsername, state.replyingToMessageIds.length]);

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

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || !canAttach) return;
      e.target.value = '';
      setUploadError(null);
      const fileList = Array.from(files);
      for (const file of fileList) {
        const v = validateFile(file);
        if (!v.valid) {
          setUploadError(v.error ?? 'Ошибка валидации');
          return;
        }
      }
      const withPreview = fileList.map((file) => ({
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        progress: 0,
      }));
      setUploadingFiles(withPreview);
      try {
        const uploaded = await uploadFiles(fileList, (fileIndex, percent) => {
          setUploadingFiles((prev) =>
            prev.map((item, i) => (i === fileIndex ? { ...item, progress: percent } : item))
          );
        });
        setPendingAttachments((prev) => [...prev, ...uploaded]);
        withPreview.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        setUploadingFiles([]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки');
        withPreview.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        setUploadingFiles([]);
      }
    },
    [canAttach]
  );

  const removePendingAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = useCallback(() => {
    const input = messageInputRef.current;
    const content = input?.value.trim() ?? '';
    const hasAttachments = pendingAttachments.length > 0;
    if ((!content && !hasAttachments) || !wsClientRef.current?.connected) return;
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
    const list = state.messagesByChat[selectedChatId] ?? [];
    const replyingToIds = state.replyingToMessageIds;

    if (replyingToIds.length > 0) {
      const othersToReply = replyingToIds
        .map((id) => list.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => m != null && !m.isOwn)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (othersToReply.length === 0) {
        dispatch({ type: 'SET_REPLYING_TO', payload: null });
        return;
      }
      const messageIdsToSend = othersToReply.map((m) => m.id);
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
      const replyTo: ReplyToMessage[] = othersToReply.map((m) => ({
        messageId: m.id,
        senderId: m.senderId,
        senderName: m.senderUsername ?? shortId(m.senderId),
        content: m.content,
        timestamp: m.timestamp,
      }));
      const newMsg = {
        id: clientMessageId,
        clientMessageId,
        chatId: selectedChatId,
        senderId: state.currentUserId,
        content,
        timestamp: Date.now(),
        status: 'sending' as const,
        isOwn: true,
        replyTo,
      };
      dispatch({
        type: 'MERGE_MESSAGES',
        payload: {
          chatId: selectedChatId,
          messages: [...list, newMsg].sort((a, b) => a.timestamp - b.timestamp),
        },
      });
      dispatch({ type: 'SET_REPLYING_TO', payload: null });
      dispatch({ type: 'CLEAR_SELECTION' });
      wsClientRef.current.replyToMessages(selectedChatId, messageIdsToSend, content, clientMessageId);
      if (input) input.value = '';
      return;
    }

    const displayContent = content || (hasAttachments ? 'Вложение' : '');
    dispatch({
      type: 'ADD_PENDING',
      payload: {
        clientMessageId,
        content: displayContent,
        chatId: selectedChatId,
        status: 'sending',
        sentAt: Date.now(),
      },
    });
    const attachmentsForDisplay: AttachmentResponse[] = pendingAttachments.map((a) => ({
      id: a.publicId,
      publicId: a.publicId,
      url: a.url,
      thumbnailUrl: a.thumbnailUrl,
      fileName: a.fileName,
      fileType: a.fileType,
      fileSize: a.fileSize,
      resourceType: a.resourceType,
      width: a.width,
      height: a.height,
      duration: a.duration,
      createdAt: Date.now(),
    }));
    const newMsg = {
      id: clientMessageId,
      clientMessageId,
      chatId: selectedChatId,
      senderId: state.currentUserId,
      content: content || '',
      timestamp: Date.now(),
      status: 'sending' as const,
      isOwn: true,
      attachments: attachmentsForDisplay.length > 0 ? attachmentsForDisplay : undefined,
    };
    dispatch({
      type: 'MERGE_MESSAGES',
      payload: {
        chatId: selectedChatId,
        messages: [...list, newMsg].sort((a, b) => a.timestamp - b.timestamp),
      },
    });
    if (hasAttachments) {
      wsClientRef.current.sendMessageWithAttachments(
        selectedChatId,
        content || undefined,
        pendingAttachments,
        clientMessageId
      );
      setPendingAttachments([]);
    } else {
      wsClientRef.current.sendMessage(selectedChatId, content, clientMessageId);
    }
    if (input) input.value = '';
  }, [
    composeToUsername,
    selectedChatId,
    state.currentUserId,
    state.messagesByChat,
    state.replyingToMessageIds,
    pendingAttachments,
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
      {state.replyingToMessageIds.length > 0 ? (
        <div className="reply-mode-hint">
          <span className="reply-mode-label">
            Ответ на {state.replyingToMessageIds.length}{' '}
            {state.replyingToMessageIds.length === 1 ? 'сообщение' : 'сообщений'}
          </span>
          <button
            type="button"
            className="reply-mode-cancel"
            aria-label="Отменить ответ"
            onClick={() => dispatch({ type: 'SET_REPLYING_TO', payload: null })}
          >
            ×
          </button>
        </div>
      ) : null}
      {uploadError ? (
        <div className="upload-error">
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)} aria-label="Закрыть">×</button>
        </div>
      ) : null}
      {uploadingFiles.length > 0 ? (
        <div className="pending-attachments uploading">
          {uploadingFiles.map((item, i) => (
            <span key={`uploading-${i}-${item.file.name}`} className="pending-attachment-chip uploading-chip">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="pending-attachment-thumb" />
              ) : (
                <span className="pending-attachment-icon">📎</span>
              )}
              <span className="pending-attachment-name" title={item.file.name}>
                {item.file.name.length > 12 ? item.file.name.slice(0, 10) + '…' : item.file.name}
              </span>
              <span className="pending-attachment-status">Загрузка… {item.progress}%</span>
              <div className="pending-attachment-progress-bar">
                <div className="pending-attachment-progress-fill" style={{ width: `${item.progress}%` }} />
              </div>
            </span>
          ))}
        </div>
      ) : null}
      {pendingAttachments.length > 0 ? (
        <div className="pending-attachments">
          {pendingAttachments.map((a, i) => (
            <span key={a.publicId} className="pending-attachment-chip">
              {a.resourceType === 'image' && (a.thumbnailUrl || a.url) ? (
                <img src={a.thumbnailUrl || a.url} alt="" className="pending-attachment-thumb" />
              ) : (
                <span className="pending-attachment-icon">📎</span>
              )}
              <span className="pending-attachment-name" title={a.fileName}>
                {a.fileName.length > 12 ? a.fileName.slice(0, 10) + '…' : a.fileName}
              </span>
              <span className="pending-attachment-badge">Загружено</span>
              <button
                type="button"
                className="pending-attachment-remove"
                aria-label="Удалить"
                onClick={() => removePendingAttachment(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="send-row">
        {canAttach ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.pdf,.doc,.docx,.txt,.zip,.rar,image/*,video/*"
              className="file-input-hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              className="attach-btn"
              aria-label="Прикрепить файл"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles.length > 0}
            >
              📎
            </button>
          </>
        ) : null}
        <input
          ref={messageInputRef}
          id="message-input"
          type="text"
          placeholder={
            state.replyingToMessageIds.length > 0
              ? `Ответ на ${state.replyingToMessageIds.length} сообщ.`
              : 'Сообщение...'
          }
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
