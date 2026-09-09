const closedContexts = new WeakSet()
const closedPages = new WeakSet()

function serviceError(code, statusCode, retryable) {
    return Object.assign(new Error(code), { code, statusCode, retryable })
}

async function safeCloseContext(context) {
    if (!context || closedContexts.has(context)) return
    closedContexts.add(context)
    try {
        await context.close()
    } catch (error) {
        const message = String(error?.message || '')
        if (!message.includes('Target.disposeBrowserContext') && !message.includes('Target closed')) {
            throw error
        }
    }
}

async function safeClosePage(page) {
    if (!page || closedPages.has(page)) return
    closedPages.add(page)
    try {
        await page.close()
    } catch (error) {
        const message = String(error?.message || '')
        if (!message.includes('Target closed') && !message.includes('Session closed')) throw error
    }
}

function asOutcome(operation) {
    try {
        return Promise.resolve(operation()).then(
            value => ({ status: 'fulfilled', value }),
            reason => ({ status: 'rejected', reason }),
        )
    } catch (error) {
        return Promise.resolve({ status: 'rejected', reason: error })
    }
}

function attachCleanupError(primaryError, cleanupError) {
    if (!primaryError || primaryError === cleanupError || typeof primaryError !== 'object') return
    try {
        if (primaryError.cleanupError === undefined) primaryError.cleanupError = cleanupError
    } catch (_error) {}
}

function createLifecycleControl(parentSignal, timeoutMs) {
    const controller = new AbortController()
    let error
    let released = false
    let resolveOutcome
    const outcome = new Promise(resolve => {
        resolveOutcome = resolve
    })

    const stop = nextError => {
        if (error) return
        error = nextError
        try {
            controller.abort(error)
        } catch (_error) {
            controller.abort()
        }
        resolveOutcome({ status: 'rejected', reason: error })
    }
    const onAbort = () => stop(serviceError('REQUEST_ABORTED', 499, false))
    const timer = setTimeout(
        () => stop(serviceError('BROWSER_TIMEOUT', 504, true)),
        timeoutMs,
    )

    if (parentSignal) parentSignal.addEventListener('abort', onAbort, { once: true })
    if (parentSignal?.aborted) onAbort()

    return {
        outcome,
        signal: controller.signal,
        get error() {
            return error
        },
        release() {
            if (released) return
            released = true
            clearTimeout(timer)
            parentSignal?.removeEventListener('abort', onAbort)
        },
    }
}

function observeLateContext(creationOutcome, primaryError) {
    void creationOutcome.then(async outcome => {
        if (outcome.status !== 'fulfilled') return
        const cleanup = await asOutcome(() => safeCloseContext(outcome.value))
        if (cleanup.status === 'rejected') attachCleanupError(primaryError, cleanup.reason)
    })
}

async function withBrowserContext({ browser, proxy, signal, timeoutMs }, operation) {
    const control = createLifecycleControl(signal, timeoutMs)
    try {
        if (control.error) throw control.error

        const creationOutcome = asOutcome(() => browser.newContext({
            proxy: proxy ? {
                server: `http://${proxy.host}:${proxy.port}`,
                username: proxy.username,
                password: proxy.password,
            } : undefined,
        }))
        const acquisition = await Promise.race([creationOutcome, control.outcome])
        if (acquisition.status === 'rejected') {
            if (acquisition.reason === control.error) {
                observeLateContext(creationOutcome, acquisition.reason)
            }
            throw acquisition.reason
        }

        const context = acquisition.value
        const operationOutcome = control.error
            ? { status: 'rejected', reason: control.error }
            : await Promise.race([
                asOutcome(() => operation(context, control.signal)),
                control.outcome,
            ])

        const primaryError = operationOutcome.status === 'rejected'
            ? operationOutcome.reason
            : null
        const cleanupOutcome = asOutcome(() => safeCloseContext(context))
        const cleanup = await Promise.race([cleanupOutcome, control.outcome])

        if (primaryError) {
            if (cleanup.status === 'rejected') attachCleanupError(primaryError, cleanup.reason)
            throw primaryError
        }
        if (cleanup.status === 'rejected') throw cleanup.reason
        return operationOutcome.value
    } finally {
        control.release()
    }
}

const { startTurnstileSolver } = require('./turnstile')

async function withBrowserPage(options, operation) {
    return withBrowserContext(options, async (context, taskSignal) => {
        const page = await context.newPage()
        const listeners = []
        const on = (event, listener) => {
            page.on(event, listener)
            listeners.push([event, listener])
            return listener
        }

        // Replicate puppeteer-real-browser's `turnstile: true` behavior: keep
        // clicking the Turnstile checkbox until the challenge resolves.
        const stopTurnstile = startTurnstileSolver(page)

        // Replicate puppeteer-real-browser's screenX/screenY stealth patch.
        await page.addInitScript(() => {
            Object.defineProperty(MouseEvent.prototype, 'screenX', {
                get: function () {
                    return this.clientX + window.screenX
                },
            })
            Object.defineProperty(MouseEvent.prototype, 'screenY', {
                get: function () {
                    return this.clientY + window.screenY
                },
            })
        })

        try {
            return await operation(page, { signal: taskSignal, on })
        } finally {
            stopTurnstile()
            for (const [event, listener] of listeners) {
                try {
                    page.off(event, listener)
                } catch (_error) {}
            }
            await safeClosePage(page)
        }
    })
}

module.exports = {
    safeCloseContext,
    safeClosePage,
    serviceError,
    withBrowserContext,
    withBrowserPage,
}
