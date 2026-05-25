const { createClient, RESP_TYPES } = require('redis');

// 1. Create the main publisher client (also handles standard database queries)
const pubClient = createClient({
  url: process.env.REDIS_URL
});

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