import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../context/ToastContext.js';

interface InvitePreview {
  workspaceId: string;
  workspaceName: string;
  role: 'editor' | 'viewer';
  revoked: boolean;
  expired: boolean;
}

export const InvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvite() {
      if (!token) return;
      try {
        const data = await apiFetch<{ invite: InvitePreview }>(`/api/invites/${token}`);
        setInvite(data.invite);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 404) {
          setError('This invite link is invalid or has expired.');
        } else {
          setError(err.message || 'Failed to verify invite link');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadInvite();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      const data = await apiFetch<{ ok: boolean; workspaceId: string; role: string }>(
        `/api/invites/${token}/accept`,
        { method: 'POST' }
      );
      showToast(`Joined workspace as ${data.role}`, 'success');
      navigate(`/w/${data.workspaceId}`, { replace: true });
    } catch (err: any) {
      showToast(err.message || 'Failed to accept invite', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <span>Verifying invite link...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent-color)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </div>

        {error ? (
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--danger-color)' }}>
              Invite Unavailable
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
              {error}
            </p>
            <Link to="/" className="btn btn-secondary">
              Go to Home
            </Link>
          </div>
        ) : invite?.revoked ? (
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--danger-color)' }}>
              Invite Revoked
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
              This invite link has been revoked by the workspace owner.
            </p>
            <Link to="/" className="btn btn-secondary">
              Go to Home
            </Link>
          </div>
        ) : invite?.expired ? (
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: 'var(--danger-color)' }}>
              Invite Expired
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
              This invite link expired after 7 days. Please request a new link from the workspace owner.
            </p>
            <Link to="/" className="btn btn-secondary">
              Go to Home
            </Link>
          </div>
        ) : invite ? (
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: '8px' }}>
              Workspace Invitation
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              You've been invited to join <strong style={{ color: 'var(--text-color)' }}>{invite.workspaceName}</strong> as an{' '}
              <span className={`badge badge-${invite.role}`}>{invite.role}</span>.
            </p>

            {user ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Logged in as <strong>{user.email}</strong>
                </p>
                <button
                  onClick={handleAccept}
                  disabled={isAccepting}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  {isAccepting ? 'Joining...' : 'Accept & Join Workspace'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Please sign in or create an account to accept this invitation.
                </p>
                <Link
                  to={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Sign In to Accept
                </Link>
                <Link
                  to={`/register?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  Create an Account
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
