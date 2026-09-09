const dotenv = require('dotenv')
const { connect } = require('./module/connectBrowser')

const { createApp } = require('./app')
const { loadConfig } = require('./config')
const { buildBrowserLaunchOptions } = require('./module/browserLaunchOptions')
const { createBrowserManager } = require('./module/browserManager')
const { createLogger } = require('./module/logger')
const { createMetrics } = require('./module/metrics')

function listen(app, port, host) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host)
        const onError = error => reject(error)
        server.once('error', onError)
        server.once('listening', () => {
            server.removeListener('error', onError)
            resolve(server)
        })
    })
}

function closeServer(server) {
    if (!server) return Promise.resolve()
    return new Promise(resolve => {
        try {
            server.close(() => resolve())
        } catch (_error) {
            resolve()
        }
    })
}

async function main(options = {}) {
    const processObject = options.process || process
    const env = options.env || processObject.env
    if (!options.skipDotenv) dotenv.config()

    const config = options.config || loadConfig(env)
    const logger = options.logger || createLogger({ pod: env.HOSTNAME || 'unknown' })
    const metrics = options.metrics || createMetrics()
    let server = null
    let service = null
    let shutdownPromise = null

    const shutdown = signal => {
        if (shutdownPromise) return shutdownPromise
        shutdownPromise = (async () => {
            logger.info({ event: 'shutdown_started', signal })
            service?.beginDraining()
            service?.abortAll()
            const cleanup = Promise.allSettled([
                closeServer(server),
                browserManager.close(),
            ])
            const timeout = new Promise(resolve => {
                const timer = setTimeout(resolve, config.shutdownGraceMs)
                timer.unref?.()
            })
            await Promise.race([cleanup, timeout])
            server?.closeAllConnections?.()
            logger.info({ event: 'shutdown_completed', signal })
        })()
        return shutdownPromise
    }

    const browserManager = createBrowserManager({
        connect: options.connect || connect,
        launchOptions: options.launchOptions || buildBrowserLaunchOptions(env),
        retryDelayMs: config.browserRetryDelayMs,
        startTimeoutMs: config.browserStartTimeoutMs,
        maxStartAttempts: config.browserMaxStartAttempts,
        logger,
        metrics,
        onFatal(error) {
            logger.error({
                event: 'browser_fatal',
                errorCode: error?.code || 'BROWSER_START_FAILED',
                error,
            })
            void shutdown('browser-fatal').finally(() => {
                if (options.exitOnFatal === false) return
                processObject.exit(1)
            })
        },
    })

    try {
        await browserManager.start()
        service = createApp({ config, browserManager, logger, metrics })
        server = await (options.listen || listen)(service.app, config.port, config.host)
        server.requestTimeout = config.browserTimeoutMs + 5000

        const handleSignal = signal => {
            void shutdown(signal).finally(() => {
                processObject.exitCode = 0
            })
        }
        processObject.once('SIGTERM', handleSignal)
        processObject.once('SIGINT', handleSignal)
        logger.info({ event: 'service_ready', browserReady: true })

        return Object.freeze({
            browserManager,
            config,
            logger,
            metrics,
            server,
            service,
            shutdown,
        })
    } catch (error) {
        await Promise.allSettled([closeServer(server), browserManager.close()])
        throw error
    }
}

if (require.main === module) {
    void main().catch(error => {
        const logger = createLogger()
        logger.error({
            event: 'startup_failed',
            errorCode: error?.code || 'STARTUP_FAILED',
            error,
        })
        // Exiting PID 1 lets Docker kill any Chromium process that a failed
        // third-party launch did not return a handle for.
        process.exit(1)
    })
}

module.exports = {
    closeServer,
    listen,
    main,
}
