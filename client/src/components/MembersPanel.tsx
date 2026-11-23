import React, { useState } from 'react';
import { apiFetch } from '../api.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  color: string;
  role: 'owner' | 'editor' | 'viewer';
  online?: boolean;
}

interface MembersPanelProps {
  workspaceId: string;
  currentUserRole: 'owner' | 'editor' | 'viewer';
  members: WorkspaceMember[];
  onMembersUpdated: () => void;
}

export const MembersPanel: React.FC<MembersPanelProps> = ({
  workspaceId,
  currentUserRole,
  members,
  onMembersUpdated,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const isOwner = currentUserRole === 'owner';
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  const handleRoleChange = async (memberId: string, newRole: 'owner' | 'editor' | 'viewer') => {
    setUpdatingUserId(memberId);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      showToast('Member role updated', 'success');
      onMembersUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to update role', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    const isSelf = member.id === user?.id;
    const confirmMsg = isSelf
      ? 'Are you sure you want to leave this workspace?'
      : `Remove ${member.name} from this workspace?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiFetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
        method: 'DELETE',
      });
      showToast(isSelf ? 'You have left the workspace' : `${member.name} removed`, 'info');
      if (isSelf) {
        window.location.href = '/';
      } else {
        onMembersUpdated();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          MEMBERS ({members.length})
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {members.map((member) => {
          const isSelf = member.id === user?.id;
          const isTargetLastOwner = member.role === 'owner' && ownerCount <= 1;

          return (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                gap: '10px',
              }}
            >
              {/* Member avatar & details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: member.color || 'var(--accent-color)',
                      color: '#FFFFFF',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Online indicator dot */}
                  <div
                    title={member.online ? 'Online now' : 'Offline'}
                    style={{
                      position: 'absolute',
                      bottom: '-1px',
                      right: '-1px',
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      backgroundColor: member.online ? 'var(--success-color)' : 'var(--text-muted)',
                      border: '2px solid var(--surface-color)',
                    }}
                  />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{member.name}</span>
                    {isSelf && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(you)</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {member.email}
                  </div>
                </div>
              </div>

              {/* Role selector or badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {isOwner && !isSelf ? (
                  <select
                    className="input-field"
                    value={member.role}
                    disabled={updatingUserId === member.id}
                    onChange={(e) =>
                      handleRoleChange(member.id, e.target.value as 'owner' | 'editor' | 'viewer')
                    }
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      minHeight: '28px',
                      height: '28px',
                      width: 'auto',
                    }}
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span className={`badge badge-${member.role}`}>{member.role}</span>
                )}

                {/* Remove / Leave button */}
                {(isOwner || isSelf) && !isTargetLastOwner && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member)}
                    className="btn btn-ghost"
                    style={{
                      padding: '4px 6px',
                      minHeight: '28px',
                      fontSize: '0.75rem',
                      color: 'var(--danger-color)',
                    }}
                    title={isSelf ? 'Leave workspace' : 'Remove member'}
                    aria-label={isSelf ? 'Leave workspace' : `Remove ${member.name}`}
                  >
                    {isSelf ? 'Leave' : '×'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
