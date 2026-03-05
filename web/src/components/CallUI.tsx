import { useEffect, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CallUI() {
  const { state, dispatch, callManagerRef } = useApp();
  const { callStatus, callerUsername, callError, callStartTime, callMuted } = state;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCallActive = callStatus === 'outgoing' || callStatus === 'in-call';
  useEffect(() => {
    if (!isCallActive || callStartTime == null) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedSeconds(0);
      return;
    }
    const tick = () => {
      setElapsedSeconds(Math.floor((Date.now() - callStartTime!) / 1000));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isCallActive, callStartTime]);

  if (callStatus === 'idle' && !callError) return null;

  if (callError) {
    return (
      <div className="call-ui call-error-bar" role="alert">
        <span className="call-error-text">{callError}</span>
        <button
          type="button"
          className="call-dismiss-error"
          onClick={() => dispatch({ type: 'CALL_ERROR', payload: null })}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
    );
  }

  if (callStatus === 'incoming') {
    return (
      <div className="call-ui call-incoming-overlay" role="dialog" aria-label="Входящий звонок">
        <div className="call-incoming-box">
          <p className="call-incoming-title">Входящий звонок</p>
          <p className="call-incoming-caller">{callerUsername ?? 'Пользователь'}</p>
          <div className="call-incoming-actions">
            <button
              type="button"
              className="call-btn call-btn-accept call-btn-icon-only"
              onClick={() => {
                const { callId } = state;
                if (callId) callManagerRef.current?.acceptCall(callId);
              }}
              aria-label="Принять"
              title="Принять"
            >
              <svg className="call-action-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="call-btn call-btn-reject call-btn-icon-only"
              onClick={() => {
                const { callId } = state;
                if (callId) callManagerRef.current?.rejectCall(callId);
                dispatch({ type: 'CALL_REJECTED', payload: { callId: callId! } });
              }}
              aria-label="Отклонить"
              title="Отклонить"
            >
              <svg className="call-action-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.8-.18.16-.43.2-.66.1-.22-.1-.36-.3-.36-.55V8.05c0-.28.22-.5.5-.5.2 0 .39.1.5.28.76.72 1.6 1.38 2.5 1.88.36.2.58.57.58.96v2.2c.96-.45 1.96-.8 3-1.05V9.5h2v2.5c1.04.25 2.04.6 3 1.05v-2.2c0-.39.22-.76.58-.96.9-.5 1.74-1.16 2.5-1.88.11-.18.3-.28.5-.28.28 0 .5.22.5.5v6.5c0 .25-.14.45-.36.55-.23.1-.48.06-.66-.1-.79-.68-1.68-1.31-2.66-1.8-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCallActive) {
    const displayName = state.callerUsername ?? state.callPeerDisplayName ?? 'Собеседник';
    const isOutgoing = callStatus === 'outgoing';
    return (
      <div className="call-ui call-active-bar">
        <span className="call-active-label">
          {isOutgoing ? `Ожидание ответа от ${displayName}` : `Разговор с ${displayName}`}
        </span>
        <span className="call-timer" aria-live="polite">
          {formatCallDuration(elapsedSeconds)}
        </span>
        <div className="call-active-actions">
          <button
            type="button"
            className={`call-btn call-btn-mute ${callMuted ? 'muted' : ''}`}
            onClick={() => {
              const next = !callMuted;
              dispatch({ type: 'CALL_SET_MUTED', payload: next });
              callManagerRef.current?.setMuted(next);
            }}
            aria-label={callMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            title={callMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {callMuted ? (
              <svg className="call-action-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor" />
              </svg>
            ) : (
              <svg className="call-action-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.42 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="call-btn call-btn-hangup call-btn-icon-only"
            onClick={() => callManagerRef.current?.hangup()}
            aria-label={isOutgoing ? 'Отменить звонок' : 'Положить трубку'}
            title={isOutgoing ? 'Отменить звонок' : 'Положить трубку'}
          >
            <svg className="call-action-icon" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.8-.18.16-.43.2-.66.1-.22-.1-.36-.3-.36-.55V8.05c0-.28.22-.5.5-.5.2 0 .39.1.5.28.76.72 1.6 1.38 2.5 1.88.36.2.58.57.58.96v2.2c.96-.45 1.96-.8 3-1.05V9.5h2v2.5c1.04.25 2.04.6 3 1.05v-2.2c0-.39.22-.76.58-.96.9-.5 1.74-1.16 2.5-1.88.11-.18.3-.28.5-.28.28 0 .5.22.5.5v6.5c0 .25-.14.45-.36.55-.23.1-.48.06-.66-.1-.79-.68-1.68-1.31-2.66-1.8-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
