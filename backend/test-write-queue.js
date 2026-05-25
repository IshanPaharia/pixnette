require('dotenv').config()
const { pubClient, connectRedis } = require('./redis')
const { queuePixelWrite, flushQueueToPostgres } = require('./writeQueue')

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
  await pubClient.del('pixel:write:queue')
  
  // Clean any old flush keys
  const keys = await pubClient.keys('pixel:write:flush:*')
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
  let currentQueue = await pubClient.hGetAll('pixel:write:queue')
  console.log('3. Queue contents after recovery:', currentQueue)
  if (currentQueue['5,5'] && currentQueue['5,5'].startsWith('1:')) {
    console.log('✅ PASS: Pixel was successfully recovered back to the queue!')
  } else {
    console.log('❌ FAIL: Pixel was not recovered.')
  }

  console.log('\n--- Test Part 2: Concurrency Overwrite Prevention ---')
  await pubClient.del('pixel:write:queue')

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
  currentQueue = await pubClient.hGetAll('pixel:write:queue')
  console.log('2. Queue contents after recovery:', currentQueue)
  if (currentQueue['10,10'] && currentQueue['10,10'].startsWith('4:')) {
    console.log('✅ PASS: User B\'s newer color (4) was preserved and User A\'s failed color (3) was safely discarded!')
  } else {
    console.log('❌ FAIL: User A\'s older color overwrote User B\'s newer color!')
  }

  process.exit(0)
}

runTest().catch(err => {
  console.error(err)
  process.exit(1)
})