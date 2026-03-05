/**
 * Dual-mode звонки: WebRTC (ПК↔ПК, прямое соединение) + fallback на relay (телефон без TURN).
 * Сначала попытка WebRTC с sdp/call_ice; по таймауту — повтор в relay (call_media).
 */

import type { ClientMessage } from './types';
import type { AppAction } from './store/types';
import { getTurnIceServers } from './config';

const STUN_SERVER: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };
const WEBRTC_CONNECT_TIMEOUT_MS = 12000;

function getIceServers(): RTCIceServer[] {
  const turn = getTurnIceServers();
  return turn.length > 0 ? [STUN_SERVER, ...turn] : [STUN_SERVER];
}

// --- Relay: константы и хелперы ---
const SAMPLE_RATE = 48000;
const CHUNK_MS = 20;
const CHUNK_SAMPLES = Math.round((SAMPLE_RATE * CHUNK_MS) / 1000);
const PLAY_GAIN = 2.5;
const MAX_PLAY_BUFFER_S = 0.12;
const MIN_PLAY_AHEAD_S = 0.02;

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

export type SendFn = (msg: ClientMessage) => void;
export type DispatchFn = (action: AppAction) => void;

export interface CallManager {
  startCall(calleeId: string): Promise<void>;
  acceptCall(callId: string, offerSdp?: string): Promise<void>;
  rejectCall(callId: string): void;
  hangup(): void;
  setMuted(muted: boolean): void;
  handleServerMessage(
    type: string,
    payload: { callId?: string; sdp?: string; iceCandidate?: string; content?: string }
  ): void;
}

