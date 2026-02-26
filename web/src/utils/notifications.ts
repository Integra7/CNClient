import { escapeHtml } from './format';

const NOTIFICATION_SOUND_URL = `${import.meta.env.BASE_URL}sounds/when-604.mp3`;

export function playNotificationSound(): void {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function showMessageNotification(
  senderName: string,
  bodyPreview: string,
  showInPageToast: (title: string, body: string) => void
): void {
  const isTabVisible = document.visibilityState === 'visible';

  if (isTabVisible) {
    showInPageToast(senderName, bodyPreview);
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const showViaPage = (): void => {
    try {
      const n = new Notification(senderName, { body: bodyPreview });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 8000);
    } catch {
      // ignore
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) {
          reg.active.postMessage({
            type: 'showNotification',
            title: senderName,
            body: bodyPreview,
          });
        } else {
          showViaPage();
        }
      })
      .catch(showViaPage);
  } else {
    showViaPage();
  }
}

export function showInPageToast(title: string, body: string): void {
  const toast = document.createElement('div');
  toast.className = 'cn-toast';
  const preview = body.length > 80 ? body.slice(0, 80) + '…' : body;
  toast.innerHTML = `
    <span class="cn-toast-title">${escapeHtml(title)}</span>
    <span class="cn-toast-body">${escapeHtml(preview)}</span>
  `;
  toast.addEventListener('click', () => {
    toast.remove();
    window.focus();
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('cn-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('cn-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
