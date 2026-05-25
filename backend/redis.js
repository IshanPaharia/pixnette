const { createClient, RESP_TYPES } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_CONNECT_TIMEOUT_MS = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || 15000;
const REDIS_RECONNECT_MAX_MS = parseInt(process.env.REDIS_RECONNECT_MAX_MS, 10) || 5000;

// Configure Redis client options, attaching password for authentication if provided
const clientOptions = {
  url: REDIS_URL,
  socket: {
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    reconnectStrategy: (retries) => Math.min(retries * 500, REDIS_RECONNECT_MAX_MS)
  }
};
if (process.env.REDIS_PASSWORD) {
  clientOptions.password = process.env.REDIS_PASSWORD;
}

// 1. Create the main publisher client (also handles standard database queries)
const pubClient = createClient(clientOptions);

// Create a buffer-enabled modifier client that maps RESP3 blob strings to Buffer
const bufferClient = pubClient.withTypeMapping({
  [RESP_TYPES.BLOB_STRING]: Buffer
});

// 2. Duplicate it for the subscriber client
const subClient = pubClient.duplicate();

// Handle unexpected connection errors gracefully to avoid server crashes
pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));

async function connectRedis() {
  console.log(`Connecting to Redis at ${REDIS_URL}`);
  await Promise.all([
    pubClient.connect(),
    subClient.connect()
  ]);
  console.log('✅ Connected to Redis (Pub/Sub & Command clients)');
}

module.exports = {
  pubClient,
  bufferClient,
  subClient,
  connectRedis,
};
