import * as Y from 'yjs';
import { query } from '../db.js';
import { getOrCreateSharedDoc } from '../collab/server.js';

export interface DocSnapshot {
  id: string;
  workspaceId: string;
  label: string | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: string;
}

export const snapshotService = {
  async listSnapshots(workspaceId: string): Promise<DocSnapshot[]> {
    const result = await query(
      `SELECT s.id, s.workspace_id AS "workspaceId", s.label, s.created_by AS "createdBy",
              u.name AS "creatorName", s.created_at AS "createdAt"
       FROM doc_snapshots s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.workspace_id = $1
       ORDER BY s.created_at DESC
       LIMIT 20`,
      [workspaceId]
    );
    return result.rows;
  },

  async createSnapshot(
    workspaceId: string,
    label: string | undefined,
    userId: string
  ): Promise<DocSnapshot> {
    const liveDoc = await getOrCreateSharedDoc(workspaceId);
    const ydocState = Buffer.from(Y.encodeStateAsUpdate(liveDoc.doc));

    const result = await query(
      `INSERT INTO doc_snapshots (workspace_id, ydoc_state, label, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id AS "workspaceId", label, created_by AS "createdBy", created_at AS "createdAt"`,
      [workspaceId, ydocState, label || null, userId]
    );

    const snap = result.rows[0];
    const userResult = await query('SELECT name FROM users WHERE id = $1', [userId]);

    return {
      ...snap,
      creatorName: userResult.rows[0]?.name || 'Unknown',
    };
  },

  async restoreSnapshot(workspaceId: string, snapshotId: string): Promise<void> {
    const result = await query(
      `SELECT ydoc_state FROM doc_snapshots
       WHERE id = $1 AND workspace_id = $2`,
      [snapshotId, workspaceId]
    );

    if (result.rows.length === 0) {
      throw new Error('Snapshot not found');
    }

    const snapshotState = result.rows[0].ydoc_state;
    const snapDoc = new Y.Doc();
    Y.applyUpdate(snapDoc, new Uint8Array(snapshotState));

    const liveSharedDoc = await getOrCreateSharedDoc(workspaceId);
    const liveFrag = liveSharedDoc.doc.getXmlFragment('default');
    const snapFrag = snapDoc.getXmlFragment('default');

    // Run transaction to replace live content with snapshot content
    liveSharedDoc.doc.transact(() => {
      // Clear all existing elements in live document fragment
      while (liveFrag.length > 0) {
        liveFrag.delete(0, 1);
      }

      // Clone each child element from snapshot fragment into live fragment
      for (let i = 0; i < snapFrag.length; i++) {
        const child = snapFrag.get(i);
        if (child && typeof (child as any).clone === 'function') {
          liveFrag.push([(child as any).clone()]);
        }
      }
    });

    // Clean up temporary snapshot doc
    snapDoc.destroy();

    // Persist restored state to Postgres immediately
    await liveSharedDoc.flush();
  },
};
