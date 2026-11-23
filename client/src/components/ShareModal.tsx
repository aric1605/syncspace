import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useToast } from '../context/ToastContext.js';

interface InviteItem {
  id: string;
  token: string;
  role: 'editor' | 'viewer';
  expiresAt: string;
  url: string;
  creatorName?: string;
}

interface ShareModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ workspaceId, isOpen, onClose }) => {
  const { showToast } = useToast();
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);

  const fetchInvites = async () => {
    try {
      const data = await apiFetch<{ invites: InviteItem[] }>(`/api/workspaces/${workspaceId}/invites`);
      setInvites(data.invites);
    } catch (err: any) {
      // Ignored if not owner or fails
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvites();
      setLastGeneratedUrl(null);
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const data = await apiFetch<{ invite: InviteItem; url: string }>(
        `/api/workspaces/${workspaceId}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ role }),
        }
      );
      setLastGeneratedUrl(data.url);
      showToast('Invite link created', 'success');
      fetchInvites();
    } catch (err: any) {
      showToast(err.message || 'Failed to create invite link', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy. Please select and copy manually.', 'error');
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await apiFetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      if (lastGeneratedUrl && invites.find((i) => i.id === inviteId)?.url === lastGeneratedUrl) {
        setLastGeneratedUrl(null);
      }
      showToast('Invite link revoked', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke invite', 'error');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Share Workspace</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '4px 8px', minHeight: 'unset', fontSize: '1.25rem' }}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
          Create an invite link to grant colleagues Editor or Viewer permissions to this document.
        </p>

        {/* Generate Invite Form */}
        <form
          onSubmit={handleCreateInvite}
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '24px',
            backgroundColor: 'var(--surface-hover)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ flex: 1 }}>
            <select
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              style={{ minHeight: '38px', height: '38px' }}
            >
              <option value="editor">Can Edit (Editor)</option>
              <option value="viewer">Can View (Viewer)</option>
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isGenerating}
            style={{ minHeight: '38px', whiteSpace: 'nowrap' }}
          >
            {isGenerating ? 'Creating...' : 'Create Link'}
          </button>
        </form>

        {/* Last generated link highlight */}
        {lastGeneratedUrl && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-color)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-color)', marginBottom: '4px' }}>
              NEW INVITE LINK (EXPIRES IN 7 DAYS)
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                readOnly
                value={lastGeneratedUrl}
                className="input-field"
                style={{
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  minHeight: '34px',
                  backgroundColor: 'var(--surface-color)',
                }}
              />
              <button
                type="button"
                onClick={() => handleCopy(lastGeneratedUrl)}
                className="btn btn-primary"
                style={{ minHeight: '34px', fontSize: '0.8125rem' }}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Active links list */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
            Active Invite Links ({invites.length})
          </h3>
          {invites.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No active invite links.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--surface-color)',
                    gap: '12px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span className={`badge badge-${inv.role}`}>{inv.role}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {inv.url}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(inv.url)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', minHeight: '28px', fontSize: '0.75rem' }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      className="btn btn-ghost"
                      style={{
                        padding: '4px 8px',
                        minHeight: '28px',
                        fontSize: '0.75rem',
                        color: 'var(--danger-color)',
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
