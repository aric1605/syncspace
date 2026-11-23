import { WebSocket } from 'ws';

const BASE_URL = (process.argv[2] || process.env.BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

async function runSmokeTest() {
  console.log(`🚀 Starting SyncSpace smoke test against: ${BASE_URL}`);
  const timeoutTimer = setTimeout(() => {
    console.error('❌ FAIL: Smoke test timed out after 10s');
    process.exit(1);
  }, 10000);

  try {
    // 1. Health check
    console.log('1. Checking /health...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) {
      throw new Error(`/health returned status ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    console.log('   /health response:', healthData);

    // 2. Register random user
    const randomId = Math.random().toString(36).substring(2, 8);
    const email = `smoke_${randomId}@example.com`;
    const password = 'Password123!';
    console.log(`2. Registering test user (${email})...`);

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: `Smoke Tester ${randomId}`,
        password,
      }),
    });
    if (!regRes.ok) {
      const err = await regRes.text();
      throw new Error(`Register failed (${regRes.status}): ${err}`);
    }
    const { token, user } = await regRes.json();
    console.log(`   User registered (id: ${user.id})`);

    // 3. Create workspace
    console.log('3. Creating test workspace...');
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: `Smoke Workspace ${randomId}` }),
    });
    if (!wsRes.ok) {
      const err = await wsRes.text();
      throw new Error(`Create workspace failed (${wsRes.status}): ${err}`);
    }
    const { workspace } = await wsRes.json();
    console.log(`   Workspace created (id: ${workspace.id})`);

    // 4. Request WebSocket ticket
    console.log('4. Requesting one-time WebSocket ticket...');
    const ticketRes = await fetch(`${BASE_URL}/api/ws-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (!ticketRes.ok) {
      const err = await ticketRes.text();
      throw new Error(`Get ticket failed (${ticketRes.status}): ${err}`);
    }
    const { ticket } = await ticketRes.json();
    console.log('   Ticket acquired');

    // 5. Connect WebSocket and verify handshake
    const wsBaseUrl = BASE_URL.replace(/^http/, 'ws');
    const wsCollabUrl = `${wsBaseUrl}/collab/${workspace.id}?ticket=${ticket}`;
    console.log(`5. Connecting WebSocket to ${wsBaseUrl}/collab/${workspace.id}...`);

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsCollabUrl);

      ws.on('open', () => {
        console.log('   WebSocket connection established, awaiting sync handshake...');
      });

      ws.on('message', (data: Buffer) => {
        if (data.length > 0) {
          const messageType = data[0];
          // Message type 0 is sync step 1
          if (messageType === 0) {
            console.log('   ✅ Received sync handshake from server!');
            ws.close();
            resolve();
          }
        }
      });

      ws.on('error', (err) => {
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on('close', (code, reason) => {
        if (code !== 1000 && code !== 1005) {
          reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
        }
      });
    });

    clearTimeout(timeoutTimer);
    console.log('\n=============================');
    console.log('🎉 PASS: All smoke tests succeeded!');
    console.log('=============================\n');
    process.exit(0);
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    console.error('\n=============================');
    console.error(`💥 FAIL: ${err.message}`);
    console.error('=============================\n');
    process.exit(1);
  }
}

runSmokeTest();
