import React, { useState } from 'react';
import { apiFetch } from '../api.js';
import { useToast } from '../context/ToastContext.js';

interface SaveVersionModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SaveVersionModal: React.FC<SaveVersionModalProps> = ({
  workspaceId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [label, setLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await apiFetch(`/api/workspaces/${workspaceId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      showToast('Version snapshot saved successfully', 'success');
      setLabel('');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to save version snapshot', 'error');
    } finally {
      setIsSaving(false);
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
        style={{ width: '100%', maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
          Save Version Snapshot
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
          Create a named milestone in this document's history that can be restored later.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="snapshot-label"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px' }}
            >
              Version Label (Optional)
            </label>
            <input
              id="snapshot-label"
              type="text"
              className="input-field"
              placeholder="e.g. Q3 Roadmap Review, Pre-edit draft"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              maxLength={100}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
