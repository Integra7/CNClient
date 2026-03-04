import type { ServerMessage, DisplayMessage, MessageFromServer, ChatFromServer, ReplyToMessage, AttachmentResponse } from '../types';
import type { AppState, AppAction } from './types';
import type { CallManager } from '../callManager';

type Dispatch = (action: AppAction) => void;

function parseAttachments(attachmentsJson: string | null | undefined): AttachmentResponse[] | undefined {
  if (attachmentsJson == null || attachmentsJson === '') return undefined;
  try {
    const arr = JSON.parse(attachmentsJson) as unknown;
    if (!Array.isArray(arr)) return undefined;
    return arr.map((item: unknown) => {
      const o = item as Record<string, unknown>;
      return {
        id: String(o.id ?? ''),
        publicId: String(o.publicId ?? ''),
        url: String(o.url ?? ''),
        thumbnailUrl: o.thumbnailUrl != null ? String(o.thumbnailUrl) : undefined,
        fileName: String(o.fileName ?? ''),
        fileType: String(o.fileType ?? ''),
        fileSize: Number(o.fileSize ?? 0),
        resourceType: String(o.resourceType ?? 'raw'),
        width: o.width != null ? Number(o.width) : undefined,
        height: o.height != null ? Number(o.height) : undefined,
        duration: o.duration != null && Number.isFinite(Number(o.duration)) ? Number(o.duration) : undefined,
        createdAt: Number(o.createdAt ?? 0),
        isVoiceMessage: Boolean(o.isVoiceMessage),
      };
    });
  } catch {
    return undefined;
  }
}

function getAttachmentKind(attachments: AttachmentResponse[] | undefined): 'image' | 'voice' | null {
  if (!attachments?.length) return null;
  if (attachments.some((a) => a.isVoiceMessage)) return 'voice';
  if (attachments.some((a) => a.resourceType === 'image')) return 'image';
  return null;
}

function parseReplyToData(replyToData: string | null | undefined): ReplyToMessage[] | undefined {
  if (replyToData == null || replyToData === '') return undefined;
  try {
    const arr = JSON.parse(replyToData) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr.map((item: unknown) => {
      const o = item as Record<string, unknown>;
      return {
        messageId: String(o.messageId ?? ''),
        senderId: String(o.senderId ?? ''),
        senderName: String(o.senderName ?? ''),
        content: String(o.content ?? ''),
        timestamp: Number(o.timestamp ?? 0),
      };
    });
  } catch {
    return undefined;
  }
}

/**
 * Определение пересланного сообщения — только по isForwarded === true.
 * Наличие полей forwardFrom* не учитывается: для обычных сообщений бэкенд их не присылает,
 * но решение «пересланное или нет» принимается только по isForwarded.
 */
function mapForwardFrom(m: {
  isForwarded?: boolean;
  forwardFromSenderId?: string | null;
  forwardFromSenderName?: string | null;
  forwardFromTimestamp?: number | null;
}): DisplayMessage['forwardFrom'] | undefined {
  if (m.isForwarded !== true) return undefined;
  return {
    senderId: m.forwardFromSenderId ?? '',
    senderName: m.forwardFromSenderName ?? 'Unknown',
    originalTimestamp: m.forwardFromTimestamp ?? undefined,
  };
}

export type GetState = () => AppState;
export type Persist = (s: AppState) => void;
export type OnNotify = (senderName: string, bodyPreview: string) => void;

