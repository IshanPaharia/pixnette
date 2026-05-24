const { Pool } = require('pg')

// Single shared Postgres connection pool for the entire app.
// Imported by server.js, canvas.js (via server), and any future route files.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Neon's cloud SSL
})

// Prevent idle client errors from throwing uncaught exceptions and crashing the server
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err)
})

module.exports = pool
