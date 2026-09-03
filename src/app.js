const crypto = require('node:crypto')

const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')

const getSource = require('./endpoints/getSource')
const solveTurnstileMin = require('./endpoints/solveTurnstile.min')
const solveTurnstileMax = require('./endpoints/solveTurnstile.max')
const wafSession = require('./endpoints/wafSession')
const reqValidate = require('./module/reqValidate')
const { createAuditFingerprinter } = require('./module/logger')

const ENDPOINTS = Object.freeze({
    source: Object.freeze({ run: getSource, field: 'source' }),
    'turnstile-min': Object.freeze({ run: solveTurnstileMin, field: 'token' }),
    'turnstile-max': Object.freeze({ run: solveTurnstileMax, field: 'token' }),
    'waf-session': Object.freeze({ run: wafSession }),
})

function timingSafeEqualString(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) return false
    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function readClientKey(req, data) {
    return req.get('x-client-key')
        || req.get('x-api-key')
        || data?.clientKey
        || req.query?.clientKey
}

function errorStatus(error) {
    if (error?.code === 'REQUEST_ABORTED' || error?.statusCode === 499) return 499
    if (error?.code === 'BROWSER_TIMEOUT' || error?.statusCode === 504) return 504
    if (error?.code === 'BROWSER_NOT_READY' || error?.statusCode === 503) return 503
    return 500
}

function outcomeForStatus(statusCode) {
    if (statusCode >= 200 && statusCode < 400) return 'success'
    if (statusCode === 400) return 'bad_request'
    if (statusCode === 401) return 'unauthorized'
    if (statusCode === 429) return 'rejected'
    if (statusCode === 499) return 'aborted'
    if (statusCode === 503) return 'unavailable'
    if (statusCode === 504) return 'timeout'
    return 'failure'
}

function publicMessage(statusCode) {
    if (statusCode === 429) return 'Too Many Requests'
    if (statusCode === 503) return 'Service Unavailable'
    if (statusCode === 504) return 'Gateway Timeout'
    return 'Internal Server Error'
}

function createApp({ config, browserManager, logger, metrics }) {
    const app = express()
    const fingerprint = createAuditFingerprinter(config.auditHashKey)
    const activeControllers = new Set()
    let activeRequests = 0
    let draining = false

    app.disable('x-powered-by')
    if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops)
    app.use(cors())
    app.use(bodyParser.json({ limit: '1mb' }))
    app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }))

    app.get('/livez', (_req, res) => {
        res.status(200).json({ live: true })
    })
    app.get('/readyz', (_req, res) => {
        const ready = !draining && browserManager.isReady()
        res.status(ready ? 200 : 503).json({ ready })
    })
    app.get('/health', (_req, res) => {
        const snapshot = metrics.snapshot()
        res.status(200).json({
            live: true,
            ready: !draining && browserManager.isReady(),
            draining,
            activeRequests,
            browserReady: snapshot.browserReady,
        })
    })
    app.get('/metrics', (_req, res) => {
        res.status(200).type('text/plain; version=0.0.4').send(metrics.render())
    })

    app.post('/cf-clearance-scraper', async (req, res) => {
        const startedAt = Date.now()
        const requestId = crypto.randomUUID()
        const sourceId = fingerprint(req.ip || req.socket?.remoteAddress)
        const agentId = fingerprint(req.get('user-agent'))
        const data = req.body
        const mode = typeof data?.mode === 'string' ? data.mode : 'unknown'
        let metricFinished = false

        res.set('X-Request-ID', requestId)
        metrics.requestStarted()

        const finish = (statusCode, extra = {}) => {
            const outcome = outcomeForStatus(statusCode)
            if (!metricFinished) {
                metricFinished = true
                metrics.requestFinished(mode, outcome)
            }
            const level = statusCode >= 500 ? 'error' : 'info'
            logger[level]({
                event: extra.event || 'http_request_completed',
                requestId,
                sourceId,
                agentId,
                mode,
                statusCode,
                outcome,
                durationMs: Date.now() - startedAt,
                activeRequests,
                errorCode: extra.errorCode,
                error: extra.error,
            })
        }

        const validation = reqValidate(data)
        if (validation !== true) {
            finish(400, { event: 'http_request_rejected' })
            res.status(400).json({ code: 400, message: 'Bad Request', schema: validation })
            return
        }

        if (config.clientKey && !timingSafeEqualString(
            String(readClientKey(req, data) ?? ''),
            String(config.clientKey),
        )) {
            finish(401, { event: 'http_request_rejected' })
            res.status(401).json({ code: 401, message: 'Unauthorized' })
            return
        }
        if (config.authToken && !timingSafeEqualString(
            String(data.authToken ?? ''),
            String(config.authToken),
        )) {
            finish(401, { event: 'http_request_rejected' })
            res.status(401).json({ code: 401, message: 'Unauthorized' })
            return
        }
        if (draining || !browserManager.isReady()) {
            finish(503, { event: 'http_request_rejected' })
            res.status(503).json({ code: 503, message: 'Service Unavailable' })
            return
        }
        if (activeRequests >= config.browserLimit) {
            finish(429, { event: 'http_request_rejected' })
            res.set('Retry-After', '1')
            res.status(429).json({ code: 429, message: 'Too Many Requests' })
            return
        }

        const controller = new AbortController()
        const abort = () => {
            if (!res.writableEnded) controller.abort()
        }
        req.once('aborted', abort)
        res.once('close', abort)
        activeControllers.add(controller)
        activeRequests += 1

        try {
            const endpoint = ENDPOINTS[data.mode]
            const value = await endpoint.run(data, {
                browser: browserManager.getBrowser(),
                signal: controller.signal,
                timeoutMs: config.browserTimeoutMs,
            })
            if (controller.signal.aborted || res.writableEnded) {
                finish(499, { event: 'http_request_aborted' })
                return
            }
            const result = endpoint.field
                ? { [endpoint.field]: value, code: 200 }
                : { ...value, code: 200 }
            finish(200)
            res.status(200).send(result)
        } catch (error) {
            const statusCode = errorStatus(error)
            finish(statusCode, {
                event: statusCode === 499 ? 'http_request_aborted' : 'http_request_failed',
                errorCode: error?.code || 'INTERNAL_ERROR',
                error,
            })
            if (statusCode !== 499 && !res.headersSent && !res.writableEnded) {
                res.status(statusCode).json({
                    code: statusCode,
                    message: publicMessage(statusCode),
                })
            }
        } finally {
            activeRequests = Math.max(0, activeRequests - 1)
            activeControllers.delete(controller)
            req.removeListener('aborted', abort)
            res.removeListener('close', abort)
            if (!metricFinished) finish(500, { event: 'http_request_failed' })
        }
    })

    app.use((error, _req, res, _next) => {
        if (res.headersSent) return
        if (error instanceof SyntaxError && error.status === 400) {
            res.status(400).json({ code: 400, message: 'Bad Request' })
            return
        }
        res.status(500).json({ code: 500, message: 'Internal Server Error' })
    })

    app.use((_req, res) => {
        res.status(404).json({ code: 404, message: 'Not Found' })
    })

    return Object.freeze({
        app,
        beginDraining() {
            draining = true
        },
        abortAll() {
            draining = true
            for (const controller of activeControllers) controller.abort()
        },
        getActiveRequests: () => activeRequests,
        isDraining: () => draining,
    })
}

module.exports = {
    createApp,
    outcomeForStatus,
    timingSafeEqualString,
}
