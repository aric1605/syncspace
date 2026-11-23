import React from 'react';
import { useParams } from 'react-router-dom';

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <div style={{ padding: '40px' }}>
      <h1>Workspace Editor: {id}</h1>
    </div>
  );
};
