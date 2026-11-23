import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiFetch } from '../api.js';
import { useToast } from '../context/ToastContext.js';

interface WorkspaceItem {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
}

export const WorkspacesPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    try {
      const data = await apiFetch<{ workspaces: WorkspaceItem[] }>('/api/workspaces');
      setWorkspaces(data.workspaces);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setIsCreating(true);
    try {
      const data = await apiFetch<{ workspace: WorkspaceItem }>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });
      showToast('Workspace created successfully', 'success');
      setIsModalOpen(false);
      setNewWorkspaceName('');
      navigate(`/w/${data.workspace.id}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create workspace', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWorkspace = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete "${name}"?`)) {
      return;
    }

    try {
      await apiFetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      showToast('Workspace deleted', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete workspace', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--surface-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>SyncSpace</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: user.color || 'var(--accent-color)',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }} className="hide-on-mobile">
                {user.name}
              </span>
            </div>
          )}
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize: '0.875rem' }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '40px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Workspaces</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Select a workspace or create a new one to start writing with your team.
            </p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Workspace
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--danger-subtle)',
              border: '1px solid var(--danger-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger-color)',
              marginBottom: '24px',
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="card"
                style={{
                  height: '140px',
                  opacity: 0.5,
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '60px 24px',
              borderStyle: 'dashed',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              No workspaces yet
            </h2>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                maxWidth: '400px',
                margin: '0 auto 24px auto',
              }}
            >
              Create your first collaborative workspace to start editing documents in real-time.
            </p>
            <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
              Create Workspace
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="card"
                onClick={() => navigate(`/w/${ws.id}`)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  transition: 'border-color 0.15s ease, transform 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-color)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: 600,
                        color: 'var(--text-color)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ws.name}
                    </h3>
                    <span className={`badge badge-${ws.role}`}>{ws.role}</span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Created {new Date(ws.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '20px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ fontSize: '0.8125rem', color: 'var(--accent-color)', fontWeight: 500 }}>
                    Open document →
                  </span>
                  {ws.role === 'owner' && (
                    <button
                      onClick={(e) => handleDeleteWorkspace(e, ws.id, ws.name)}
                      className="btn btn-ghost"
                      style={{
                        padding: '4px 8px',
                        minHeight: '28px',
                        fontSize: '0.75rem',
                        color: 'var(--danger-color)',
                      }}
                      title="Delete workspace"
                      aria-label="Delete workspace"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Workspace Modal */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
              Create New Workspace
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              Workspaces contain a collaborative document with real-time sync.
            </p>

            <form onSubmit={handleCreateWorkspace}>
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="new-ws-name"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px' }}
                >
                  Workspace Name
                </label>
                <input
                  id="new-ws-name"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Engineering Specs, Design Sprints"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
