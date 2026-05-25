const express = require('express')
const router = express.Router()
const { getFullCanvas } = require('../canvas.js')
const pool = require('../db.js')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
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
    const result = await pool.query('SELECT x, y, color FROM pixel_history ORDER BY id ASC')
    res.json({ history: result.rows })
  } catch (error) {
    console.error('Error fetching canvas history:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})


module.exports = router
