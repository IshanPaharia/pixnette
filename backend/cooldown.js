const cooldowns = new Map()  // fingerprint → expiry timestamp (ms)

function isOnCooldown(fingerprint) {
  const expiry = cooldowns.get(fingerprint)
  if (!expiry) return false
  if (Date.now() >= expiry) {
    cooldowns.delete(fingerprint)
    return false
  }
  return true
}

function setCooldown(fingerprint) {
  const secs = parseInt(process.env.COOLDOWN_SECONDS) || 30
  cooldowns.set(fingerprint, Date.now() + secs * 1000)
}

function getCooldownRemaining(fingerprint) {
  const expiry = cooldowns.get(fingerprint)
  if (!expiry) return 0
  return Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
}

setInterval(() => {
  const now = Date.now()
  for (const [fp, expiry] of cooldowns.entries()) {
    if (now >= expiry) cooldowns.delete(fp)
  }
}, 5 * 60 * 1000)

module.exports = { isOnCooldown, setCooldown, getCooldownRemaining }