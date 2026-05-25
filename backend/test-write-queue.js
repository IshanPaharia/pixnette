require('dotenv').config()
const { pubClient, connectRedis } = require('./redis')
const { queuePixelWrite, flushQueueToPostgres } = require('./writeQueue')

const EVENTS_KEY = 'pixel:write:events'

// Mock broken pool to simulate a DB connection error
const mockBrokenPool = {
  connect: async () => {
    throw new Error('Simulated Database Connection Failure!')
  }
}

async function runTest() {
  console.log('Connecting to Redis...')
  await connectRedis()

  // Clean keys
  await pubClient.del(EVENTS_KEY)
  
  // Clean any old flush keys
  let keys = await pubClient.keys('pixel:write:flush:*')
  if (keys.length > 0) {
    await pubClient.del(keys)
  }
  keys = await pubClient.keys('pixel:write:retry:*')
  if (keys.length > 0) {
    await pubClient.del(keys)
  }

  console.log('\n--- Test Part 1: Basic Write and Recovery ---')
  // Write (5,5) as RED (color 1)
  await queuePixelWrite(5, 5, 1, 'user_a')
  console.log('1. Queued pixel (5,5) color 1')

  // Run flush with broken pool (this triggers failure and recovery)
  console.log('2. Starting flush with broken database pool...')
  await flushQueueToPostgres(mockBrokenPool)

  // Verify that color 1 was restored to the queue
  let currentQueue = await pubClient.lRange(EVENTS_KEY, 0, -1)
  console.log('3. Queue contents after recovery:', currentQueue)
  const recoveredWrite = currentQueue.map(JSON.parse).find(item => item.x === 5 && item.y === 5)
  if (recoveredWrite && recoveredWrite.color === 1) {
    console.log('✅ PASS: Pixel was successfully recovered back to the queue!')
  } else {
    console.log('❌ FAIL: Pixel was not recovered.')
  }

  console.log('\n--- Test Part 2: Concurrency Overwrite Prevention ---')
  await pubClient.del(EVENTS_KEY)

  // 1. Queue a write at (10,10) as GREEN (color 3)
  await queuePixelWrite(10, 10, 3, 'user_a')
  console.log('1. Queued pixel (10,10) color 3 (User A)')

  // 2. Start flush, but we will hijack the query function to simulate User B placing a pixel DURING the DB write
  const mockHijackedPool = {
    connect: async () => {
      return {
        query: async (queryText) => {
          if (queryText === 'BEGIN') {
            console.log('   [DB Flush running...] User B places color 4 (Blue) at (10,10) now!')
            // Simulate User B writing to active queue while flush is in progress
            await queuePixelWrite(10, 10, 4, 'user_b')
          }
          throw new Error('Simulated Database Query Failure!')
        },
        release: () => {}
      }
    }
  }

  await flushQueueToPostgres(mockHijackedPool)

  // 3. Verify queue state
  currentQueue = await pubClient.lRange(EVENTS_KEY, 0, -1)
  console.log('2. Queue contents after recovery:', currentQueue)
  const orderedWrites = currentQueue.map(JSON.parse).filter(item => item.x === 10 && item.y === 10)
  if (orderedWrites.length === 2 && orderedWrites[0].color === 3 && orderedWrites[1].color === 4) {
    console.log('✅ PASS: Chronological writes were preserved and User B\'s newer color remains last!')
  } else {
    console.log('❌ FAIL: Recovered writes are not in the expected chronological order!')
  }

  process.exit(0)
}

runTest().catch(err => {
  console.error(err)
  process.exit(1)
})
