import React from 'react';

export interface AwarenessUser {
  userId?: string;
  name: string;
  color: string;
}

interface AvatarStackProps {
  users: AwarenessUser[];
}

export const AvatarStack: React.FC<AvatarStackProps> = ({ users }) => {
  if (users.length === 0) return null;

  const maxVisible = 5;
  const visible = users.slice(0, maxVisible);
  const extraCount = users.length - maxVisible;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '8px',
      }}
      aria-label="Active collaborators in this document"
      title={`${users.length} active collaborator${users.length === 1 ? '' : 's'}`}
    >
      {visible.map((u, i) => (
        <div
          key={u.userId || u.name + i}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: u.color || 'var(--accent-color)',
            color: '#FFFFFF',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: i > 0 ? '-8px' : 0,
            border: '2px solid var(--surface-color)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            cursor: 'default',
            position: 'relative',
            zIndex: 10 - i,
          }}
          title={u.name}
        >
          {u.name.charAt(0).toUpperCase()}
        </div>
      ))}

      {extraCount > 0 && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: '-8px',
            border: '2px solid var(--surface-color)',
            zIndex: 4,
          }}
          title={`${extraCount} more collaborator${extraCount === 1 ? '' : 's'}`}
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
};
