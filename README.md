# SyncSpace

> Real-time collaborative workspaces with zero-conflict rich-text editing, presence awareness, and role-based permissions.

[![Deploy to Render](https://img.shields.io/badge/Deploy-Render-blue?logo=render)](https://render.com)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)

---

## Live Demo & Screenshots

- **Live URL**: *(Demo URL placeholder — deploy following instructions below)*
- **Demo Walkthrough**:
  *(Screenshots placeholder)*
  - Desktop Split View: Two users editing simultaneously with live coloured cursors.
  - Workspace Management: Role assignment (Owner, Editor, Viewer) and invite links.
  - Snapshot Restore: Instant document rewind to historical version across all peers.

---

## Features

1. **Authentication**: Register, login, and profile fetching with bcrypt password hashing (10 rounds) and 12-hour signed JWT access tokens.
2. **Dedicated Workspaces**: Multi-tenant workspace architecture where each workspace automatically holds exactly one collaborative document.
3. **Role-Based Access Control (RBAC)**:
   - **Owner**: Full administrative control, member role promotions/demotions, member removals, invite generation/revocation, document deletion, and version snapshot restore. Protects against removing or demoting the last remaining owner.
   - **Editor**: Real-time collaborative document editing and named version snapshot creation.
   - **Viewer**: Real-time read-only view. Enforced strictly at the WebSocket protocol level on the server (incoming sync updates are dropped).
4. **Secure Invite Links**: Tokenized 7-day revocable invite links for Editor and Viewer roles. Idempotent join prevents accidental downgrades of existing higher roles.
5. **Conflict-Free Real-Time Editing**: TipTap WYSIWYG editor powered by Yjs Conflict-free Replicated Data Types (CRDT).
6. **Presence & Awareness**:
   - Remote cursor tracking with user name flags.
   - Header avatar stack showing active collaborators currently in the document.
   - Redis-backed workspace member list indicating online/offline status with minimal quota consumption.
7. **Dual-Tier Persistence**:
   - **Server-Side**: Debounced flush (2s trailing, 10s max wait) of binary Yjs state updates to PostgreSQL. Immediate flush on last disconnect and on server `SIGTERM`.
   - **Client-Side**: Offline IndexedDB caching via `y-indexeddb` to ensure zero data loss during network blips or free-tier server sleeping.
8. **Version History & Restore**: Snapshot creation with optional descriptions (retains last 20 milestones). Instant full document restoration using XML fragment cloning.
9. **Resilient Connection Lifecycle**: Single-use connection ticket flow preventing JWT exposure in WebSocket URLs, automated exponential backoff reconnection, and graceful cold-start notice ("Server is waking up").

---

## Architecture

```mermaid
flowchart TD
    subgraph Client["Browser (React 18 + TipTap + Yjs)"]
        UI["TipTap UI / React Router"]
        YDocClient["Y.Doc + y-indexeddb"]
        WSClient["WebsocketProvider (Custom Ticket Reconnect)"]
    end

    subgraph Edge["Routing & Security"]
        Vercel["Vercel (Static SPA)"]
        Render["Render Web Service (Docker Node.js)"]
    end

    subgraph Server["SyncSpace Server (Express + ws)"]
        REST["REST API (/api/*)"]
        TicketService["Ticket Service (One-Time Tokens)"]
        WSServer["WebSocket Server (/collab/:workspaceId)"]
        Registry["In-Memory SharedDoc Registry"]
        YDocServer["Server Y.Doc + y-protocols"]
    end

    subgraph Data["Managed Cloud Infrastructure"]
        Postgres[("Neon PostgreSQL\n(Workspaces, Users, Documents, Snapshots)")]
        Redis[("Upstash Redis\n(Rate Limits, Presence, One-Time Tickets)")]
    end

    UI --> REST
    REST --> Postgres
    REST --> Redis

    %% WebSocket Handshake Flow
    REST -- "1. POST /api/ws-ticket" --> TicketService
    TicketService -- "2. SETEX ticket:token 30s" --> Redis
    TicketService -- "3. Return ticket" --> UI
    WSClient -- "4. GET /collab/:id?ticket=token" --> WSServer
    WSServer -- "5. GETDEL ticket:token" --> Redis
    WSServer --> Registry
    Registry --> YDocServer

    %% Real-time Sync & Persistence
    WSClient <== "y-protocols sync & awareness" ==> WSServer
    YDocServer -- "Debounced binary state save" --> Postgres
    YDocServer -- "Heartbeat presence (every 30s)" --> Redis
```

---

## How Conflicts Are Resolved (CRDT)

SyncSpace guarantees that multiple users editing the same paragraph concurrently will always converge to the exact same document without data loss or locking. 

Under the hood, SyncSpace represents rich text using **Yjs**, an operation-based Conflict-free Replicated Data Type (CRDT). Every character, node, and format attribute inserted into the document is tagged with an immutable Lamport timestamp and a unique client identifier. When concurrent edits occur simultaneously (for instance, User A typing at character index 5 while User B deletes character index 5), both operations are deterministically ordered based on their Lamport clocks and client IDs. Because the merge function is mathematically commutative and associative, all peers reach identical document states regardless of the network arrival order of individual packets.

---

## Permission Model

| Action | Owner | Editor | Viewer | Server Enforcement Mechanism |
| :--- | :---: | :---: | :---: | :--- |
| Read Document Content | Yes | Yes | Yes | Sync Step 1/2 dispatched to all authenticated members |
| Live Awareness (Cursor / Presence) | Yes | Yes | Yes | `messageAwareness` processed for all connected roles |
| Edit Document Content | Yes | Yes | No | **Server drops `messageYjsUpdate` & sync step 2 from Viewers** |
| Create Named Version Snapshot | Yes | Yes | No | `requireRole('editor')` middleware on `POST /snapshots` |
| Restore Document from Snapshot | Yes | No | No | `requireRole('owner')` middleware on `POST /restore` |
| Generate & Revoke Invite Links | Yes | No | No | `requireRole('owner')` middleware on `POST /invites` |
| Change Member Roles | Yes | No | No | `requireRole('owner')` (protected: cannot demote last owner) |
| Remove Member / Delete Workspace | Yes | No | No | `requireRole('owner')` (protected: cannot remove last owner) |

---

## WebSocket Auth: Single-Use Ticket Flow

### Why Not Pass JWT in the WebSocket URL?
Passing JSON Web Tokens in query parameters (e.g. `ws://server/collab/123?token=jwt...`) is an anti-pattern. Query strings are recorded in plain text across server access logs, reverse proxy headers, browser history, and monitoring dashboards. Furthermore, standard WebSocket connection APIs in browsers do not allow custom `Authorization: Bearer` headers during the HTTP upgrade handshake.

### The Ticket Protocol
1. The authenticated client makes an authorized POST request: `POST /api/ws-ticket { workspaceId }` sending the JWT in the standard `Authorization: Bearer` header.
2. The server verifies user authentication and workspace membership.
3. The server generates a high-entropy random token (`crypto.randomBytes(24)`), saves `{ userId, workspaceId, role, name, color }` in Redis with an expiration of 30 seconds (`SET ticket:<token> EX 30`), and returns the token to the client.
4. The client opens the WebSocket connection: `GET /collab/:workspaceId?ticket=<token>`.
5. The server's HTTP upgrade handler consumes the ticket atomically using `GETDEL` (or atomic get and delete). If the ticket is invalid, expired, or belongs to another workspace, the connection is rejected with an HTTP `401 Unauthorized` before upgrading.
6. When reconnecting after a network interruption, the client automatically requests a fresh single-use ticket.

---

## Persistence & Quota-Friendly Presence Design

### Persistence
- Every edit in the live `SharedDoc` triggers a trailing debounce timer (2 seconds) with a hard maximum wait (10 seconds).
- The document state is encoded into a compact binary format (`Y.encodeStateAsUpdate(doc)`) and stored in PostgreSQL (`documents.ydoc_state`).
- When all active connections to a workspace disconnect, the document is immediately flushed to disk. After 30 seconds of zero active connections, the document is safely evicted from memory to preserve server resources.
- On server shutdown (`SIGTERM` / `SIGINT`), all active in-memory documents are flushed.

### Quota-Friendly Redis Presence
Unlike naive presence implementations that query or update Redis on every keystroke, SyncSpace utilizes a low-overhead heartbeat strategy:
- **On Connect**: `SET presence:<workspaceId>:<userId> 1 EX 60`.
- **Heartbeat (Every 30 Seconds)**: The server scans connected connections and issues a single `SET ... EX 60` refresh per unique active user, NOT per message or per cursor move.
- **On Disconnect**: When the user's last connection to that workspace closes, `DEL presence:<workspaceId>:<userId>` is executed.
- **Online List**: Workspace member online flags are retrieved in a single batched `MGET` call.
- **Fault-Tolerant**: If Redis becomes unavailable, presence checks degrade gracefully without throwing errors or blocking document collaboration.

---

## Environment Variables

### Server (`server/.env`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Local server port | `4000` |
| `DATABASE_URL` | Neon POOLED connection string (requires `sslmode=require`, remove `&channel_binding=require`) | `postgres://user:pass@ep-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `REDIS_URL` | Upstash Redis `rediss://` TCP connection string | `rediss://default:token@sample.upstash.io:6379` |
| `JWT_SECRET` | Secret key for signing access tokens (>= 32 chars) | `your_at_least_32_characters_random_secret_string` |
| `FRONTEND_URL` | Frontend origin for CORS and invite links (no trailing slash) | `http://localhost:5173` |
| `NODE_ENV` | Runtime environment | `development` or `production` |

### Client (`client/.env`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend HTTP API base URL (no trailing slash) | `http://localhost:4000` |
| `VITE_WS_URL` | Backend WebSocket base URL | `ws://localhost:4000` |

---

## Local Development

### Prerequisites
- Node.js 20+
- Neon account (free tier Postgres)
- Upstash account (free tier Redis)
- Git Bash on Windows

### 1. Configure Server Environment
In `server/.env`:
```env
PORT=4000
DATABASE_URL=postgres://<user>:<pass>@<neon-pooler-host>/neondb?sslmode=require
REDIS_URL=rediss://default:<pass>@<upstash-host>:6379
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Run schema migration once:
```bash
cd server
npm run migrate
```

### 2. Configure Client Environment
In `client/.env`:
```env
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
```

### 3. Start Development Servers
In Terminal 1 (Server):
```bash
cd server
npm run dev
```

In Terminal 2 (Client):
```bash
cd client
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## Deployment Guide

Follow these exact steps to deploy SyncSpace to production:

### 1. Database (Neon)
1. Log in to [Neon Console](https://console.neon.tech/) and create a new project.
2. Under Connection Details, select **Pooled connection**.
3. Copy the pooled connection string. Ensure it includes `sslmode=require` and **remove any `&channel_binding=require` parameter**.
4. In your local `server/.env`, set `DATABASE_URL` to this connection string and run migrations once:
   ```bash
   cd server
   npm run migrate
   ```

### 2. Redis (Upstash)
1. Log in to [Upstash Console](https://console.upstash.com/) and create a new Redis database.
2. Select the **Node.js (ioredis)** connection tab and copy the `rediss://...` TCP URL.

### 3. Push to GitHub
In Git Bash:
```bash
git branch -M main
git remote add origin https://github.com/aric1605/syncspace.git
git push -u origin main
```

### 4. Deploy Backend (Render)
1. Log in to [Render Dashboard](https://dashboard.render.com/) and create a **New Web Service**.
2. Connect your `syncspace` GitHub repository.
3. Configure the service:
   - **Environment**: Docker (uses `server/Dockerfile`)
   - **Root Directory**: `server`
   - **Health Check Path**: `/health`
4. Set Environment Variables in Render:
   - `DATABASE_URL`: Your Neon pooled connection string.
   - `REDIS_URL`: Your Upstash `rediss://` URL.
   - `JWT_SECRET`: Random string (32+ characters).
   - `FRONTEND_URL`: `https://your-app.vercel.app` *(temporary until client is deployed; update after step 5)*.
   - `NODE_ENV`: `production`
5. Click **Create Web Service**. Note the assigned URL (e.g. `https://syncspace-server.onrender.com`).
   > *Note*: On Render's free tier, the instance will spin down after inactivity. The first request after sleep may take ~30 seconds to respond. SyncSpace displays a helpful banner during this wake-up phase.

### 5. Deploy Frontend (Vercel)
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Import your `syncspace` repository.
3. Configure settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
4. Add Environment Variables in Vercel:
   - `VITE_API_URL`: Your Render HTTPS URL without trailing slash (e.g. `https://syncspace-server.onrender.com`).
   - `VITE_WS_URL`: Your Render WSS URL (e.g. `wss://syncspace-server.onrender.com`).
5. Click **Deploy**.
6. Once deployed, copy your production Vercel domain, navigate back to your Render dashboard, update `FRONTEND_URL` to match your Vercel URL, and trigger a manual redeploy on Render.

### 6. Verify Production Setup
1. Verify `/health`: Visit `https://syncspace-server.onrender.com/health` in your browser. Ensure it returns `{"ok":true,"db":true,"redis":true}`.
2. Open two separate browser windows (or one incognito window).
3. Register User A in Window 1 and User B in Window 2.
4. User A creates a workspace, generates an invite link via the **Share** button, and sends it to User B.
5. User B accepts the invite. Both users open the workspace and type concurrently. Verify live coloured cursors, typing convergence, and real-time presence.
6. Verify viewer permissions by changing User B's role to Viewer; confirm that any local edits from User B are immediately dropped by the server.

---

## Known Limitations

- **Single Server Instance**: The document registry resides in memory on a single Node.js instance. To scale horizontally across multiple container instances, cross-server pub/sub via Redis (`y-redis`) would be required.
- **Snapshot Restore Replacement**: Document restore currently clones and replaces the XML fragment content within a single transaction. While this propagates cleanly to all connected peers, it replaces the live tree structure rather than executing a linear git-style three-way merge.
- **Free-Tier Cold Starts**: On free container tiers (such as Render), inactive instances sleep after 15 minutes of idle time. The client gracefully displays a warning banner when connections take longer than 4 seconds.
- **No Email Provider**: Workspace invitations are tokenized URLs designed for manual sharing; an outbound SMTP/SES provider is not included.

---

## What I'd Do Next

1. **Redis Pub/Sub for Horizontal Scalability**: Integrate `y-redis` to broadcast Yjs sync steps across multiple backend replicas behind a load balancer.
2. **Per-Document Auth Token Caching**: Cache workspace membership roles in Redis with a 60-second TTL to reduce database query volume during frequent WebSocket reconnections.
3. **Snapshots Compaction**: Implement a background job to compact and archive historical document snapshots older than 30 days.
4. **Rich Commenting Annotations**: Add inline document comments linked to Yjs text ranges (`Y.RelativePosition`).
