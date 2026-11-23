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

interface WorkspaceData {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'editor' | 'viewer';
  members: WorkspaceMember[];
}

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection state
  const [connStatus, setConnStatus] = useState<ConnectionState>('connecting');
  const [isServerWaking, setIsServerWaking] = useState(false);
  const [activeUsers, setActiveUsers] = useState<AwarenessUser[]>([]);

  // UI Panels & Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'history'>('members');

  // Yjs and Provider Refs
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const wakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load Workspace Info
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

  // Connect WebSocket with Fresh Ticket & Exponential Backoff
  const connectWithFreshTicket = useCallback(async () => {
    if (!id || !isMountedRef.current || !providerRef.current) return;

    const provider = providerRef.current;

    // Start waking timer if not already running
    if (!wakingTimerRef.current) {
      wakingTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && connStatus !== 'connected') {
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

      // Update provider parameters with single-use ticket
      provider.params = { ticket: data.ticket };
      provider.connect();
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setConnStatus('offline');

      // Schedule reconnect with exponential backoff (1s -> 15s)
      retryCountRef.current++;
      const backoff = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
      setTimeout(() => {
        if (isMountedRef.current) {
          connectWithFreshTicket();
        }
      }, backoff);
    }
  }, [id, connStatus]);

  // Initialize Yjs, Indexeddb, and WebsocketProvider
  useEffect(() => {
    if (!id || !user) return;
    isMountedRef.current = true;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Offline persistence with IndexedDB
    const persistence = new IndexeddbPersistence(`syncspace-${id}`, ydoc);
    persistenceRef.current = persistence;

    // Derive WS URL
    const envWsUrl = import.meta.env.VITE_WS_URL;
    let wsBase: string;
    if (envWsUrl) {
      wsBase = envWsUrl.replace(/\/+$/, '');
    } else {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      wsBase = `${protocol}//${loc.host}`;
    }

    const wsUrl = `${wsBase}/collab`;

    // Initialize WebsocketProvider with auto-connect disabled
    const provider = new WebsocketProvider(wsUrl, id, ydoc, {
      connect: false,
      params: {},
    });
    providerRef.current = provider;

    // Set local awareness user
    provider.awareness.setLocalStateField('user', {
      userId: user.id,
      name: user.name,
      color: user.color,
    });

    // Listen to status changes
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
        setConnStatus('disconnected' as any);
      }
    });

    // Listen for disconnect / connection close to fetch fresh ticket
    provider.on('connection-close', () => {
      if (!isMountedRef.current) return;
      setConnStatus('reconnecting');
      provider.disconnect();

      // Exponential backoff reconnect
      retryCountRef.current++;
      const backoff = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
      setTimeout(() => {
        if (isMountedRef.current) {
          connectWithFreshTicket();
        }
      }, backoff);
    });

    // Track active collaborators via Awareness
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

    // Start initial connection
    connectWithFreshTicket();

    return () => {
      isMountedRef.current = false;
      if (wakingTimerRef.current) clearTimeout(wakingTimerRef.current);
      provider.disconnect();
      provider.destroy();
      persistence.destroy();
      ydoc.destroy();
    };
  }, [id, user, connectWithFreshTicket]);

  // TipTap Editor instance
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false, // Yjs Collaboration extension handles undo/redo
        }),
        ...(ydocRef.current && providerRef.current
          ? [
              Collaboration.configure({
                document: ydocRef.current,
                field: 'default',
              }),
              CollaborationCursor.configure({
                provider: providerRef.current,
                user: {
                  name: user?.name || 'Anonymous',
                  color: user?.color || '#6C7BFF',
                },
              }),
            ]
          : []),
      ],
      editable: workspace ? workspace.role !== 'viewer' : false,
    },
    [workspace?.role, ydocRef.current, providerRef.current]
  );

  // Sync editable status when workspace role updates
  useEffect(() => {
    if (editor && workspace) {
      editor.setEditable(workspace.role !== 'viewer');
    }
  }, [editor, workspace?.role]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ConnectionStatus status={connStatus} />
          <AvatarStack users={activeUsers} />

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
        </main>

        {/* Side Panel (Desktop side / Mobile drawer) */}
        {isSidePanelOpen && (
          <aside
            style={{
              width: '320px',
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
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '8px',
                gap: '12px',
              }}
            >
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

            {/* Tab content */}
            {activeTab === 'members' ? (
              <MembersPanel
                workspaceId={workspace.id}
                currentUserRole={workspace.role}
                members={workspace.members}
                onMembersUpdated={fetchWorkspace}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <p>Version history snapshots will be loaded here.</p>
              </div>
            )}
          </aside>
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
    </div>
  );
};
