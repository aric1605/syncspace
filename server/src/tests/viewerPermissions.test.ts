import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import { handleMessage, MESSAGE_SYNC } from '../collab/protocol.js';
import { SharedDoc } from '../collab/sharedDoc.js';

describe('Viewer Permission Enforcement', () => {
  it('drops incoming sync updates from a viewer and applies updates from an editor', () => {
    // Shared document initialized on server
    const sharedDoc = new SharedDoc('test-workspace');
    const serverText = sharedDoc.doc.getText('content');
    expect(serverText.toString()).toBe('');

    // Mock WebSocket connection
    const fakeWs = {
      readyState: 1,
      send: vi.fn(),
    } as any;

    // Client creates an update
    const clientDoc = new Y.Doc();
    clientDoc.getText('content').insert(0, 'Unauthorized edit attempt');
    const update = Y.encodeStateAsUpdate(clientDoc);

    // Build binary sync message (messageSync + messageYjsUpdate)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    // 1. Simulate viewer connection sending the update
    handleMessage(sharedDoc, fakeWs, message, 'viewer');

    // Document MUST NOT change
    expect(serverText.toString()).toBe('');

    // 2. Simulate editor connection sending the update
    handleMessage(sharedDoc, fakeWs, message, 'editor');

    // Document MUST be updated
    expect(serverText.toString()).toBe('Unauthorized edit attempt');
  });

  it('drops incoming sync step 2 updates from a viewer', () => {
    const sharedDoc = new SharedDoc('test-workspace-2');
    const serverFrag = sharedDoc.doc.getXmlFragment('default');
    expect(serverFrag.length).toBe(0);

    const fakeWs = {
      readyState: 1,
      send: vi.fn(),
    } as any;

    // Client creates a paragraph
    const clientDoc = new Y.Doc();
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Step 2 text')]);
    clientDoc.getXmlFragment('default').push([p]);

    // Build binary sync message (messageSync + messageYjsSyncStep2)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep2(encoder, clientDoc);
    const message = encoding.toUint8Array(encoder);

    // As viewer: dropped
    handleMessage(sharedDoc, fakeWs, message, 'viewer');
    expect(serverFrag.length).toBe(0);

    // As editor: applied
    handleMessage(sharedDoc, fakeWs, message, 'editor');
    expect(serverFrag.length).toBe(1);
    expect(serverFrag.toString()).toBe('<paragraph>Step 2 text</paragraph>');
  });
});
