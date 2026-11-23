import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

import { useAuth } from '../context/AuthContext.js';
import { apiFetch, ApiError } from '../api.js';
import { EditorToolbar } from '../components/EditorToolbar.js';
import { AvatarStack, AwarenessUser } from '../components/AvatarStack.js';
import {
  ConnectionStatus,
  ConnectionState,
  ServerWakingBanner,
} from '../components/ConnectionStatus.js';
import { ShareModal } from '../components/ShareModal.js';
import { MembersPanel, WorkspaceMember } from '../components/MembersPanel.js';
import { SaveVersionModal } from '../components/SaveVersionModal.js';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel.js';

interface WorkspaceData {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'editor' | 'viewer';
  members: WorkspaceMember[];
}

interface CollabSession {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

// Subcomponent that initializes TipTap only after Y.Doc and WebsocketProvider are instantiated
const WorkspaceEditor: React.FC<{
  workspace: WorkspaceData;
  collab: CollabSession;
  userName: string;
  userColor: string;
}> = ({ workspace, collab, userName, userColor }) => {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false, // Collaboration handles undo/redo
        }),
        Collaboration.configure({
          document: collab.ydoc,
          field: 'default',
        }),
        CollaborationCursor.configure({
          provider: collab.provider,
          user: {
            name: userName,
            color: userColor,
          },
        }),
      ],
      editable: workspace.role !== 'viewer',
    },
    [workspace.role, collab.ydoc, collab.provider]
  );

  useEffect(() => {
    if (editor) {
      editor.setEditable(workspace.role !== 'viewer');
    }
  }, [editor, workspace.role]);

  return (
    <div style={{ width: '100%', maxWidth: '760px' }}>
      {workspace.role === 'viewer' && (
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>Read-only mode. You have viewer access to this document.</span>
        </div>
      )}

      <EditorToolbar editor={editor} disabled={workspace.role === 'viewer'} />

      <div
        className="card"
        style={{
          minHeight: '600px',
          padding: '40px 32px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Collab session state
  const [collab, setCollab] = useState<CollabSession | null>(null);

  // Connection state
  const [connStatus, setConnStatus] = useState<ConnectionState>('connecting');
  const connStatusRef = useRef<ConnectionState>('connecting');
  connStatusRef.current = connStatus;

  const [isServerWaking, setIsServerWaking] = useState(false);
  const [activeUsers, setActiveUsers] = useState<AwarenessUser[]>([]);

  // UI Panels & Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'history'>('members');
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Connection management refs
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const wakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch Workspace Info
  const fetchWorkspace = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{ workspace: WorkspaceData }>(`/api/workspaces/${id}`);
      setWorkspace(data.workspace);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setError('You do not have access to this workspace.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('Workspace not found.');
      } else {
        setError(err.message || 'Failed to load workspace.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Connect provider using a fresh ticket
  const connectProviderWithTicket = useCallback(
    async (provider: WebsocketProvider) => {
      if (!id || !isMountedRef.current) return;

      // Start waking notice if not connected after 4 seconds
      if (!wakingTimerRef.current) {
        wakingTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && connStatusRef.current !== 'connected') {
            setIsServerWaking(true);
          }
        }, 4000);
      }

      try {
        setConnStatus(retryCountRef.current === 0 ? 'connecting' : 'reconnecting');

        const data = await apiFetch<{ ticket: string }>('/api/ws-ticket', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: id }),
        });

        if (!isMountedRef.current) return;

        // Set ticket in provider URL query params
        provider.params = { ticket: data.ticket };
        provider.connect();
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setConnStatus('offline');

        retryCountRef.current++;
        const backoff = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectProviderWithTicket(provider);
          }
        }, backoff);
      }
    },
    [id]
  );

  // Initialize Yjs and WebsocketProvider once for this workspace
  useEffect(() => {
    if (!id || !user) return;
    isMountedRef.current = true;
    retryCountRef.current = 0;

    const ydoc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`syncspace-${id}`, ydoc);

    // Derive WebSocket base URL
    const envWsUrl = import.meta.env.VITE_WS_URL;
    const defaultWsUrl =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'ws://localhost:4000'
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const wsBase = (envWsUrl || defaultWsUrl).replace(/\/+$/, '');
    const wsUrl = `${wsBase}/collab`;

    // Create provider with auto-connect false
    const provider = new WebsocketProvider(wsUrl, id, ydoc, {
      connect: false,
      params: {},
    });

    // Set local awareness
    provider.awareness.setLocalStateField('user', {
      userId: user.id,
      name: user.name,
      color: user.color,
    });

    // Listen for provider status
    provider.on('status', ({ status }: { status: string }) => {
      if (!isMountedRef.current) return;

      if (status === 'connected') {
        setConnStatus('connected');
        setIsServerWaking(false);
        retryCountRef.current = 0;
        if (wakingTimerRef.current) {
          clearTimeout(wakingTimerRef.current);
          wakingTimerRef.current = null;
        }
      } else if (status === 'connecting') {
        setConnStatus('connecting');
      } else {
        setConnStatus('reconnecting');
      }
    });

    // Connection close handler: fetch new ticket and reconnect
    provider.on('connection-close', () => {
      if (!isMountedRef.current) return;

      setConnStatus('reconnecting');
      provider.disconnect();

      retryCountRef.current++;
      const backoff = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connectProviderWithTicket(provider);
        }
      }, backoff);
    });

    // Awareness changes
    provider.awareness.on('change', () => {
      if (!isMountedRef.current) return;

      const states = provider.awareness.getStates();
      const uniqueUsers = new Map<string, AwarenessUser>();

      states.forEach((state: any) => {
        if (state.user && state.user.name) {
          const key = state.user.userId || state.user.name;
          if (!uniqueUsers.has(key)) {
            uniqueUsers.set(key, state.user);
          }
        }
      });

      setActiveUsers(Array.from(uniqueUsers.values()));
    });

    setCollab({ ydoc, provider });

    // Initiate initial connection
    connectProviderWithTicket(provider);

    return () => {
      isMountedRef.current = false;
      if (wakingTimerRef.current) clearTimeout(wakingTimerRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      provider.disconnect();
      provider.destroy();
      persistence.destroy();
      ydoc.destroy();
      setCollab(null);
    };
  }, [id, user, connectProviderWithTicket]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '24px',
            height: '24px',
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--accent-color)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span>Loading workspace...</span>
      </div>
    );
  }

  if (error || !workspace) {
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
        <div className="card" style={{ maxWidth: '440px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger-color)', marginBottom: '8px' }}>Unable to Open Workspace</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
            {error || 'Workspace could not be found'}
          </p>
          <Link to="/" className="btn btn-primary">
            Back to Workspaces
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = workspace.role === 'owner';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Free tier server waking notification banner */}
      <ServerWakingBanner visible={isServerWaking} />

      {/* Editor Header */}
      <header
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--surface-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          gap: '12px',
        }}
      >
        {/* Left: Back + Workspace Title + Role */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            onClick={() => navigate('/')}
            className="btn btn-ghost"
            style={{ padding: '6px 8px', fontSize: '0.875rem' }}
            title="Return to workspaces list"
          >
            ← Workspaces
          </button>
          <div style={{ height: '18px', width: '1px', backgroundColor: 'var(--border-color)' }} />
          <h1
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '240px',
            }}
            title={workspace.name}
          >
            {workspace.name}
          </h1>
          <span className={`badge badge-${workspace.role}`}>{workspace.role}</span>
        </div>

        {/* Right: Status + Avatars + Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ConnectionStatus status={connStatus} />
          <AvatarStack users={activeUsers} />

          {workspace.role !== 'viewer' && (
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem', height: '34px', minHeight: '34px', padding: '0 12px' }}
              title="Save a named version snapshot"
            >
              Save Version
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem', height: '34px', minHeight: '34px', padding: '0 12px' }}
            >
              Share
            </button>
          )}

          {/* Toggle Side Panel */}
          <button
            onClick={() => setIsSidePanelOpen((prev) => !prev)}
            className={`btn btn-secondary ${isSidePanelOpen ? 'btn-primary' : ''}`}
            style={{ fontSize: '0.8125rem', height: '34px', minHeight: '34px', padding: '0 12px' }}
            aria-label="Toggle side panel"
          >
            Panel
          </button>
        </div>
      </header>

      {/* Editor Body + Side Panel */}
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* Editor Column */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px 16px',
            minWidth: 0,
          }}
        >
          {collab && user ? (
            <WorkspaceEditor
              workspace={workspace}
              collab={collab}
              userName={user.name}
              userColor={user.color}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)', padding: '40px' }}>Initializing editor...</div>
          )}
        </main>

        {/* Side Panel (Desktop side / Mobile drawer) */}
        {isSidePanelOpen && (
          <>
            <div
              className="side-panel-backdrop"
              onClick={() => setIsSidePanelOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="side-panel"
              style={{
                width: '340px',
                borderLeft: '1px solid var(--border-color)',
                backgroundColor: 'var(--surface-color)',
                display: 'flex',
                flexDirection: 'column',
                padding: '20px',
                gap: '20px',
                overflowY: 'auto',
              }}
            >
              {/* Tabs */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setActiveTab('members')}
                    className="btn btn-ghost"
                    style={{
                      padding: '4px 8px',
                      minHeight: 'unset',
                      fontSize: '0.875rem',
                      fontWeight: activeTab === 'members' ? 600 : 400,
                      color: activeTab === 'members' ? 'var(--accent-color)' : 'var(--text-muted)',
                      borderBottom: activeTab === 'members' ? '2px solid var(--accent-color)' : 'none',
                      borderRadius: 0,
                    }}
                  >
                    Members
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="btn btn-ghost"
                    style={{
                      padding: '4px 8px',
                      minHeight: 'unset',
                      fontSize: '0.875rem',
                      fontWeight: activeTab === 'history' ? 600 : 400,
                      color: activeTab === 'history' ? 'var(--accent-color)' : 'var(--text-muted)',
                      borderBottom: activeTab === 'history' ? '2px solid var(--accent-color)' : 'none',
                      borderRadius: 0,
                    }}
                  >
                    History
                  </button>
                </div>

                <button
                  onClick={() => setIsSidePanelOpen(false)}
                  className="btn btn-ghost"
                  style={{ padding: '2px 6px', minHeight: 'unset', fontSize: '1.25rem' }}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'members' ? (
                <MembersPanel
                  workspaceId={workspace.id}
                  currentUserRole={workspace.role}
                  members={workspace.members}
                  onMembersUpdated={fetchWorkspace}
                />
              ) : (
                <VersionHistoryPanel
                  workspaceId={workspace.id}
                  isOwner={isOwner}
                  refreshTrigger={historyRefreshTrigger}
                />
              )}
            </aside>
          </>
        )}
      </div>

      {/* Share Modal for Workspace Owner */}
      {isOwner && (
        <ShareModal
          workspaceId={workspace.id}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* Save Version Modal */}
      {workspace.role !== 'viewer' && (
        <SaveVersionModal
          workspaceId={workspace.id}
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSaved={() => {
            setHistoryRefreshTrigger((prev) => prev + 1);
            setActiveTab('history');
            setIsSidePanelOpen(true);
          }}
        />
      )}
    </div>
  );
};
