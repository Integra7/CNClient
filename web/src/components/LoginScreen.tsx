import { useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { setSessionToken } from '../context/AppContext';
import { ChatWsClient } from '../ws-client';

const AUTH_TIMEOUT_MS = 10000;

export function LoginScreen() {
  const { state, dispatch, authClientRef } = useApp();
  const loginUsernameRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);
  const regUsernameRef = useRef<HTMLInputElement>(null);
  const regEmailRef = useRef<HTMLInputElement>(null);
  const regPasswordRef = useRef<HTMLInputElement>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAuthMessage = useCallback(
    (msg: { type: string; id?: string; error?: string }) => {
      switch (msg.type) {
        case 'login_success':
          if (msg.id) {
            setSessionToken(msg.id);
            authClientRef.current?.disconnect();
            authClientRef.current = null;
            dispatch({ type: 'LOGIN_SUCCESS', payload: msg.id });
          }
          break;
        case 'user_created':
          if (msg.id) {
            setSessionToken(msg.id);
            authClientRef.current?.disconnect();
            authClientRef.current = null;
            dispatch({ type: 'HIDE_REGISTER' });
            dispatch({ type: 'REGISTER_USER_CREATED' });
            dispatch({ type: 'LOGIN_SUCCESS', payload: msg.id });
          }
          break;
        case 'error': {
          const err = msg.error ?? 'Ошибка';
          dispatch({ type: 'SET_LOGIN_ERROR', payload: err });
          if (err === 'Username already exists') {
            dispatch({
              type: 'REGISTER_ERROR',
              payload: { message: 'Этот username уже занят', field: 'username' },
            });
            regUsernameRef.current?.focus();
          } else if (err === 'Email already exists') {
            dispatch({
              type: 'REGISTER_ERROR',
              payload: { message: 'Этот email уже используется', field: 'email' },
            });
            regEmailRef.current?.focus();
          } else {
            dispatch({
              type: 'REGISTER_SET_RESULT',
              payload: { result: err, status: 'error' },
            });
          }
          break;
        }
        default:
          break;
      }
    },
    [dispatch, authClientRef]
  );

  const tryLogin = useCallback(() => {
    const username = loginUsernameRef.current?.value.trim() ?? '';
    const password = loginPasswordRef.current?.value ?? '';
    if (!username || !password) {
      dispatch({ type: 'SET_LOGIN_ERROR', payload: 'Введите имя и пароль' });
      return;
    }
    dispatch({ type: 'SET_LOGIN_ERROR', payload: '' });
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    authClientRef.current?.disconnect();
    authClientRef.current = new ChatWsClient(handleAuthMessage, (connectionState) => {
      if (connectionState === 'connected') {
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
        authClientRef.current?.login(username, password);
      }
    });
    authClientRef.current.connect('');
    authTimeoutRef.current = setTimeout(() => {
      if (!authClientRef.current?.connected) {
        dispatch({
          type: 'SET_LOGIN_ERROR',
          payload: 'Не удалось подключиться. Проверьте интернет и попробуйте снова.',
        });
      }
      authTimeoutRef.current = null;
    }, AUTH_TIMEOUT_MS);
  }, [dispatch, handleAuthMessage, authClientRef]);

  const tryRegister = useCallback(() => {
    const username = regUsernameRef.current?.value.trim() ?? '';
    const email = regEmailRef.current?.value.trim() ?? '';
    const password = regPasswordRef.current?.value ?? '';
    if (!username || !email || !password) {
      dispatch({
        type: 'REGISTER_SET_RESULT',
        payload: { result: 'Заполните все поля', status: 'error' },
      });
      return;
    }
    if (username.length < 3 || username.length > 50) {
      dispatch({
        type: 'REGISTER_SET_RESULT',
        payload: { result: 'Имя пользователя: 3–50 символов', status: 'error' },
      });
      return;
    }
    if (password.length < 6) {
      dispatch({
        type: 'REGISTER_SET_RESULT',
        payload: { result: 'Пароль: минимум 6 символов', status: 'error' },
      });
      return;
    }
    dispatch({
      type: 'REGISTER_SET_RESULT',
      payload: { result: 'Отправка…', status: '' },
    });
    dispatch({ type: 'CLEAR_REGISTER_FIELD_ERRORS' });
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    authClientRef.current?.disconnect();
    authClientRef.current = new ChatWsClient(handleAuthMessage, (connectionState) => {
      if (connectionState === 'connected') {
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
        authClientRef.current?.createUser(username, email, password);
      }
    });
    authClientRef.current.connect('');
    authTimeoutRef.current = setTimeout(() => {
      if (!authClientRef.current?.connected) {
        dispatch({
          type: 'REGISTER_SET_RESULT',
          payload: { result: 'Не удалось подключиться к серверу.', status: 'error' },
        });
      }
      authTimeoutRef.current = null;
    }, AUTH_TIMEOUT_MS);
  }, [dispatch, handleAuthMessage, authClientRef]);

  useEffect(() => {
    return () => {
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    };
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>CosaNostra</h1>
        <p className="login-subtitle">Войдите в учётную запись или зарегистрируйтесь</p>

        {!state.showRegister ? (
          <div className="form-block">
            <h2>Вход</h2>
            <input
              ref={loginUsernameRef}
              id="login-username"
              type="text"
              placeholder="Имя пользователя"
              autoComplete="username"
            />
            <input
              ref={loginPasswordRef}
              id="login-password"
              type="password"
              placeholder="Пароль"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
            />
            {state.loginError ? (
              <div className="login-error">{state.loginError}</div>
            ) : null}
            <button type="button" id="login-btn" onClick={tryLogin}>
              Войти
            </button>
          </div>
        ) : (
          <div className="form-block" id="register-block">
            <h2>Регистрация</h2>
            <p className="create-user-hint">
              Имя и учётные данные (username, email, password). После создания вы сразу попадёте в мессенджер.
            </p>
            <input
              ref={regUsernameRef}
              id="reg-username"
              type="text"
              placeholder="Имя пользователя (3–50 символов)"
              autoComplete="username"
              className={state.register.usernameError ? 'field-error' : ''}
            />
            {state.register.usernameError ? (
              <div className="field-error-msg">{state.register.usernameError}</div>
            ) : null}
            <input
              ref={regEmailRef}
              id="reg-email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              className={state.register.emailError ? 'field-error' : ''}
            />
            {state.register.emailError ? (
              <div className="field-error-msg">{state.register.emailError}</div>
            ) : null}
            <input
              ref={regPasswordRef}
              id="reg-password"
              type="password"
              placeholder="Пароль (мин. 6 символов)"
              autoComplete="new-password"
            />
            <button type="button" id="register-btn" onClick={tryRegister}>
              Создать аккаунт
            </button>
            <div
              className="form-result"
              data-status={state.register.resultStatus}
            >
              {state.register.result}
            </div>
            <button
              type="button"
              className="link-btn back-link"
              onClick={() => {
                dispatch({ type: 'HIDE_REGISTER' });
                dispatch({ type: 'CLEAR_REGISTER_FIELD_ERRORS' });
                dispatch({ type: 'REGISTER_SET_RESULT', payload: { result: '', status: '' } });
              }}
            >
              ← Назад к входу
            </button>
          </div>
        )}

        {!state.showRegister ? (
          <div className="register-link-row">
            <button
              type="button"
              className="link-btn"
              onClick={() => dispatch({ type: 'SHOW_REGISTER' })}
            >
              Нет аккаунта? Зарегистрироваться
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
