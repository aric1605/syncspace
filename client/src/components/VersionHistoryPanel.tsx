import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useToast } from '../context/ToastContext.js';

export interface SnapshotItem {
  id: string;
  workspaceId: string;
  label: string | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: string;
}

interface VersionHistoryPanelProps {
  workspaceId: string;
  isOwner: boolean;
  refreshTrigger?: number;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  workspaceId,
  isOwner,
  refreshTrigger,
}) => {
  const { showToast } = useToast();
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await apiFetch<{ snapshots: SnapshotItem[] }>(
        `/api/workspaces/${workspaceId}/snapshots`
      );
      setSnapshots(data.snapshots);
    } catch (err: any) {
      // Ignored if failed
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots, refreshTrigger]);

  const handleRestore = async (snap: SnapshotItem) => {
    const snapName = snap.label ? `"${snap.label}"` : `snapshot from ${new Date(snap.createdAt).toLocaleString()}`;
    if (
      !window.confirm(
        `Are you sure you want to restore ${snapName}? This will replace the current document content for all users.`
      )
    ) {
      return;
    }

    setRestoringId(snap.id);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/snapshots/${snap.id}/restore`, {
        method: 'POST',
      });
      showToast('Document restored successfully from snapshot', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to restore snapshot', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '12px 0' }}>
        Loading version history...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          SNAPSHOTS ({snapshots.length})
        </h3>
      </div>

      {snapshots.length === 0 ? (
        <div
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          No saved snapshots yet. Click <strong>Save Version</strong> to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-color)' }}>
                    {snap.label || 'Untitled Snapshot'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    By {snap.creatorName || 'Unknown'} • {new Date(snap.createdAt).toLocaleDateString()} at{' '}
                    {new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {isOwner && (
                  <button
                    onClick={() => handleRestore(snap)}
                    disabled={restoringId === snap.id}
                    className="btn btn-secondary"
                    style={{
                      padding: '4px 8px',
                      minHeight: '28px',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                    }}
                    title="Restore document to this snapshot"
                  >
                    {restoringId === snap.id ? 'Restoring...' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
