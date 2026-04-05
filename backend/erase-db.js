require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function erase() {
  console.log('Connecting to database...')
  try {
    await pool.query('TRUNCATE TABLE pixels RESTART IDENTITY')
    console.log('✅ TRUNCATED pixels table')
    await pool.query('TRUNCATE TABLE cooldowns RESTART IDENTITY')
    console.log('✅ TRUNCATED cooldowns table')
  } catch (err) {
    console.error('❌ Failed to erase data:', err.message)
    throw err
  } finally {
    await pool.end()
  }
}

erase()
