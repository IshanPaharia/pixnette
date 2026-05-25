const { pubClient } = require('./redis.js')

const ACTIVE_EVENTS_KEY = 'pixel:write:events'
const LEGACY_QUEUE_KEY = 'pixel:write:queue'
const FLUSH_PREFIX = 'pixel:write:flush'
const RETRY_PREFIX = 'pixel:write:retry'
const CHUNK_SIZE = 4000
const STALE_FLUSH_MS = Number.parseInt(process.env.WRITE_FLUSH_STALE_MS, 10) || 60 * 1000

function makeTempKey(prefix) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function getKeyTimestamp(key) {
  const timestampPart = key.split(':').find(part => /^\d{10,}$/.test(part))
  return timestampPart ? Number.parseInt(timestampPart, 10) : null
}

function serializeWrite(x, y, color, fingerprint, timestamp = Date.now()) {
  return JSON.stringify({ x, y, color, fingerprint, timestamp })
}

function parseWrite(raw) {
  const parsed = JSON.parse(raw)
  return {
    x: Number.parseInt(parsed.x, 10),
    y: Number.parseInt(parsed.y, 10),
    color: Number.parseInt(parsed.color, 10),
    fingerprint: String(parsed.fingerprint),
    timestamp: Number.parseInt(parsed.timestamp, 10),
    rawValue: raw
  }
}

function parseLegacyWrite(field, value) {
  const [xStr, yStr] = field.split(',')
  const [colorStr, fingerprint, timestampStr] = value.split(':')
  const x = Number.parseInt(xStr, 10)
  const y = Number.parseInt(yStr, 10)
  const color = Number.parseInt(colorStr, 10)
  const timestamp = Number.parseInt(timestampStr, 10)
  return {
    x,
    y,
    color,
    fingerprint,
    timestamp,
    rawValue: serializeWrite(x, y, color, fingerprint, timestamp)
  }
}

function isValidWrite(item) {
  return Number.isInteger(item.x) &&
    Number.isInteger(item.y) &&
    Number.isInteger(item.color) &&
    Number.isInteger(item.timestamp) &&
    typeof item.fingerprint === 'string' &&
    item.fingerprint.length > 0
}

async function pushRawEvents(key, rawEvents) {
  for (let i = 0; i < rawEvents.length; i += 1000) {
    await pubClient.rPush(key, rawEvents.slice(i, i + 1000))
  }
}

async function prependRawEventsToActiveQueue(rawEvents) {
  if (rawEvents.length === 0) return

  const retryKey = makeTempKey(RETRY_PREFIX)
  const backupKey = makeTempKey(`${RETRY_PREFIX}:active`)
  await pushRawEvents(retryKey, rawEvents)

  await pubClient.eval(`
    local retry = KEYS[1]
    local active = KEYS[2]
    local backup = KEYS[3]

    if redis.call('EXISTS', retry) == 0 then
      return 0
    end

    if redis.call('EXISTS', active) == 1 then
      redis.call('RENAME', active, backup)
    end

    redis.call('RENAME', retry, active)

    if redis.call('EXISTS', backup) == 1 then
      while redis.call('LLEN', backup) > 0 do
        redis.call('RPUSH', active, redis.call('LPOP', backup))
      end
      redis.call('DEL', backup)
    end

    return 1
  `, {
    keys: [retryKey, ACTIVE_EVENTS_KEY, backupKey]
  })
}

async function claimListQueue(key) {
  const tempKey = makeTempKey(FLUSH_PREFIX)
  try {
    const exists = await pubClient.exists(key)
    if (!exists) return null
    await pubClient.rename(key, tempKey)
    return tempKey
  } catch {
    return null
  }
}

async function claimLegacyHashQueue() {
  const tempKey = makeTempKey(`${FLUSH_PREFIX}:legacy`)
  try {
    const type = await pubClient.type(LEGACY_QUEUE_KEY)
    if (type !== 'hash') return null
    await pubClient.rename(LEGACY_QUEUE_KEY, tempKey)
    return tempKey
  } catch {
    return null
  }
}

async function readEventsFromTempKey(tempKey) {
  const type = await pubClient.type(tempKey)
  if (type === 'list') {
    const values = await pubClient.lRange(tempKey, 0, -1)
    return values.map(parseWrite).filter(isValidWrite)
  }

  if (type === 'hash') {
    const values = await pubClient.hGetAll(tempKey)
    return Object.entries(values).map(([field, value]) => parseLegacyWrite(field, value)).filter(isValidWrite)
  }

  return []
}

function getLatestStateEvents(events) {
  const latestByCoordinate = new Map()
  for (const event of events) {
    latestByCoordinate.set(`${event.x},${event.y}`, event)
  }
  return Array.from(latestByCoordinate.values())
}

