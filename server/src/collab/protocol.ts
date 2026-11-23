import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import { SharedDoc } from './sharedDoc.js';
import { Role } from '../workspaces/roles.js';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

export function send(conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState === WebSocket.OPEN) {
    try {
      conn.send(message, { binary: true });
    } catch (err) {
      // Ignore send errors on dying connections
    }
  }
}

export function broadcastDocUpdate(doc: SharedDoc, update: Uint8Array, origin: any): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);

  for (const [conn] of doc.conns) {
    if (conn !== origin) {
      send(conn, message);
    }
  }
}

export function broadcastAwarenessUpdate(
  doc: SharedDoc,
  changedClients: number[],
  origin: any
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients)
  );
  const message = encoding.toUint8Array(encoder);

  for (const [conn] of doc.conns) {
    if (conn !== origin) {
      send(conn, message);
    }
  }
}

export function sendInitialSync(doc: SharedDoc, conn: WebSocket): void {
  // 1. Send Sync Step 1 to client
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, doc.doc);
  send(conn, encoding.toUint8Array(syncEncoder));

  // 2. Send current awareness states to client
  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        doc.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    send(conn, encoding.toUint8Array(awarenessEncoder));
  }
}

export function handleMessage(
  doc: SharedDoc,
  conn: WebSocket,
  message: Uint8Array,
  role: Role
): void {
  try {
    const decoder = decoding.createDecoder(message);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncMessageType = decoding.readVarUint(decoder);

        switch (syncMessageType) {
          case syncProtocol.messageYjsSyncStep1:
            // Client asks for document updates matching its state vector
            syncProtocol.readSyncStep1(decoder, encoder, doc.doc);
            if (encoding.length(encoder) > 1) {
              send(conn, encoding.toUint8Array(encoder));
            }
            break;

          case syncProtocol.messageYjsSyncStep2:
            // Server receiving sync step 2 update
            if (role === 'viewer') {
              // DROP incoming sync update from viewer
              decoding.readVarUint8Array(decoder);
            } else {
              syncProtocol.readSyncStep2(decoder, doc.doc, conn);
            }
            break;

          case syncProtocol.messageYjsUpdate:
            // Incremental edit update
            if (role === 'viewer') {
              // DROP incoming edit update from viewer
              decoding.readVarUint8Array(decoder);
            } else {
              syncProtocol.readUpdate(decoder, doc.doc, conn);
            }
            break;

          default:
            console.warn(`Unknown sync message type: ${syncMessageType}`);
        }
        break;
      }

      case MESSAGE_AWARENESS: {
        // Awareness updates (cursors, selections) are allowed for all users including viewers
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
      }

      default:
        console.warn(`Unknown protocol message type: ${messageType}`);
    }
  } catch (err: any) {
    console.error('Error handling collab message:', err);
  }
}