export function createCallManager(send: SendFn, dispatch: DispatchFn): CallManager {
  type Mode = 'webrtc' | 'relay' | null;
  let mode: Mode = null;
  let currentCallId: string | null = null;
  let localStream: MediaStream | null = null;
  let calleeIdForRelayFallback: string | null = null;
  let webrtcTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // WebRTC
  let peerConnection: RTCPeerConnection | null = null;
  const pendingIceCandidates: RTCIceCandidateInit[] = [];
  let remoteAudioRef: HTMLAudioElement | null = null;

  // Relay
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

  function clearWebRTCTimeout(): void {
    if (webrtcTimeoutId) {
      clearTimeout(webrtcTimeoutId);
      webrtcTimeoutId = null;
    }
  }

  function cleanupWebRTC(): void {
    clearWebRTCTimeout();
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    pendingIceCandidates.length = 0;
    if (remoteAudioRef) {
      remoteAudioRef.srcObject = null;
      try {
        remoteAudioRef.remove();
      } catch {}
      remoteAudioRef = null;
    }
  }

  function stopRelayMedia(): void {
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
    playbackGain = null;
    playbackContext?.close().catch(() => {});
    playbackContext = null;
    nextPlayTime = 0;
  }

  function cleanup(): void {
    clearWebRTCTimeout();
    calleeIdForRelayFallback = null;
    cleanupWebRTC();
    stopRelayMedia();
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    currentCallId = null;
    mode = null;
    dispatch({ type: 'CALL_STATUS', payload: 'idle' });
  }

  function sendIce(callId: string, c: RTCIceCandidateInit): void {
    send({ type: 'call_ice', callId, iceCandidate: JSON.stringify(c) });
  }

  function flushPendingIce(): void {
    if (!currentCallId || !peerConnection) return;
    for (const c of pendingIceCandidates) {
      sendIce(currentCallId, c);
    }
    pendingIceCandidates.length = 0;
  }

  // --- Relay: отправка/воспроизведение ---
  function sendMediaChunk(callId: string, pcmInt16: Int16Array): void {
    const buf = pcmInt16.buffer.slice(
      pcmInt16.byteOffset,
      pcmInt16.byteOffset + pcmInt16.byteLength
    ) as ArrayBuffer;
    send({ type: 'call_media', callId, content: arrayBufferToBase64(buf) });
  }

  function startRelaySending(_callId: string): void {
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

  function playRelayChunk(base64Content: string): void {
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
      // ignore
    }
  }

  function startCallRelay(calleeId: string): void {
    calleeIdForRelayFallback = null;
    send({ type: 'call_offer', calleeId });
  }

  return {
    async startCall(calleeId: string) {
      if (currentCallId) return;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        peerConnection = pc;
        calleeIdForRelayFallback = calleeId;
        mode = 'webrtc';

        pc.onicecandidate = (e) => {
          if (!e.candidate) return;
          const c: RTCIceCandidateInit = {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid ?? undefined,
            sdpMLineIndex: e.candidate.sdpMLineIndex ?? undefined,
          };
          if (currentCallId) sendIce(currentCallId, c);
          else pendingIceCandidates.push(c);
        };

        pc.ontrack = (e) => {
          const stream = e.streams[0] ?? new MediaStream([e.track]);
          if (!remoteAudioRef) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', 'true');
            document.body.appendChild(audio);
            remoteAudioRef = audio;
          }
          remoteAudioRef.srcObject = stream;
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            clearWebRTCTimeout();
          }
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            dispatch({ type: 'CALL_ERROR', payload: pc.connectionState === 'failed' ? 'Соединение не установлено' : 'Соединение разорвано' });
          }
          if (pc.connectionState === 'closed') {
            cleanupWebRTC();
          }
        };

        for (const track of localStream.getAudioTracks()) {
          pc.addTrack(track, localStream);
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: 'call_offer', calleeId, sdp: offer.sdp ?? undefined });

        webrtcTimeoutId = setTimeout(() => {
          webrtcTimeoutId = null;
          if (peerConnection?.connectionState !== 'connected' && calleeIdForRelayFallback) {
            const fallbackCallee = calleeIdForRelayFallback;
            if (currentCallId) {
              send({ type: 'call_hangup', callId: currentCallId });
            }
            cleanupWebRTC();
            localStream?.getTracks().forEach((t) => t.stop());
            localStream = null;
            currentCallId = null;
            mode = null;
            startCallRelay(fallbackCallee);
          }
        }, WEBRTC_CONNECT_TIMEOUT_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Нет доступа к микрофону';
        dispatch({ type: 'CALL_ERROR', payload: msg });
        cleanup();
      }
    },

    async acceptCall(callId: string, offerSdp?: string) {
      if (currentCallId) return;
      currentCallId = callId;

      if (offerSdp?.trim()) {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          mode = 'webrtc';
          const pc = new RTCPeerConnection({ iceServers: getIceServers() });
          peerConnection = pc;

          pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            sendIce(callId, {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid ?? undefined,
              sdpMLineIndex: e.candidate.sdpMLineIndex ?? undefined,
            });
          };

          pc.ontrack = (e) => {
            const stream = e.streams[0] ?? new MediaStream([e.track]);
            if (!remoteAudioRef) {
              const audio = document.createElement('audio');
              audio.autoplay = true;
              audio.setAttribute('playsinline', 'true');
              document.body.appendChild(audio);
              remoteAudioRef = audio;
            }
            remoteAudioRef.srcObject = stream;
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              dispatch({ type: 'CALL_ERROR', payload: pc.connectionState === 'failed' ? 'Соединение не установлено' : 'Соединение разорвано' });
            }
            if (pc.connectionState === 'closed') cleanupWebRTC();
          };

          for (const track of localStream.getAudioTracks()) {
            pc.addTrack(track, localStream);
          }

          await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'call_answer', callId, sdp: answer.sdp ?? undefined });
          dispatch({ type: 'CALL_ANSWER_SENT', payload: { callId } });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ошибка при приёме звонка';
          dispatch({ type: 'CALL_ERROR', payload: msg });
          cleanup();
        }
      } else {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          mode = 'relay';
          send({ type: 'call_answer', callId });
          dispatch({ type: 'CALL_ANSWER_SENT', payload: { callId } });
          startRelaySending(callId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ошибка при приёме звонка';
          dispatch({ type: 'CALL_ERROR', payload: msg });
          cleanup();
        }
      }
    },

    rejectCall(callId: string) {
      send({ type: 'call_reject', callId });
    },

    hangup() {
      clearWebRTCTimeout();
      calleeIdForRelayFallback = null;
      if (currentCallId) {
        send({ type: 'call_hangup', callId: currentCallId });
      }
      stopRelayMedia();
      cleanup();
    },

    setMuted(mutedFlag: boolean) {
      muted = mutedFlag;
      if (localStream) {
        localStream.getAudioTracks().forEach((t) => {
          t.enabled = !mutedFlag;
        });
      }
    },

    handleServerMessage(type: string, payload: { callId?: string; sdp?: string; iceCandidate?: string; content?: string }) {
      switch (type) {
        case 'call_offer_sent':
          if (payload.callId) {
            currentCallId = payload.callId;
            flushPendingIce();
          }
          break;

        case 'call_answer':
          if (payload.callId) {
            currentCallId = payload.callId;
            if (payload.sdp?.trim() && peerConnection) {
              clearWebRTCTimeout();
              peerConnection.setRemoteDescription({ type: 'answer', sdp: payload.sdp }).then(flushPendingIce).catch((err) => {
                dispatch({ type: 'CALL_ERROR', payload: err instanceof Error ? err.message : 'Ошибка SDP' });
              });
            } else {
              mode = 'relay';
              if (!localStream) {
                navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
                  localStream = stream;
                  startRelaySending(payload.callId!);
                }).catch((err) => {
                  dispatch({ type: 'CALL_ERROR', payload: err instanceof Error ? err.message : 'Нет доступа к микрофону' });
                });
              } else {
                startRelaySending(payload.callId!);
              }
            }
          }
          break;

        case 'call_rejected':
        case 'call_hangup':
        case 'call_hangup_ok':
          cleanup();
          break;

        case 'call_ice':
          if (peerConnection && payload.iceCandidate) {
            try {
              const init = JSON.parse(payload.iceCandidate) as RTCIceCandidateInit;
              peerConnection.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
            } catch {
              // ignore
            }
          }
          break;

        case 'call_media':
          if (mode === 'relay' && payload.callId && payload.content && currentCallId === payload.callId) {
            playRelayChunk(payload.content);
          }
          break;

        default:
          break;
      }
    },
  };
}
