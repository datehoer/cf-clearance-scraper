function defaultSleep(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs))
}

function createBrowserManager({
    connect,
    launchOptions,
    retryDelayMs,
    startTimeoutMs = 30000,
    maxStartAttempts,
    logger,
    metrics,
    onFatal,
    sleep = defaultSleep,
}) {
    let browser = null
    let starting = null
    let stopping = false
    let closing = null

    function safeObserve(operation) {
        try {
            operation()
        } catch (_error) {}
    }

    function setReady(value) {
        safeObserve(() => metrics?.setBrowserReady(value))
    }

    async function closeHandle(handle) {
        if (typeof handle?.close !== 'function') return
        await handle.close()
    }

    function connectWithTimeout() {
        let timer
        const connection = Promise.resolve()
            .then(() => connect(launchOptions))
            .then(
                value => ({ status: 'fulfilled', value }),
                reason => ({ status: 'rejected', reason }),
            )
        const timeout = new Promise(resolve => {
            timer = setTimeout(() => {
                const error = new Error('Browser start timed out')
                error.code = 'BROWSER_START_TIMEOUT'
                resolve({ status: 'rejected', reason: error, timedOut: true })
            }, startTimeoutMs)
        })

        return Promise.race([connection, timeout]).then(async outcome => {
            clearTimeout(timer)
            if (outcome.timedOut) {
                void connection.then(async lateOutcome => {
                    if (lateOutcome.status !== 'fulfilled') return
                    try {
                        await closeHandle(lateOutcome.value?.browser)
                    } catch (_error) {}
                })
            }
            if (outcome.status === 'rejected') throw outcome.reason
            return outcome.value
        })
    }

    function validateHandle(handle) {
        const required = ['once', 'close', 'newContext']
        const missing = required.filter(name => typeof handle?.[name] !== 'function')
        if (missing.length > 0) {
            const error = new Error(`Invalid browser handle: missing ${missing.join(', ')}`)
            error.code = 'INVALID_BROWSER_HANDLE'
            throw error
        }
    }

    async function launchSequence(delayFirstAttempt = false) {
        if (delayFirstAttempt) await sleep(retryDelayMs)
        let lastError

        for (let attempt = 1; attempt <= maxStartAttempts && !stopping; attempt += 1) {
            safeObserve(() => metrics?.browserLaunchStarted())
            safeObserve(() => logger?.info({ event: 'browser_launch_started', attempt }))
            let result
            try {
                result = await connectWithTimeout()
                const handle = result?.browser
                validateHandle(handle)
                if (stopping) {
                    await closeHandle(handle)
                    return null
                }
                handle.once('disconnected', () => {
                    if (stopping || browser !== handle) return
                    browser = null
                    setReady(false)
                    safeObserve(() => logger?.warn({
                        event: 'browser_disconnected',
                        browserReady: false,
                    }))
                    void beginStart(true).catch(error => {
                        safeObserve(() => logger?.error({
                            event: 'browser_restart_exhausted',
                            errorCode: error?.code || 'BROWSER_START_FAILED',
                            error,
                        }))
                        try {
                            onFatal?.(error)
                        } catch (_error) {}
                    })
                })
                browser = handle
                setReady(true)
                safeObserve(() => logger?.info({
                    event: 'browser_ready',
                    attempt,
                    browserReady: true,
                }))
                return browser
            } catch (error) {
                lastError = error
                safeObserve(() => metrics?.browserLaunchFailed())
                setReady(false)
                if (result?.browser) {
                    try {
                        await closeHandle(result.browser)
                    } catch (_cleanupError) {}
                }
                safeObserve(() => logger?.error({
                    event: 'browser_launch_failed',
                    attempt,
                    browserReady: false,
                    errorCode: error?.code || 'BROWSER_START_FAILED',
                    error,
                }))
                if (attempt < maxStartAttempts && !stopping) await sleep(retryDelayMs)
            }
        }

        if (stopping) return null
        const terminal = lastError || new Error('Browser start attempts exhausted')
        if (!terminal.code) terminal.code = 'BROWSER_START_FAILED'
        throw terminal
    }

    function beginStart(delayFirstAttempt = false) {
        if (stopping) return Promise.resolve(null)
        if (browser) return Promise.resolve(browser)
        if (starting) return starting
        const operation = launchSequence(delayFirstAttempt)
        let current
        current = operation.finally(() => {
            if (starting === current) starting = null
        })
        starting = current
        return current
    }

    function close() {
        if (closing) return closing
        stopping = true
        setReady(false)
        const handle = browser
        browser = null
        closing = Promise.allSettled([
            closeHandle(handle),
            starting || Promise.resolve(),
        ]).then(results => {
            const failure = results.find(result => result.status === 'rejected')
            if (failure) throw failure.reason
        })
        return closing
    }

    return Object.freeze({
        start: () => beginStart(false),
        close,
        isReady: () => !stopping && Boolean(browser),
        getBrowser() {
            if (!browser || stopping) {
                throw Object.assign(new Error('Browser is not ready'), {
                    code: 'BROWSER_NOT_READY',
                    statusCode: 503,
                    retryable: true,
                })
            }
            return browser
        },
    })
}

module.exports = { createBrowserManager }
