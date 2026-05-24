const { pubClient } = require('./redis.js')

async function isOnCooldown(fingerprint) {
  // EXISTS returns 1 if the key exists (active cooldown), 0 otherwise
  const exists = await pubClient.exists(`cooldown:${fingerprint}`)
  return exists === 1
}

async function setCooldown(fingerprint) {
  const secs = parseInt(process.env.COOLDOWN_SECONDS) || 30
  // Set the key to '1' with an EXpiration of `secs` seconds
  await pubClient.set(`cooldown:${fingerprint}`, '1', { EX: secs })
}

async function getCooldownRemaining(fingerprint) {
  // TTL returns the remaining time to live in seconds
  const ttl = await pubClient.ttl(`cooldown:${fingerprint}`)
  // If the key exists and has a TTL, return it. Otherwise return 0.
  // (Redis returns -2 if the key doesn't exist, and -1 if it has no expiry)
  return ttl > 0 ? ttl : 0
}

module.exports = { 
  isOnCooldown, 
  setCooldown, 
  getCooldownRemaining 
}