import { useAppStore } from '../store/appStore';

export default function Toast() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}
          onClick={() => removeToast(t.id)}
          style={{ cursor: 'pointer' }}
          title="Click to dismiss"
        >
          {t.text}
          <div
            className="toast-timer"
            style={{ animationDuration: t.type === 'error' ? '6s' : '3s' }}
          />
        </div>
      ))}
    </div>
  );
}
