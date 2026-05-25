const fs = require('fs')

function readBooleanEnv(name, defaultValue) {
  const value = process.env[name]
  if (value === undefined) return defaultValue
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

function getDatabaseSslConfig() {
  if (!readBooleanEnv('DATABASE_SSL', true)) {
    return false
  }

  const ssl = {
    rejectUnauthorized: readBooleanEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', true)
  }

  if (process.env.DATABASE_SSL_CA) {
    ssl.ca = process.env.DATABASE_SSL_CA
  } else if (process.env.DATABASE_SSL_CA_FILE) {
    ssl.ca = fs.readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8')
  }

  return ssl
}

function createPoolConfig(overrides = {}) {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: getDatabaseSslConfig(),
    enableChannelBinding: readBooleanEnv('DATABASE_ENABLE_CHANNEL_BINDING', true),
    ...overrides
  }
}

module.exports = { createPoolConfig }
