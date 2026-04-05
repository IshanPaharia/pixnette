const express = require('express')
const router = express.Router()
const { getFullCanvas } = require('../canvas')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
const TOTAL = CANVAS_SIZE * CANVAS_SIZE

// GET /api/canvas
// Returns the full 512x512 board as a JSON array
router.get('/canvas', (req, res) => {
  try {
    const canvas = getFullCanvas()
    res.json({ canvas })
  } catch (error) {
    console.error('Error fetching canvas:', error)
    res.status(500).json({ error: 'Internal server error' })
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

module.exports = router
