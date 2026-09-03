const LEGACY_ENV = Object.freeze({
    browserLimit: 'BROWSER_LIMIT',
    timeOut: 'BROWSER_TIMEOUT_MS',
    authToken: 'AUTH_TOKEN',
    clientKey: 'CLIENT_KEY',
})

function read(env, name, legacyName) {
    if (env[name] !== undefined && env[name] !== '') return env[name]
    if (legacyName && env[legacyName] !== undefined && env[legacyName] !== '') {
        return env[legacyName]
    }
    return undefined
}

function integer(env, name, fallback, options = {}) {
    const { legacyName, min = 1, max = Number.MAX_SAFE_INTEGER } = options
    const raw = read(env, name, legacyName)
    const value = raw === undefined ? fallback : Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`)
    }
    return value
}

function boolean(env, name, fallback = false) {
    const raw = read(env, name)
    if (raw === undefined) return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    throw new Error(`${name} must be a boolean`)
}

function loadConfig(env = process.env) {
    const development = env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
    const clientKey = read(env, 'CLIENT_KEY', 'clientKey') || null
    const authToken = read(env, 'AUTH_TOKEN', 'authToken') || null
    const allowUnauthenticated = boolean(env, 'ALLOW_UNAUTHENTICATED', development)

    if (!allowUnauthenticated && !clientKey && !authToken) {
        throw new Error(
            'Authentication is required; set CLIENT_KEY or AUTH_TOKEN, or explicitly set ALLOW_UNAUTHENTICATED=true',
        )
    }

    return Object.freeze({
        port: integer(env, 'PORT', 3000, { max: 65535 }),
        host: read(env, 'HOST') || '0.0.0.0',
        browserLimit: integer(env, 'BROWSER_LIMIT', 20, {
            legacyName: 'browserLimit',
            max: 100,
        }),
        browserTimeoutMs: integer(env, 'BROWSER_TIMEOUT_MS', 60000, {
            legacyName: 'timeOut',
            max: 600000,
        }),
        browserRetryDelayMs: integer(env, 'BROWSER_RETRY_DELAY_MS', 3000, {
            max: 60000,
        }),
        browserStartTimeoutMs: integer(env, 'BROWSER_START_TIMEOUT_MS', 30000, {
            max: 180000,
        }),
        browserMaxStartAttempts: integer(env, 'BROWSER_MAX_START_ATTEMPTS', 3, {
            max: 20,
        }),
        shutdownGraceMs: integer(env, 'SHUTDOWN_GRACE_MS', 15000, {
            max: 120000,
        }),
        trustProxyHops: integer(env, 'TRUST_PROXY_HOPS', 0, {
            min: 0,
            max: 10,
        }),
        clientKey,
        authToken,
        auditHashKey: read(env, 'AUDIT_HASH_KEY') || null,
        allowUnauthenticated,
    })
}

module.exports = {
    LEGACY_ENV,
    boolean,
    integer,
    loadConfig,
}
