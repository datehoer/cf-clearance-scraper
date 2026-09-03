const crypto = require('node:crypto')

const SAFE_FIELDS = Object.freeze([
    'event',
    'requestId',
    'sourceId',
    'agentId',
    'mode',
    'outcome',
    'statusCode',
    'durationMs',
    'activeRequests',
    'browserReady',
    'attempt',
    'errorCode',
    'signal',
])

const NUMBER_FIELDS = new Set([
    'statusCode',
    'durationMs',
    'activeRequests',
    'attempt',
])

function sanitizeString(value) {
    if (typeof value !== 'string') return undefined
    return value
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/giu, '[redacted-url]')
        .replace(/\b(?:Bearer|Basic)\s+\S+/giu, '[redacted-authorization]')
        .replace(/\b(password|authorization|cookie|token|client[_-]?key|auth[_-]?token|proxy)\s*[=:]\s*\S+/giu, '$1=[redacted]')
        .replace(/[\u0000-\u001f\u007f]/gu, ' ')
        .slice(0, 256)
}

function safeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function createLogger({ writer = process.stdout, pod = process.env.HOSTNAME || 'unknown' } = {}) {
    function write(level, input = {}) {
        try {
            const entry = {
                timestamp: Date.now(),
                level,
                pod: sanitizeString(String(pod)) || 'unknown',
            }
            for (const field of SAFE_FIELDS) {
                const value = input?.[field]
                if (value === undefined) continue
                const sanitized = NUMBER_FIELDS.has(field)
                    ? safeNumber(value)
                    : sanitizeString(String(value))
                if (sanitized !== undefined) entry[field] = sanitized
            }
            if (input?.error instanceof Error) {
                entry.errorName = sanitizeString(input.error.name)
                if (typeof input.error.code === 'string') {
                    entry.errorCode = sanitizeString(input.error.code)
                }
            }
            const line = `${JSON.stringify(entry)}\n`
            if (typeof writer === 'function') writer(line)
            else writer.write(line)
        } catch (_error) {
            // Observability must never alter service behavior.
        }
    }

    return Object.freeze({
        debug: input => write('debug', input),
        info: input => write('info', input),
        warn: input => write('warn', input),
        error: input => write('error', input),
    })
}

function createAuditFingerprinter(key) {
    const secret = key ? Buffer.from(key) : crypto.randomBytes(32)
    return value => {
        if (!value) return undefined
        return crypto
            .createHmac('sha256', secret)
            .update(String(value))
            .digest('hex')
            .slice(0, 16)
    }
}

module.exports = {
    createAuditFingerprinter,
    createLogger,
    sanitizeString,
}
