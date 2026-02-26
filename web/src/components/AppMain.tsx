import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { clearSessionToken } from '../context/AppContext';
import { ChatSection } from './ChatSection';
import { ContextMenu } from './ContextMenu';
import { Modals } from './Modals';

export function AppMain() {
  const { state, dispatch, wsClientRef } = useApp();

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      const perm = Notification.permission as 'default' | 'granted' | 'denied';
      dispatch({ type: 'SET_NOTIFICATIONS_PERMISSION', payload: perm });
      dispatch({
        type: 'SET_SHOW_NOTIFICATIONS_BANNER',
        payload: perm !== 'granted',
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .catch(() => {});
    }
  }, [dispatch]);

  const handleLogout = () => {
    wsClientRef.current?.disconnect();
    wsClientRef.current = null;
    dispatch({ type: 'LOGOUT' });
    clearSessionToken();
  };

  const handleDisconnect = () => {
    wsClientRef.current?.disconnect();
    dispatch({ type: 'SET_CONNECTION_STATE', payload: 'disconnected' });
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    dispatch({
      type: 'SET_NOTIFICATIONS_PERMISSION',
      payload: p as 'default' | 'granted' | 'denied',
    });
    if (p === 'granted') {
      dispatch({ type: 'SET_SHOW_NOTIFICATIONS_BANNER', payload: false });
    }
  };

  const statusText =
    state.connectionState === 'connected'
      ? 'Подключено'
      : state.connectionState === 'connecting'
        ? 'Подключение…'
        : 'Отключено';

  return (
    <div className="app-main">
      <header className="app-header">
        <h1>CosaNostra</h1>
        <div className="connection">
          <span id="status" data-state={state.connectionState}>
            {statusText}
          </span>
          <button
            type="button"
            id="notifications-btn"
            title={
              state.notificationsPermission === 'granted'
                ? 'Уведомления включены'
                : state.notificationsPermission === 'denied'
                  ? 'Уведомления заблокированы'
                  : 'Включить уведомления в фоне'
            }
            onClick={requestNotificationPermission}
          >
            {state.notificationsPermission === 'granted' ? 'Уведомления ✓' : 'Уведомления'}
          </button>
          <button
            type="button"
            id="disconnect"
            disabled={state.connectionState !== 'connected'}
            onClick={handleDisconnect}
          >
            Отключиться
          </button>
          <button type="button" id="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      {state.showNotificationsBanner ? (
        <div className="notifications-banner" id="notifications-banner">
          <span className="notifications-banner-text">
            При свернутом браузере уведомления придут только если включить их.
          </span>
          <button
            type="button"
            id="notifications-banner-btn"
            onClick={requestNotificationPermission}
          >
            Включить
          </button>
        </div>
      ) : null}

      <ChatSection />

      <ContextMenu />
      <Modals />
    </div>
  );
}
