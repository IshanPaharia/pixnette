require('dotenv').config({ path: __dirname + '/.env' })
const { Pool } = require('pg')
const { pubClient } = require('./redis')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function erase() {
  console.log('Connecting to database and Redis...')
  try {
    // 1. Clear Postgres
    await pool.query('TRUNCATE TABLE pixels, pixel_history RESTART IDENTITY')
    console.log('✅ TRUNCATED pixels and pixel_history table')

    // 2. Clear Redis cache (canvas state, write queue, and active cooldowns)
    await pubClient.connect()
    await pubClient.flushDb()
    console.log('✅ FLUSHED Redis cache')
  } catch (err) {
    console.error('❌ Failed to erase data:', err.message)
    throw err
  } finally {
    await pool.end()
    try {
      await pubClient.disconnect()
    } catch (e) {
      // Ignore if already disconnected
    }
  }
}

erase()
