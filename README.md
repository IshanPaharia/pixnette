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
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&channel_binding=require
REDIS_URL=redis://localhost:6379
PORT=3010
COOLDOWN_SECONDS=30
CANVAS_SIZE=64
FRONTEND_URL=http://localhost:5173
WRITE_BATCH_INTERVAL_MS=2000
WRITE_FLUSH_STALE_MS=60000
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_ENABLE_CHANNEL_BINDING=true
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_BACKEND_URL=http://localhost:3010
VITE_CANVAS_SIZE=64
VITE_COOLDOWN_SECONDS=30
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

---

## 🔒 Production Security & Deployment (VPS)

When deploying to a production VPS, the services run inside a Docker network environment orchestrated by `docker-compose.yml`. For security, the system utilizes **Cloudflare SSL Termination (Full Strict)**, **Nginx Rate Limiting**, **Redis Password Authentication**, and **Docker Network Isolation**.

### 1. Cloudflare SSL/TLS Full (Strict) Setup
To encrypt traffic between Cloudflare's edge servers and your VPS Nginx gateway:
1. Log in to the Cloudflare Dashboard and navigate to **SSL/TLS > Overview**. Change the encryption mode to **Full (Strict)**.
2. Go to **SSL/TLS > Origin Server** and click **Create Certificate**.
3. Keep the default settings (RSA 2048, valid for 15 years, targeting `pixnette.site` and `*.pixnette.site`).
4. Copy the public certificate (PEM format) and save it as `ssl/origin.crt` in the root of the project on your VPS.
5. Copy the private key and save it as `ssl/origin.key` in the same `ssl/` folder.
*(Note: The `ssl/` folder is git-ignored to prevent sensitive credentials from leaking.)*

### 2. Configure Production Environment Variables
On the VPS, create a `.env` file in the root directory:
```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&channel_binding=require
COOLDOWN_SECONDS=30
CANVAS_SIZE=64
FRONTEND_URL=https://www.pixnette.site
WRITE_BATCH_INTERVAL_MS=2000
WRITE_FLUSH_STALE_MS=60000
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_ENABLE_CHANNEL_BINDING=true
# Optional if your provider gives you a custom CA bundle:
# DATABASE_SSL_CA_FILE=/absolute/path/to/database-ca.pem
# IMPORTANT: Override the default Redis password with a strong custom password!
REDIS_PASSWORD=a_very_strong_random_password_here
REDIS_CONNECT_TIMEOUT_MS=15000
REDIS_RECONNECT_MAX_MS=5000
```

In Vercel, configure the matching frontend variables:
```env
VITE_BACKEND_URL=https://api.pixnette.site
VITE_CANVAS_SIZE=64
VITE_COOLDOWN_SECONDS=30
```

### 3. Docker Network Isolation & Port Exposure
The production topology divides containers into two isolated bridge networks:
- **`web-tier`**: Contains `nginx` and the backend instances. Allows external traffic to reach the Express API and Socket.io WebSockets.
- **`db-tier`**: Contains the backend instances and `redis`. Keeps Redis completely isolated from Nginx.
- **Port Security**: The `redis` container does *not* expose any ports to the host machine. It can only be reached internally by backend instances through the `db-tier` network bridge and requires authentication.

### 4. Running the Stack in Production
Verify your environment variables are configured and the SSL certificates are in place, then build and launch the containers:
```bash
# Build and run containers in detached mode
sudo docker compose up --build -d
```