export function createServerMessageHandler(
  dispatch: Dispatch,
  getState: GetState,
  shortIdFn: (id: string) => string,
  persist: Persist,
  onNotify: OnNotify,
  callManager: CallManager | null
): (msg: ServerMessage) => void {
  return function handleServerMessage(msg: ServerMessage): void {
    const state = getState();
    const currentUserId = state.currentUserId;

    // Сигнализация звонков: пересылаем в callManager и обновляем state
    const callType = msg.type as string;
    if (
      callType === 'call_offer' ||
      callType === 'call_offer_sent' ||
      callType === 'call_answer' ||
      callType === 'call_answer_sent' ||
      callType === 'call_rejected' ||
      callType === 'call_hangup' ||
      callType === 'call_hangup_ok' ||
      callType === 'call_media'
    ) {
      if (callType === 'call_offer' && msg.callId && msg.callerId != null && msg.callerUsername != null) {
        dispatch({
          type: 'CALL_INCOMING',
          payload: {
            callId: msg.callId,
            callerId: msg.callerId,
            callerUsername: msg.callerUsername,
            sdp: msg.sdp ?? '',
          },
        });
      } else if (callType === 'call_offer_sent' && msg.callId) {
        dispatch({ type: 'CALL_OFFER_SENT', payload: { callId: msg.callId } });
        callManager?.handleServerMessage('call_offer_sent', { callId: msg.callId });
      } else if (callType === 'call_answer' && msg.callId) {
        dispatch({ type: 'CALL_ANSWER', payload: { callId: msg.callId, sdp: '' } });
        callManager?.handleServerMessage('call_answer', { callId: msg.callId });
      } else if (callType === 'call_answer_sent' && msg.callId) {
        dispatch({ type: 'CALL_ANSWER_SENT', payload: { callId: msg.callId } });
      } else if (callType === 'call_rejected' && msg.callId) {
        dispatch({ type: 'CALL_REJECTED', payload: { callId: msg.callId } });
        callManager?.handleServerMessage('call_rejected', { callId: msg.callId });
      } else if (callType === 'call_hangup' && msg.callId) {
        dispatch({ type: 'CALL_HANGUP', payload: { callId: msg.callId } });
        callManager?.handleServerMessage('call_hangup', { callId: msg.callId });
      } else if (callType === 'call_hangup_ok' && msg.callId) {
        dispatch({ type: 'CALL_HANGUP_OK', payload: { callId: msg.callId } });
        callManager?.handleServerMessage('call_hangup_ok', { callId: msg.callId });
      } else if (callType === 'call_media' && msg.callId != null && msg.content !== undefined) {
        callManager?.handleServerMessage('call_media', { callId: msg.callId, content: msg.content });
      }
      return;
    }

    if (msg.type === 'error' && msg.error) {
      if (state.callStatus !== 'idle') {
        dispatch({ type: 'CALL_ERROR', payload: msg.error });
        callManager?.handleServerMessage('call_hangup', {});
      }
    }

    switch (msg.type) {
      case 'user_found': {
        let users: Array<{ id: string; username: string }> = [];
        try {
          const content = msg.content;
          const data = typeof content === 'string' ? JSON.parse(content) : content;
          if (Array.isArray(data)) {
            users = data
              .filter((u: unknown) => u && typeof u === 'object' && 'username' in u)
              .map((u: { id?: string; username?: string }) => ({
                id: String(u.id ?? ''),
                username: String(u.username ?? ''),
              }));
          } else if (data?.users) {
            users = data.users.map((u: { id?: string; username?: string }) => ({
              id: String(u.id ?? ''),
              username: String(u.username ?? ''),
            }));
          } else if (data?.username) {
            users = [{ id: String(data.id ?? ''), username: String(data.username) }];
          }
        } catch {
          // ignore
        }
        users = users.filter((u) => u.id !== currentUserId);
        const pendingOpen = state.findUser.pendingOpenUsername;
        const callPending = state.callPendingUsername;
        if (users.length === 0) {
          dispatch({ type: 'FIND_USER_NOT_FOUND', payload: null });
          if (callPending) dispatch({ type: 'CALL_PENDING_USERNAME', payload: null });
        } else {
          const first = users[0];
          const openFirst =
            users.length === 1 &&
            pendingOpen &&
            first &&
            first.username.toLowerCase() === pendingOpen.toLowerCase();
          dispatch({
            type: 'FIND_USER_RESULT',
            payload: { users, pendingOpenUsername: openFirst ? null : pendingOpen },
          });
          if (callPending && first && first.username.toLowerCase() === callPending.toLowerCase()) {
            dispatch({ type: 'CALL_PENDING_USERNAME', payload: null });
            callManager?.startCall(first.id);
          }
        }
        break;
      }

      case 'error': {
        if (state.findUser.pendingOpenUsername) {
          dispatch({ type: 'FIND_USER_NOT_FOUND', payload: null });
        }
        if (msg.clientMessageId) {
          const chatId = Object.keys(state.messagesByChat).find((cid) =>
            (state.messagesByChat[cid] ?? []).some((m) => m.clientMessageId === msg.clientMessageId)
          );
          dispatch({ type: 'REMOVE_PENDING', payload: msg.clientMessageId });
          if (chatId) {
            dispatch({
              type: 'UPDATE_MESSAGE_STATUS',
              payload: {
                chatId,
                messageId: msg.clientMessageId,
                status: 'failed',
              },
            });
          }
        }
        persist(getState());
        break;
      }

      case 'chat':
      case 'chat_created': {
        const chatId = (msg as ServerMessage & { chatId?: string }).chatId ?? msg.id;
        if (!chatId) break;
        if (!state.messagesByChat[chatId]) {
          dispatch({ type: 'MERGE_MESSAGES', payload: { chatId, messages: [] } });
        }
        if (state.composeToUsername) {
          dispatch({
            type: 'SET_CHAT_NAME',
            payload: { chatId, name: state.composeToUsername },
          });
          dispatch({ type: 'SELECT_CHAT', payload: chatId });
          dispatch({ type: 'INIT_STATE', payload: { composeToUsername: null } });
        } else {
          dispatch({ type: 'SELECT_CHAT', payload: chatId });
        }
        persist(getState());
        break;
      }

      case 'chats_list': {
        if (!msg.content) break;
        try {
          const data = JSON.parse(msg.content) as { chats?: ChatFromServer[] };
          const chats = data.chats ?? [];
          const names: Record<string, string> = { ...state.chatNames };
          const lastMessageTimes: Record<string, number> = {};
          for (const c of chats) {
            names[c.id] = c.name ?? names[c.id] ?? shortIdFn(c.id);
            if (c.lastMessageTime != null) lastMessageTimes[c.id] = c.lastMessageTime;
            if (c.lastMessagePreview != null && c.lastMessagePreview !== '') {
              const text = c.lastMessagePreview.slice(0, 30) + (c.lastMessagePreview.length > 30 ? '…' : '');
              dispatch({
                type: 'SET_CHAT_LAST_MESSAGE_PREVIEW',
                payload: { chatId: c.id, text, isOwn: !!c.lastMessageIsOwn },
              });
            }
          }
          dispatch({ type: 'SET_CHAT_NAMES', payload: names });
          dispatch({ type: 'SET_CHAT_LAST_MESSAGE_TIMES', payload: lastMessageTimes });
          for (const c of chats) {
            if (!state.messagesByChat[c.id]) {
              dispatch({ type: 'MERGE_MESSAGES', payload: { chatId: c.id, messages: [] } });
            }
          }
        } catch {
          // ignore
        }
        break;
      }

      case 'messages_list': {
        if (!msg.chatId || !msg.content) break;
        try {
          const data = JSON.parse(msg.content) as { messages?: MessageFromServer[] };
          const list = state.messagesByChat[msg.chatId] ?? [];
          const serverStatus = (s: string): DisplayMessage['status'] =>
            (s === 'read' || s === 'delivered' || s === 'sent' ? s : 'sent') as DisplayMessage['status'];
          const newMessages: DisplayMessage[] = [];
          for (const m of data.messages ?? []) {
            if (m.isDeleted) continue;
            const existing = list.find((x) => x.id === m.id);
            if (existing) {
              newMessages.push({ ...existing, status: serverStatus(m.status) });
              continue;
            }
            const sm = m as MessageFromServer & { senderUsername?: string | null };
            newMessages.push({
              id: m.id,
              clientMessageId: m.clientMessageId ?? undefined,
              chatId: m.chatId,
              senderId: m.senderId,
              senderUsername: sm.senderUsername ?? undefined,
              content: m.content,
              sequenceNumber: m.sequenceNumber,
              timestamp: m.timestamp ?? m.createdAt ?? m.updatedAt ?? 0,
              status: serverStatus(m.status),
              isOwn: m.senderId === currentUserId,
              editedAt: m.editedAt,
              forwardFrom: mapForwardFrom(m),
              forwardBatchId:
                m.forwardBatchId != null && m.forwardBatchId !== ''
                  ? m.forwardBatchId
                  : undefined,
              replyTo: parseReplyToData(sm.replyToData),
              attachments: parseAttachments((sm as MessageFromServer & { attachments?: string | null }).attachments),
            });
          }
          const merged = [...list];
          for (const nm of newMessages) {
            const idx = merged.findIndex((x) => x.id === nm.id);
            if (idx >= 0) merged[idx] = nm;
            else merged.push(nm);
          }
          merged.sort((a, b) => a.timestamp - b.timestamp);
          dispatch({ type: 'SET_MESSAGES', payload: { chatId: msg.chatId, messages: merged } });
          const lastM = merged[merged.length - 1];
          if (lastM) {
            const raw = lastM.content.slice(0, 30) + (lastM.content.length > 30 ? '…' : '');
            const attachmentKind = getAttachmentKind(lastM.attachments);
            dispatch({
              type: 'SET_CHAT_LAST_MESSAGE_PREVIEW',
              payload: { chatId: msg.chatId, text: raw, isOwn: lastM.isOwn, attachmentKind },
            });
          }
          dispatch({ type: 'RECOMPUTE_UNREAD' });
        } catch {
          // ignore
        }
        break;
      }

      case 'ack': {
        if (!msg.clientMessageId || !msg.id) break;
        const pending = state.pendingByClientId[msg.clientMessageId];
        if (!pending) break;
        const ackChatId = (msg as ServerMessage & { chatId?: string }).chatId;
        if (pending.chatId === '' && ackChatId && state.composeToUsername) {
          dispatch({
            type: 'SET_CHAT_NAME',
            payload: { chatId: ackChatId, name: state.composeToUsername },
          });
        }
        dispatch({
          type: 'ACK_MESSAGE',
          payload: {
            clientMessageId: msg.clientMessageId,
            serverId: msg.id,
            chatId: ackChatId,
          },
        });
        if (ackChatId) {
          dispatch({
            type: 'SET_CHAT_LAST_MESSAGE_TIME',
            payload: { chatId: ackChatId, time: pending.sentAt },
          });
          const raw = pending.content.slice(0, 30) + (pending.content.length > 30 ? '…' : '');
          dispatch({
            type: 'SET_CHAT_LAST_MESSAGE_PREVIEW',
            payload: { chatId: ackChatId, text: raw, isOwn: true },
          });
        }
        persist(getState());
        break;
      }

      case 'message': {
        if (!msg.chatId || msg.senderId == null) break;
        const extendedMsg = msg as ServerMessage & {
          senderUsername?: string;
          status?: string;
          editedAt?: number;
          isForwarded?: boolean;
          forwardFromSenderId?: string | null;
          forwardFromSenderName?: string | null;
          forwardFromTimestamp?: number | null;
          forwardBatchId?: string | null;
          replyToData?: string | null;
          attachments?: string | null;
        };
        const list = state.messagesByChat[msg.chatId] ?? [];
        const existingById = list.some((m) => m.id === msg.id);
        if (existingById) break;
        const byClientId = msg.clientMessageId ? list.find((m) => m.clientMessageId === msg.clientMessageId) : null;
        if (byClientId) {
          dispatch({ type: 'REMOVE_PENDING', payload: msg.clientMessageId! });
        }
        const nextList = byClientId
          ? list.filter((m) => m.clientMessageId !== msg.clientMessageId)
          : list;
        const baseList = nextList;

        if (state.composeToUsername && !state.chatNames[msg.chatId]) {
          dispatch({
            type: 'SET_CHAT_NAME',
            payload: { chatId: msg.chatId, name: state.composeToUsername },
          });
          dispatch({ type: 'SELECT_CHAT', payload: msg.chatId });
          dispatch({ type: 'INIT_STATE', payload: { composeToUsername: null } });
        }
        if (extendedMsg.senderUsername && msg.senderId !== currentUserId) {
          const currentName = state.chatNames[msg.chatId];
          if (!currentName || currentName === shortIdFn(msg.chatId)) {
            dispatch({
              type: 'SET_CHAT_NAME',
              payload: { chatId: msg.chatId, name: extendedMsg.senderUsername },
            });
          }
        }

        const newMsg: DisplayMessage = {
          id: msg.id ?? crypto.randomUUID(),
          clientMessageId: msg.clientMessageId,
          chatId: msg.chatId,
          senderId: msg.senderId,
          senderUsername: extendedMsg.senderUsername ?? undefined,
          content: msg.content ?? '',
          sequenceNumber: msg.sequenceNumber,
          timestamp: msg.timestamp ?? Date.now(),
          status: (extendedMsg.status === 'read' ||
          extendedMsg.status === 'delivered' ||
          extendedMsg.status === 'sent'
            ? extendedMsg.status
            : 'sent') as DisplayMessage['status'],
          isOwn: msg.senderId === currentUserId,
          editedAt: extendedMsg.editedAt,
          forwardFrom: mapForwardFrom(extendedMsg),
          forwardBatchId:
            extendedMsg.forwardBatchId != null && extendedMsg.forwardBatchId !== ''
              ? extendedMsg.forwardBatchId
              : undefined,
          replyTo: parseReplyToData(extendedMsg.replyToData),
          attachments: parseAttachments(extendedMsg.attachments),
        };

        dispatch({
          type: 'MERGE_MESSAGES',
          payload: { chatId: msg.chatId, messages: [...baseList, newMsg].sort((a, b) => a.timestamp - b.timestamp) },
        });
        dispatch({
          type: 'SET_CHAT_LAST_MESSAGE_TIME',
          payload: { chatId: msg.chatId, time: newMsg.timestamp },
        });
        const rawPreview = newMsg.content.slice(0, 30) + (newMsg.content.length > 30 ? '…' : '');
        const attachmentKind = getAttachmentKind(newMsg.attachments);
        dispatch({
          type: 'SET_CHAT_LAST_MESSAGE_PREVIEW',
          payload: { chatId: msg.chatId, text: rawPreview, isOwn: newMsg.isOwn, attachmentKind },
        });

        if (msg.senderId !== currentUserId) {
          const preview = (msg.content && String(msg.content).trim()) || (newMsg.attachments?.length ? 'Вложение' : '');
          onNotify(state.chatNames[msg.chatId] ?? 'Новое сообщение', preview);
          if (state.selectedChatId !== msg.chatId) {
            dispatch({ type: 'INCREMENT_UNREAD', payload: msg.chatId });
          } else if (state.selectedChatId === msg.chatId) {
            dispatch({
              type: 'SET_LAST_READ',
              payload: { chatId: msg.chatId, ts: newMsg.timestamp },
            });
          }
        } else if (state.selectedChatId === msg.chatId) {
          dispatch({
            type: 'SET_LAST_READ',
            payload: { chatId: msg.chatId, ts: newMsg.timestamp },
          });
        }
        persist(getState());
        break;
      }

      case 'message_deleted': {
        const payload = msg.content
          ? (typeof msg.content === 'string'
              ? JSON.parse(msg.content)
              : msg.content) as { messageId?: string; chatId?: string; forEveryone?: boolean }
          : {};
        const mid = payload.messageId ?? msg.id;
        const cid = payload.chatId ?? msg.chatId;
        if (!mid || !cid) break;
        if (payload.forEveryone === true) {
          dispatch({
            type: 'DELETE_MESSAGE_FROM_CHAT',
            payload: { chatId: cid, messageId: mid },
          });
        } else {
          dispatch({ type: 'DELETE_MESSAGE_FOR_ME', payload: mid });
        }
        persist(getState());
        break;
      }

      case 'message_edited': {
        const payload = msg.content
          ? (typeof msg.content === 'string'
              ? JSON.parse(msg.content)
              : msg.content) as {
              messageId?: string;
              chatId?: string;
              newContent?: string;
              editedAt?: number;
            }
          : {};
        const mid = payload.messageId ?? msg.id;
        const cid = payload.chatId ?? msg.chatId;
        if (!mid || !cid || payload.newContent == null) break;
        dispatch({
          type: 'EDIT_MESSAGE_CONTENT',
          payload: {
            chatId: cid,
            messageId: mid,
            content: payload.newContent,
            editedAt: payload.editedAt ?? Date.now(),
          },
        });
        persist(getState());
        break;
      }

      case 'chat_deleted': {
        const payload = msg.content
          ? (typeof msg.content === 'string'
              ? JSON.parse(msg.content)
              : msg.content) as { chatId?: string; forBoth?: boolean }
          : {};
        const cid = payload.chatId ?? msg.chatId;
        if (!cid) break;
        if (payload.forBoth === true) {
          dispatch({ type: 'DELETE_CHAT_FOR_BOTH', payload: cid });
        } else {
          dispatch({ type: 'DELETE_CHAT_FOR_ME', payload: cid });
        }
        persist(getState());
        break;
      }

      case 'messages_read': {
        if (!msg.chatId || !msg.content) break;
        try {
          const data = (typeof msg.content === 'string'
            ? JSON.parse(msg.content)
            : msg.content) as { messageIds?: string[] };
          dispatch({
            type: 'SET_MESSAGE_READ',
            payload: { chatId: msg.chatId, messageIds: data.messageIds ?? [] },
          });
          persist(getState());
        } catch {
          // ignore
        }
        break;
      }

      default:
        break;
    }
  };
}
