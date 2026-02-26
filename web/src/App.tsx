import { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { getSessionToken } from './context/AppContext';
import { LoginScreen } from './components/LoginScreen';
import { AppMain } from './components/AppMain';

export function App() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const token = getSessionToken();
    if (token && !state.currentUserId) {
      dispatch({ type: 'LOGIN_SUCCESS', payload: token });
    }
  }, [dispatch, state.currentUserId]);

  if (state.currentUserId) {
    return <AppMain />;
  }
  return <LoginScreen />;
}
