import React from 'react';

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';

interface ConnectionStatusProps {
  status: ConnectionState;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'var(--success-color)',
          text: 'Connected',
          dotStyle: { backgroundColor: 'var(--success-color)' },
        };
      case 'connecting':
      case 'reconnecting':
        return {
          color: 'var(--warning-color)',
          text: status === 'connecting' ? 'Connecting...' : 'Reconnecting...',
          dotStyle: {
            backgroundColor: 'var(--warning-color)',
            animation: 'pulse 1s infinite alternate',
          },
        };
      case 'offline':
      default:
        return {
          color: 'var(--danger-color)',
          text: 'Offline',
          dotStyle: { backgroundColor: 'var(--danger-color)' },
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: config.color,
      }}
      title={`Real-time sync status: ${config.text}`}
      role="status"
    >
      <div
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          ...config.dotStyle,
        }}
      />
      <span>{config.text}</span>
    </div>
  );
};

export const ServerWakingBanner: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'var(--accent-subtle)',
        borderBottom: '1px solid var(--accent-color)',
        color: 'var(--text-color)',
        padding: '8px 16px',
        fontSize: '0.8125rem',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          width: '12px',
          height: '12px',
          border: '2px solid var(--accent-color)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span>Server is waking up (Render free tier), this can take ~30s. Thanks for your patience!</span>
    </div>
  );
};
