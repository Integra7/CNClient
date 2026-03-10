import { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { clearSessionToken, getSessionToken } from './context/AppContext';
import { LoginScreen } from './components/LoginScreen';
import { AppMain } from './components/AppMain';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function App() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const token = getSessionToken();
    if (!token || state.currentUserId) return;

    const normalized = token.trim();
    if (!normalized) {
      clearSessionToken();
      return;
    }

    // Токен в этом проекте — UUID пользователя из login_success.
    // Если в storage лежит мусор/старое значение, не входим автоматически.
    if (isUuid(normalized)) {
      dispatch({ type: 'LOGIN_SUCCESS', payload: normalized });
    } else {
      clearSessionToken();
    }
  }, [dispatch, state.currentUserId]);

  if (state.currentUserId) {
    return <AppMain />;
  }
  return <LoginScreen />;
}