async function upsertPixelState(client, events) {
  for (let i = 0; i < events.length; i += CHUNK_SIZE) {
    const chunk = events.slice(i, i + CHUNK_SIZE)
    const values = chunk.map((_, idx) =>
      `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, to_timestamp($${idx * 5 + 5} / 1000.0))`
    ).join(', ')
    const params = chunk.flatMap(p => [p.x, p.y, p.color, p.fingerprint, p.timestamp])

    await client.query(
      `INSERT INTO pixels (x, y, color, fingerprint, placed_at)
       VALUES ${values}
       ON CONFLICT (x, y) DO UPDATE
       SET color = EXCLUDED.color,
           fingerprint = EXCLUDED.fingerprint,
           placed_at = EXCLUDED.placed_at
       WHERE pixels.placed_at <= EXCLUDED.placed_at`,
      params
    )
  }
}

async function insertPixelHistory(client, events) {
  for (let i = 0; i < events.length; i += CHUNK_SIZE) {
    const chunk = events.slice(i, i + CHUNK_SIZE)
    const values = chunk.map((_, idx) =>
      `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, to_timestamp($${idx * 5 + 5} / 1000.0))`
    ).join(', ')
    const params = chunk.flatMap(p => [p.x, p.y, p.color, p.fingerprint, p.timestamp])

    await client.query(
      `INSERT INTO pixel_history (x, y, color, fingerprint, placed_at)
       VALUES ${values}`,
      params
    )
  }
}

async function queuePixelWrite(x, y, color, fingerprint) {
  await pubClient.rPush(ACTIVE_EVENTS_KEY, serializeWrite(x, y, color, fingerprint))
}

let isFlushing = false

async function flushQueueToPostgres(pool) {
  if (isFlushing) return
  isFlushing = true

  const tempKeys = []

  try {
    const eventsTempKey = await claimListQueue(ACTIVE_EVENTS_KEY)
    if (eventsTempKey) tempKeys.push(eventsTempKey)

    const legacyTempKey = await claimLegacyHashQueue()
    if (legacyTempKey) tempKeys.unshift(legacyTempKey)

    if (tempKeys.length === 0) return

    const batch = []
    for (const tempKey of tempKeys) {
      batch.push(...await readEventsFromTempKey(tempKey))
    }

    if (batch.length === 0) {
      await pubClient.del(tempKeys)
      return
    }

    let client
    try {
      client = await pool.connect()
    } catch (connectErr) {
      console.error('❌ Database connection failed during flush:', connectErr.message)
      await prependRawEventsToActiveQueue(batch.map(item => item.rawValue))
      await pubClient.del(tempKeys)
      console.log('✅ Safely restored writes to Redis queue after database connection failure.')
      return
    }

    try {
      await client.query('BEGIN')
      await upsertPixelState(client, getLatestStateEvents(batch))
      await insertPixelHistory(client, batch)
      await client.query('COMMIT')
      console.log(`✅ Flushed ${batch.length} history writes and ${getLatestStateEvents(batch).length} pixel states to DB`)
      await pubClient.del(tempKeys)
    } catch (dbErr) {
      try {
        await client.query('ROLLBACK')
      } catch (rbErr) {
        console.error('❌ Rollback failed:', rbErr.message)
      }
      console.error('❌ Database bulk-write failed. Restoring Redis queue:', dbErr.message)
      await prependRawEventsToActiveQueue(batch.map(item => item.rawValue))
      await pubClient.del(tempKeys)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('❌ Unexpected write queue flush failure:', err.message)
  } finally {
    isFlushing = false
  }
}

async function recoverInterruptedFlushes() {
  const now = Date.now()
  const keys = (await pubClient.keys(`${FLUSH_PREFIX}:*`))
    .filter((key) => {
      const timestamp = getKeyTimestamp(key)
      return timestamp !== null && now - timestamp >= STALE_FLUSH_MS
    })
    .sort()
  if (keys.length === 0) return

  const recovered = []
  for (const key of keys) {
    try {
      const events = await readEventsFromTempKey(key)
      recovered.push(...events.map(event => event.rawValue))
      await pubClient.del(key)
    } catch (err) {
      console.error(`❌ Failed to recover interrupted flush key ${key}:`, err.message)
    }
  }

  if (recovered.length > 0) {
    await prependRawEventsToActiveQueue(recovered)
    console.log(`✅ Recovered ${recovered.length} pending writes from interrupted flushes`)
  }
}

module.exports = {
  queuePixelWrite,
  flushQueueToPostgres,
  recoverInterruptedFlushes
}
