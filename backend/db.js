const { Pool } = require('pg')
const { createPoolConfig } = require('./pgConfig')

// Single shared Postgres connection pool for the entire app.
// Imported by server.js, canvas.js (via server), and any future route files.
const pool = new Pool(createPoolConfig({
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Max time to wait for a connection
}))

// Prevent idle client errors from throwing uncaught exceptions and crashing the server
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err)
})

module.exports = pool
