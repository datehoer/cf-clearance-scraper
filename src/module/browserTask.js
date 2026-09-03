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

        const creationOutcome = asOutcome(() => browser.createBrowserContext({
            proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined,
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

async function withBrowserPage(options, operation) {
    return withBrowserContext(options, async (context, taskSignal) => {
        const page = await context.newPage()
        const listeners = []
        const on = (event, listener) => {
            page.on(event, listener)
            listeners.push([event, listener])
            return listener
        }

        try {
            return await operation(page, { signal: taskSignal, on })
        } finally {
            for (const [event, listener] of listeners) {
                try {
                    page.removeListener(event, listener)
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
