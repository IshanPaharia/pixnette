// One-time script to create the Pixnette DB schema on Neon.
// Run with: node setup-db.js
// Safe to run multiple times (uses IF NOT EXISTS).

require('dotenv').config()
const { Pool } = require('pg')
const { createPoolConfig } = require('./pgConfig')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE, 10) || 64

const pool = new Pool(createPoolConfig())

async function addConstraintIfMissing(name, table, expression) {
  const result = await pool.query(
    'SELECT 1 FROM pg_constraint WHERE conname = $1',
    [name]
  )
  if (result.rowCount === 0) {
    await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expression})`)
    console.log(`✅ ${name} constraint ready`)
  }
}

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

  await addConstraintIfMissing('pixels_x_bounds', 'pixels', `x >= 0 AND x < ${CANVAS_SIZE}`)
  await addConstraintIfMissing('pixels_y_bounds', 'pixels', `y >= 0 AND y < ${CANVAS_SIZE}`)
  await addConstraintIfMissing('pixels_color_bounds', 'pixels', 'color >= 0 AND color <= 15')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixel_history (
      id SERIAL PRIMARY KEY,
      x SMALLINT NOT NULL,
      y SMALLINT NOT NULL,
      color SMALLINT NOT NULL,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fingerprint TEXT
    )
  `)
  console.log('✅ pixel_history table ready')

  await addConstraintIfMissing('pixel_history_x_bounds', 'pixel_history', `x >= 0 AND x < ${CANVAS_SIZE}`)
  await addConstraintIfMissing('pixel_history_y_bounds', 'pixel_history', `y >= 0 AND y < ${CANVAS_SIZE}`)
  await addConstraintIfMissing('pixel_history_color_bounds', 'pixel_history', 'color >= 0 AND color <= 15')
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pixel_history_placed_at ON pixel_history(placed_at)
  `)
  console.log('✅ pixel_history index ready')

  /*
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cooldowns (
      fingerprint TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  console.log('✅ cooldowns table ready')
  */

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
