# 🎨 Pixnette

A high-performance, real-time collaborative pixel art canvas application built to scale horizontally across clustered server nodes.

🌐 **Live Demo:** [www.pixnette.site](https://www.pixnette.site)

---

## ⚡ Features
- **Real-Time Collaboration:** Instantly sync pixel placements across all users using Socket.io cluster event pub/sub.
- **Durable Write-Back Queue:** Batches coordinate database writes to Postgres, protecting DB connections and avoiding Disk I/O bottlenecks.
- **Distributed Cache Layer:** Stores binary canvas representation directly in Redis, serving read streams at sub-millisecond latencies.
- **Frictionless Viewport Navigation:** Smooth zoom-at-point tracking, mobile pinch gestures, and pan navigation.
- **Timelapse Playback:** Scrub, control speed, and play back chronological pixel histories using optimized differences rendering.

---

## 📐 System Architecture

```mermaid
graph TD
    Client[React Client Vercel] <-->|WebSockets| Proxy[Nginx Gateway VPS]
    Proxy <-->|Round-Robin| Node1["Express Server 1 (Container: Port 3001)"]
    Proxy <-->|Round-Robin| Node2["Express Server 2 (Container: Port 3001)"]
    
    Node1 <-->|Cluster Pub/Sub| Sync[Socket.io Redis Adapter]
    Node2 <-->|Cluster Pub/Sub| Sync
    Sync <--> Cache[(Redis Cache VPS Local)]
    
    Node1 -->|In-Memory State| Cache
    Node2 -->|In-Memory State| Cache
    
    Node1 -.->|Batched Flushes| DB[(Neon Postgres DB)]
    Node2 -.->|Batched Flushes| DB
```

---

## 🛠️ Tech Stack

| Tier | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React + Vite + TailwindCSS | Double-buffered HTML5 canvases & touch-gesture controllers. |
| **Backend** | Express + Socket.io | Clustered Node.js services managing validations & rate limits. |
| **Caching** | Redis (VPS Local) | Binary canvas state storage & active cooldown TTL tracking. |
| **Database** | Neon Postgres | Transactional records store for canvas history & timelapse replays. |
| **Routing** | Cloudflare + Nginx | SSL termination, reverse proxying, and WebSocket load balancing. |

---

## 🚀 Quick Start (Local Setup)

### 1. Configure Environments

Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
REDIS_URL=redis://localhost:6379
PORT=3010
COOLDOWN_SECONDS=30
CANVAS_SIZE=64
FRONTEND_URL=http://localhost:5173
WRITE_BATCH_INTERVAL_MS=2000
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_BACKEND_URL=http://localhost:3010
VITE_CANVAS_SIZE=64
```

### 2. Run the Stack

Run the database schema setup first, then start the local development servers:

```bash
# Setup and run backend
cd backend
npm install
node setup-db.js
npm run dev

# Run frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```
