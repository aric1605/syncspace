import React from 'react';
import { useParams } from 'react-router-dom';

export const InvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>Accept Invite: {token}</h1>
    </div>
  );
};
