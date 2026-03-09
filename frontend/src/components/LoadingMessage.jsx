import './LoadingMessage.css';

export default function LoadingMessage({ label = 'Loading', className = '' }) {
  const combinedClassName = ['loading-message', className].filter(Boolean).join(' ');

  return (
    <div className={combinedClassName} role="status" aria-live="polite">
      <span className="loading-message-label">{label}</span>
      <span className="loading-message-dots" aria-hidden="true">
        <span className="loading-message-dot" />
        <span className="loading-message-dot" />
        <span className="loading-message-dot" />
      </span>
    </div>
  );
}
