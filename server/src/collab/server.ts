import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { consumeWsTicket, TicketData } from './ticket.js';
import { SharedDoc, CollabConnectionMeta } from './sharedDoc.js';
import {
  handleMessage,
  sendInitialSync,
  broadcastDocUpdate,
  broadcastAwarenessUpdate,
} from './protocol.js';
import { setUserPresence, removeUserPresence } from '../presence/presence.js';
import * as awarenessProtocol from 'y-protocols/awareness';

const docsRegistry = new Map<string, SharedDoc>();

export function getSharedDocRegistry(): Map<string, SharedDoc> {
  return docsRegistry;
}

export async function getOrCreateSharedDoc(workspaceId: string): Promise<SharedDoc> {
  let doc = docsRegistry.get(workspaceId);
  if (doc) {
    doc.cancelIdleEviction();
    return doc;
  }

  doc = new SharedDoc(workspaceId);
  await doc.initialize();

  // Wire up Y.Doc update broadcasting
  doc.doc.on('update', (update, origin) => {
    broadcastDocUpdate(doc!, update, origin);
  });

  // Wire up Awareness broadcasting
  doc.awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: any
    ) => {
      const changed = added.concat(updated, removed);
      broadcastAwarenessUpdate(doc!, changed, origin);
    }
  );

  docsRegistry.set(workspaceId, doc);
  return doc;
}

export function setupCollabServer(httpServer: http.Server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024, // 1 MB limit
  });

  // HTTP Upgrade handler
  httpServer.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const pathname = url.pathname; // Expected: /collab/:workspaceId

    const match = pathname.match(/^\/collab\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      // Not a collab websocket request, ignore
      return;
    }

    const workspaceId = match[1];
    const ticket = url.searchParams.get('ticket');

    if (!ticket) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const ticketData = await consumeWsTicket(ticket);
    if (!ticketData || ticketData.workspaceId !== workspaceId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Connection limit check: max 20 connections per doc
    const existingDoc = docsRegistry.get(workspaceId);
    if (existingDoc && existingDoc.conns.size >= 20) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, ticketData);
    });
  });

  // WebSocket connection handler
  wss.on('connection', async (ws: WebSocket, _req: http.IncomingMessage, ticketData: TicketData) => {
    const { workspaceId, userId, role, name, color } = ticketData;
    const doc = await getOrCreateSharedDoc(workspaceId);

    // Limit check again in case of race condition
    if (doc.conns.size >= 20) {
      ws.close(4020, 'Workspace connection limit reached (max 20)');
      return;
    }

    const meta: CollabConnectionMeta = {
      userId,
      role,
      name,
      color,
      isAlive: true,
    };

    doc.conns.set(ws, meta);

    // Update Redis presence on connect
    setUserPresence(workspaceId, userId, 60);

    // Send initial sync handshake
    sendInitialSync(doc, ws);

    // Handle incoming messages
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let uint8: Uint8Array;
      if (Buffer.isBuffer(data)) {
        uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else if (Array.isArray(data)) {
        uint8 = new Uint8Array(Buffer.concat(data));
      } else {
        uint8 = new Uint8Array(data);
      }
      handleMessage(doc, ws, uint8, role);
    });

    // Heartbeat pong
    ws.on('pong', () => {
      meta.isAlive = true;
    });

    // Cleanup on disconnect
    ws.on('close', async () => {
      doc.conns.delete(ws);

      // Check if user still has other active connections in this workspace
      let userHasOtherConns = false;
      for (const otherMeta of doc.conns.values()) {
        if (otherMeta.userId === userId) {
          userHasOtherConns = true;
          break;
        }
      }

      if (!userHasOtherConns) {
        removeUserPresence(workspaceId, userId);
      }

      // If last connection closed
      if (doc.conns.size === 0) {
        await doc.flush();
        doc.scheduleIdleEviction(() => {
          docsRegistry.delete(workspaceId);
        });
      }
    });

    ws.on('error', (err) => {
      console.warn(`WebSocket client error for user ${userId}:`, err.message);
    });
  });

  // Heartbeat & Redis presence refresh every 30 seconds
  const heartbeatInterval = setInterval(() => {
    for (const [workspaceId, doc] of docsRegistry) {
      const activeUserIds = new Set<string>();

      for (const [conn, meta] of doc.conns) {
        if (!meta.isAlive) {
          conn.terminate();
          continue;
        }

        meta.isAlive = false;
        try {
          conn.ping();
        } catch (err) {
          conn.terminate();
        }

        activeUserIds.add(meta.userId);
      }

      // Refresh Redis presence: one command per connected user (not per message)
      for (const uid of activeUserIds) {
        setUserPresence(workspaceId, uid, 60);
      }
    }
  }, 30000);

  // Graceful shutdown handling
  const cleanup = async () => {
    clearInterval(heartbeatInterval);
    for (const doc of docsRegistry.values()) {
      await doc.flush();
      doc.destroy();
    }
    docsRegistry.clear();
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  return { wss, cleanup };
}
