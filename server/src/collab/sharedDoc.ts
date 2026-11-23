import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { WebSocket } from 'ws';
import { query } from '../db.js';
import { Role } from '../workspaces/roles.js';

export interface CollabConnectionMeta {
  userId: string;
  role: Role;
  name: string;
  color: string;
  isAlive: boolean;
}

export class SharedDoc {
  readonly workspaceId: string;
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly conns = new Map<WebSocket, CollabConnectionMeta>();

  private trailingTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private isSaving = false;
  private isDirty = false;
  private isInitialized = false;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);

    // On Y.Doc updates, schedule debounced save
    this.doc.on('update', () => {
      this.isDirty = true;
      this.scheduleSave();
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const result = await query(
        'SELECT ydoc_state FROM documents WHERE workspace_id = $1',
        [this.workspaceId]
      );

      if (result.rows.length > 0 && result.rows[0].ydoc_state) {
        const updateBuffer = result.rows[0].ydoc_state;
        Y.applyUpdate(this.doc, new Uint8Array(updateBuffer));
      }
    } catch (err: any) {
      console.error(`Failed to load document state for workspace ${this.workspaceId}:`, err);
    } finally {
      this.isInitialized = true;
    }
  }

  cancelIdleEviction(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  scheduleIdleEviction(onEvict: () => void): void {
    this.cancelIdleEviction();
    this.idleTimer = setTimeout(() => {
      onEvict();
      this.destroy();
    }, 30000); // 30 seconds idle eviction
  }

  private scheduleSave(): void {
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer);
    }
    this.trailingTimer = setTimeout(() => this.saveDoc(), 2000); // 2s trailing

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => this.saveDoc(), 10000); // 10s max wait
    }
  }

  async saveDoc(): Promise<void> {
    if (this.trailingTimer) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }

    if (!this.isDirty || this.isSaving) return;

    this.isSaving = true;
    try {
      const update = Y.encodeStateAsUpdate(this.doc);
      await query(
        `UPDATE documents
         SET ydoc_state = $1, updated_at = now()
         WHERE workspace_id = $2`,
        [Buffer.from(update), this.workspaceId]
      );
      this.isDirty = false;
    } catch (err: any) {
      console.error(`Failed to persist document for workspace ${this.workspaceId}:`, err);
    } finally {
      this.isSaving = false;
    }
  }

  async flush(): Promise<void> {
    await this.saveDoc();
  }

  destroy(): void {
    if (this.trailingTimer) clearTimeout(this.trailingTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.awareness.destroy();
    this.doc.destroy();
  }
}
