const express = require('express')
const router = express.Router()
const { getFullCanvas } = require('../canvas.js')
const pool = require('../db.js')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE, 10) || 64
const TOTAL = CANVAS_SIZE * CANVAS_SIZE

// GET /api/canvas
// Returns the full board as a raw binary stream
router.get('/canvas', async (req, res) => {
  try {
    const canvas = await getFullCanvas()
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(canvas)
  } catch (error) {
    console.error('Error fetching canvas:', error)
    res.status(500).send('Internal server error')
  }
})

// GET /api/health
// A demo/health check route to see if the server is alive
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    pixels: TOTAL
  })
})

// GET /api/canvas/history
// Returns the chronological stream of all pixel placements
router.get('/canvas/history', async (req, res) => {
  try {
    // Fetch the 50k latest pixel events, but returned in chronological ascending order
    const queryStr = `
      SELECT x, y, color FROM (
        SELECT id, x, y, color, placed_at
        FROM pixel_history 
        ORDER BY placed_at DESC, id DESC
        LIMIT 50000
      ) sub ORDER BY placed_at ASC, id ASC
    `
    const result = await pool.query(queryStr)
    res.json({ history: result.rows })
  } catch (error) {
    console.error('Error fetching canvas history:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})


module.exports = router
