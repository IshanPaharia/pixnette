// One-time script to create the Pixnette DB schema on Neon.
// Run with: node setup-db.js
// Safe to run multiple times (uses IF NOT EXISTS).

require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function setup() {
  console.log('Connecting to Neon Postgres...')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixels (
      x SMALLINT NOT NULL,
      y SMALLINT NOT NULL,
      color SMALLINT NOT NULL DEFAULT 0,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fingerprint TEXT,
      PRIMARY KEY (x, y)
    )
  `)
  console.log('✅ pixels table ready')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cooldowns (
      fingerprint TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  console.log('✅ cooldowns table ready')

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pixels_placed_at ON pixels(placed_at)
  `)
  console.log('✅ index ready')

  console.log('\n✅ Database setup complete! You can now run: npm run dev')
  await pool.end()
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message)
  process.exit(1)
})
