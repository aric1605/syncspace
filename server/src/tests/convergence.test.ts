import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

describe('Yjs CRDT Convergence', () => {
  it('converges concurrently edited text across two documents regardless of order', () => {
    // Initial synchronized document state
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const textA = docA.getText('content');
    const textB = docB.getText('content');

    textA.insert(0, 'Hello world');
    const initialUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initialUpdate);

    expect(textA.toString()).toBe('Hello world');
    expect(textB.toString()).toBe('Hello world');

    // Concurrent edits
    // User A inserts at position 5 (" beautiful") -> "Hello beautiful world"
    textA.insert(5, ' beautiful');

    // User B appends at position 11 ("!") -> "Hello world!"
    textB.insert(11, '!');

    // Capture independent updates
    const updateFromA = Y.encodeStateAsUpdate(docA);
    const updateFromB = Y.encodeStateAsUpdate(docB);

    // Apply A's update to B, and B's update to A
    Y.applyUpdate(docB, updateFromA);
    Y.applyUpdate(docA, updateFromB);

    // Both documents must converge to the exact same text
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toBe('Hello beautiful world!');
  });

  it('converges concurrent XmlFragment modifications to identical XML structure', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const frag1 = doc1.getXmlFragment('default');
    const frag2 = doc2.getXmlFragment('default');

    // Base paragraph
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Initial line')]);
    frag1.push([p]);

    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Peer 1 adds paragraph at the end
    const p1 = new Y.XmlElement('paragraph');
    p1.insert(0, [new Y.XmlText('Added by peer 1')]);
    frag1.push([p1]);

    // Peer 2 adds paragraph at the end concurrently
    const p2 = new Y.XmlElement('paragraph');
    p2.insert(0, [new Y.XmlText('Added by peer 2')]);
    frag2.push([p2]);

    // Exchange updates
    const u1 = Y.encodeStateAsUpdate(doc1);
    const u2 = Y.encodeStateAsUpdate(doc2);

    Y.applyUpdate(doc1, u2);
    Y.applyUpdate(doc2, u1);

    expect(frag1.toString()).toBe(frag2.toString());
  });
});
