import { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { shortId } from '../utils/format';
import type { ReplyToMessage, AttachmentRequest, AttachmentResponse, DisplayMessage } from '../types';
import { MessageList } from './MessageList';
import { SelectionToolbar } from './SelectionToolbar';
import { formatDuration } from '../utils/format';
import { validateFile, uploadFiles, uploadVoiceToCloudinary, validateVoiceMessage } from '../utils/upload';

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

  /** Голосовое: idle | recording | recorded | uploading */
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'recorded' | 'uploading'>('idle');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordDurationSec, setRecordDurationSec] = useState(0);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [voiceUploadProgress, setVoiceUploadProgress] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordElapsedRef = useRef(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const selectedChatId = state.selectedChatId;
  const composeToUsername = state.composeToUsername;
  /** Кнопка прикрепления показывается всегда в панели чата; загрузка возможна только при выбранном чате */
  const canAttach = !!selectedChatId && !composeToUsername;
  const canVoice = !!selectedChatId && !composeToUsername;

  useEffect(() => {
    if (state.connectionState === 'connected' && selectedChatId) {
      wsClientRef.current?.getMessages(selectedChatId);
    }
  }, [state.connectionState, selectedChatId, wsClientRef]);

  useEffect(() => {
    messageInputRef.current?.focus();
  }, [selectedChatId, composeToUsername, state.replyingToMessageIds.length]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current?.stop();
    };
  }, []);

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || !canAttach) return;
      const fileList = Array.from(files);
      e.target.value = '';

      setUploadError(null);
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

      // Запуск загрузки после отрисовки «Загрузка…», иначе UI не успевает обновиться
      const doUpload = async () => {
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
          setUploadError(err instanceof Error ? err.message : String(err));
          withPreview.forEach((item) => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          });
          setUploadingFiles([]);
        }
      };
      setTimeout(doUpload, 0);
    },
    [canAttach]
  );

  const removePendingAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (!canVoice || voiceState !== 'idle') return;
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        clearRecordTimer();
        const blob = new Blob(chunks, { type: mimeType });
        setRecordedBlob(blob);
        setRecordDurationSec(recordElapsedRef.current);
        setVoiceState('recorded');
      };
      recorder.onerror = () => {
        setUploadError('Ошибка записи');
        setVoiceState('idle');
      };
      recorder.start();
      recordElapsedRef.current = 0;
      setRecordElapsedSec(0);
      setVoiceState('recording');
      recordTimerRef.current = setInterval(() => {
        recordElapsedRef.current += 1;
        setRecordElapsedSec(recordElapsedRef.current);
      }, 1000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  }, [canVoice, voiceState, clearRecordTimer]);

  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewPlaying(false);
  }, []);

  useEffect(() => {
    if (voiceState !== 'recorded' || !recordedBlob) {
      stopPreview();
    }
  }, [voiceState, recordedBlob, stopPreview]);

  const toggleVoicePreview = useCallback(() => {
    if (!recordedBlob) return;
    if (previewPlaying) {
      stopPreview();
      return;
    }
    const url = URL.createObjectURL(recordedBlob);
    previewObjectUrlRef.current = url;
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    audio.onended = () => stopPreview();
    audio.onerror = () => stopPreview();
    audio.play().then(() => setPreviewPlaying(true)).catch(stopPreview);
  }, [recordedBlob, previewPlaying, stopPreview]);

  const cancelVoiceMessage = useCallback(() => {
    stopPreview();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceStreamRef.current = null;
    clearRecordTimer();
    recordElapsedRef.current = 0;
    setRecordedBlob(null);
    setRecordDurationSec(0);
    setRecordElapsedSec(0);
    setVoiceState('idle');
  }, [clearRecordTimer, stopPreview]);

  const sendVoiceMessage = useCallback(async () => {
    if (!recordedBlob || !selectedChatId || !wsClientRef.current?.connected || voiceState === 'uploading') return;
    stopPreview();
    const validation = validateVoiceMessage(recordedBlob, recordDurationSec);
    if (!validation.valid) {
      setUploadError(validation.error ?? 'Ошибка валидации');
      return;
    }
    setUploadError(null);
    setVoiceState('uploading');
    setVoiceUploadProgress(0);
    const clientMessageId = crypto.randomUUID();
    const list = state.messagesByChat[selectedChatId] ?? [];
    try {
      const attachment = await uploadVoiceToCloudinary(recordedBlob, 'voice.webm', (p) => setVoiceUploadProgress(p));
      setRecordedBlob(null);
      setRecordDurationSec(0);
      setVoiceState('idle');

      const newMsg: DisplayMessage = {
        id: clientMessageId,
        clientMessageId,
        chatId: selectedChatId,
        senderId: state.currentUserId,
        content: '',
        timestamp: Date.now(),
        status: 'sending',
        isOwn: true,
        attachments: [
          {
            id: '',
            ...attachment,
            createdAt: Date.now(),
            isVoiceMessage: true,
          } as AttachmentResponse,
        ],
      };
      dispatch({
        type: 'MERGE_MESSAGES',
        payload: {
          chatId: selectedChatId,
          messages: [...list, newMsg].sort((a, b) => a.timestamp - b.timestamp),
        },
      });
      wsClientRef.current.sendMessageWithAttachments(selectedChatId, undefined, [attachment], clientMessageId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
      setVoiceState('recorded');
    }
  }, [
    recordedBlob,
    recordDurationSec,
    selectedChatId,
    state.messagesByChat,
    state.currentUserId,
    voiceState,
    dispatch,
    wsClientRef,
    stopPreview,
  ]);

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
              ) : a.isVoiceMessage ? (
                <span className="pending-attachment-icon">🎤</span>
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
      {voiceState === 'recording' ? (
        <div className="voice-recording-strip">
          <span className="voice-recording-dot" aria-hidden />
          <span className="voice-recording-timer">{formatDuration(recordElapsedSec)}</span>
          <button type="button" className="voice-recording-stop" onClick={stopVoiceRecording}>
            Стоп
          </button>
        </div>
      ) : null}
      {voiceState === 'recorded' && recordedBlob ? (
        <div className="voice-recorded-strip">
          <button
            type="button"
            className="voice-preview-play-btn"
            onClick={toggleVoicePreview}
            aria-label={previewPlaying ? 'Пауза' : 'Прослушать'}
            title={previewPlaying ? 'Пауза' : 'Прослушать перед отправкой'}
          >
            {previewPlaying ? (
              <svg className="voice-preview-icon" viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" />
                <rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" />
              </svg>
            ) : (
              <svg className="voice-preview-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5.14v13.72c0 .9 1.02 1.44 1.73.87l11.2-6.86c.78-.48.78-1.58 0-2.06L9.73 4.27C9.02 3.7 8 4.24 8 5.14z" fill="currentColor" />
              </svg>
            )}
          </button>
          <span className="voice-recorded-label">Голосовое {formatDuration(recordDurationSec)}</span>
          <button type="button" className="voice-send-btn" onClick={sendVoiceMessage}>
            Отправить
          </button>
          <button type="button" className="voice-cancel-btn" onClick={cancelVoiceMessage}>
            Удалить
          </button>
        </div>
      ) : null}
      {voiceState === 'uploading' ? (
        <div className="voice-uploading-strip">
          <span>Загрузка голосового… {voiceUploadProgress}%</span>
          <div className="voice-upload-progress">
            <div className="voice-upload-progress-fill" style={{ width: `${voiceUploadProgress}%` }} />
          </div>
        </div>
      ) : null}
      <div className="send-row">
        <input
          ref={fileInputRef}
          id="attach-file-input"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.pdf,.doc,.docx,.txt,.zip,.rar,image/*,video/*"
          className="file-input-hidden"
          onChange={handleFileSelect}
          aria-hidden
          disabled={!canAttach || uploadingFiles.length > 0}
        />
        {canVoice && voiceState === 'idle' ? (
          <button
            type="button"
            className="attach-btn voice-btn"
            aria-label="Записать голосовое"
            title="Голосовое сообщение"
            onClick={startVoiceRecording}
          >
            <svg className="btn-icon btn-icon-mic" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        {canAttach && uploadingFiles.length === 0 && voiceState === 'idle' ? (
          <label htmlFor="attach-file-input" className="attach-btn" title="Прикрепить файл (фото, видео, документ)">
            <svg className="btn-icon btn-icon-attach" viewBox="0 0 24 24" aria-hidden>
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" fill="currentColor" />
            </svg>
          </label>
        ) : voiceState === 'idle' ? (
          <button
            type="button"
            className="attach-btn"
            aria-label="Прикрепить файл"
            title="Прикрепить файл (фото, видео, документ)"
            disabled={uploadingFiles.length > 0}
            onClick={() => setUploadError('Сначала выберите чат слева')}
          >
            <svg className="btn-icon btn-icon-attach" viewBox="0 0 24 24" aria-hidden>
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" fill="currentColor" />
            </svg>
          </button>
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
        <button type="button" id="send" className="send-btn" onClick={sendMessage} aria-label="Отправить">
          <svg className="send-btn-icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
