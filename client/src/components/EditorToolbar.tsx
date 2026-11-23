import React from 'react';
import { Editor } from '@tiptap/react';

interface EditorToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, disabled = false }) => {
  if (!editor) return null;

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Text formatting toolbar">
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
        aria-label="Bold text"
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
        aria-label="Italic text"
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
        aria-label="Heading 1"
        title="Heading 1"
      >
        H1
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
        aria-label="Heading 2"
        title="Heading 2"
      >
        H2
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
        aria-label="Bullet list"
        title="Bullet list"
      >
        •—
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
        aria-label="Numbered list"
        title="Numbered list"
      >
        1.
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`toolbar-btn ${editor.isActive('codeBlock') ? 'is-active' : ''}`}
        aria-label="Code block"
        title="Code block"
      >
        &lt;/&gt;
      </button>

      <div className="toolbar-divider" />

      <button
        type="button"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        className="toolbar-btn"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        ↺
      </button>

      <button
        type="button"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        className="toolbar-btn"
        aria-label="Redo"
        title="Redo (Ctrl+Y)"
      >
        ↻
      </button>
    </div>
  );
};
