/**
 * Менеджер звукового звонка 1-на-1 в режиме relay: медиа по WebSocket (call_media).
 * Единый формат: 48 kHz моно 16-bit PCM, чанки 20 ms. Без ресемплинга — одна частота на запись и воспроизведение.
 */

import type { ClientMessage } from './types';
import type { AppAction } from './store/types';

const SAMPLE_RATE = 48000;
const CHUNK_MS = 20;
const CHUNK_SAMPLES = Math.round((SAMPLE_RATE * CHUNK_MS) / 1000); // 960 сэмплов = 20 ms
const PLAY_GAIN = 2.5;           // усиление воспроизведения (тихий звук)
const MAX_PLAY_BUFFER_S = 0.12;  // не накапливать больше ~120 ms
const MIN_PLAY_AHEAD_S = 0.02;

export type SendFn = (msg: ClientMessage) => void;
export type DispatchFn = (action: AppAction) => void;

export interface CallManager {
  startCall(calleeId: string): Promise<void>;
  acceptCall(callId: string): Promise<void>;
  rejectCall(callId: string): void;
  hangup(): void;
  setMuted(muted: boolean): void;
  handleServerMessage(
    type: string,
    payload: { callId?: string; sdp?: string; iceCandidate?: string; content?: string }
  ): void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function createCallManager(send: SendFn, dispatch: DispatchFn): CallManager {
  let currentCallId: string | null = null;
  let localStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let sendBuffer: Int16Array | null = null;
  let sendBufferOffset = 0;
  let muted = false;
  let playbackContext: AudioContext | null = null;
  let playbackGain: GainNode | null = null;
  let nextPlayTime = 0;
  let mediaActive = false;

  function cleanup(): void {
    mediaActive = false;
    if (scriptNode) {
      try {
        scriptNode.disconnect();
      } catch {}
      scriptNode = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    currentCallId = null;
    sendBuffer = null;
    sendBufferOffset = 0;
    playbackGain = null;
    playbackContext?.close().catch(() => {});
    playbackContext = null;
    nextPlayTime = 0;
    dispatch({ type: 'CALL_STATUS', payload: 'idle' });
  }

  function sendMediaChunk(callId: string, pcmInt16: Int16Array): void {
    const buf = pcmInt16.buffer.slice(
      pcmInt16.byteOffset,
      pcmInt16.byteOffset + pcmInt16.byteLength
    );
    send({ type: 'call_media', callId, content: arrayBufferToBase64(buf) });
  }

  function startSendingMedia(_callId: string): void {
    if (mediaActive || !localStream) return;
    mediaActive = true;
    try {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContext = ctx;
      const source = ctx.createMediaStreamSource(localStream);
      sourceNode = source;
      sendBuffer = new Int16Array(CHUNK_SAMPLES);
      sendBufferOffset = 0;

      const processor = ctx.createScriptProcessor(1024, 1, 1);
      scriptNode = processor;
      processor.onaudioprocess = (e) => {
        if (!sendBuffer || !currentCallId || muted) return;
        const input = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i] ?? 0));
          sendBuffer[sendBufferOffset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
          if (sendBufferOffset === CHUNK_SAMPLES) {
            sendMediaChunk(currentCallId, sendBuffer);
            sendBufferOffset = 0;
          }
        }
      };
      source.connect(processor);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      processor.connect(silent);
      silent.connect(ctx.destination);
    } catch (err) {
      dispatch({ type: 'CALL_ERROR', payload: err instanceof Error ? err.message : 'Ошибка захвата аудио' });
    }
  }

  function stopSendingMedia(): void {
    mediaActive = false;
    if (scriptNode) {
      try {
        scriptNode.disconnect();
      } catch {}
      scriptNode = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    sendBuffer = null;
    sendBufferOffset = 0;
  }

  function playChunk(base64Content: string): void {
    if (!base64Content) return;
    try {
      const buf = base64ToArrayBuffer(base64Content);
      const int16 = new Int16Array(buf);
      const samples = int16.length;
      if (samples === 0) return;
      const ctx = playbackContext ?? new AudioContext({ sampleRate: SAMPLE_RATE });
      if (!playbackContext) {
        playbackContext = ctx;
        playbackGain = ctx.createGain();
        playbackGain.gain.value = PLAY_GAIN;
        playbackGain.connect(ctx.destination);
        if (ctx.state === 'suspended') ctx.resume();
      }
      const duration = samples / SAMPLE_RATE;
      const audioBuffer = ctx.createBuffer(1, samples, SAMPLE_RATE);
      const channel = audioBuffer.getChannelData(0);
      for (let i = 0; i < samples; i++) {
        const v = int16[i] ?? 0;
        channel[i] = v / (v < 0 ? 0x8000 : 0x7fff);
      }
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackGain!);
      let when = Math.max(ctx.currentTime, nextPlayTime);
      if (when - ctx.currentTime > MAX_PLAY_BUFFER_S) {
        nextPlayTime = ctx.currentTime + MIN_PLAY_AHEAD_S;
        when = nextPlayTime;
      }
      source.start(when);
      nextPlayTime = when + duration;
    } catch {
      // ignore decode/play errors
    }
  }

  return {
    async startCall(calleeId: string) {
      if (currentCallId) return;
      try {
        send({ type: 'call_offer', calleeId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка вызова';
        dispatch({ type: 'CALL_ERROR', payload: msg });
        cleanup();
      }
    },

    async acceptCall(callId: string) {
      if (currentCallId) return;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        currentCallId = callId;
        send({ type: 'call_answer', callId });
        dispatch({ type: 'CALL_ANSWER_SENT', payload: { callId } });
        startSendingMedia(callId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка при приёме звонка';
        dispatch({ type: 'CALL_ERROR', payload: msg });
        cleanup();
      }
    },

    rejectCall(callId: string) {
      send({ type: 'call_reject', callId });
    },

    hangup() {
      if (currentCallId) {
        send({ type: 'call_hangup', callId: currentCallId });
      }
      stopSendingMedia();
      cleanup();
    },

    setMuted(mutedFlag: boolean) {
      muted = mutedFlag;
    },

    handleServerMessage(type: string, payload: { callId?: string; sdp?: string; iceCandidate?: string; content?: string }) {
      switch (type) {
        case 'call_offer_sent':
          if (payload.callId) currentCallId = payload.callId;
          break;

        case 'call_answer':
          if (payload.callId) {
            currentCallId = payload.callId;
            if (!localStream) {
              navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
                localStream = stream;
                startSendingMedia(payload.callId!);
              }).catch((err) => {
                dispatch({ type: 'CALL_ERROR', payload: err instanceof Error ? err.message : 'Нет доступа к микрофону' });
              });
            } else {
              startSendingMedia(payload.callId);
            }
          }
          break;

        case 'call_rejected':
        case 'call_hangup':
        case 'call_hangup_ok':
          cleanup();
          break;

        case 'call_media':
          if (payload.callId && payload.content && currentCallId === payload.callId) {
            playChunk(payload.content);
          }
          break;

        default:
          break;
      }
    },
  };
}
