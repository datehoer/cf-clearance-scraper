function abortReason(signal) {
    return signal?.reason instanceof Error
        ? signal.reason
        : Object.assign(new Error('REQUEST_ABORTED'), {
            code: 'REQUEST_ABORTED',
            statusCode: 499,
            retryable: false,
        })
}

function matchesTarget(candidate, target) {
    try {
        const left = new URL(candidate)
        const right = new URL(target)
        const leftPath = left.pathname.replace(/\/$/, '') || '/'
        const rightPath = right.pathname.replace(/\/$/, '') || '/'
        // Match on origin + path only. Cloudflare's managed challenge
        // redirects the document to the same path with a `?__cf_chl_*`
        // query appended, so an exact search match would never fire.
        return left.origin === right.origin && leftPath === rightPath
    } catch (_error) {
        return false
    }
}

function navigateForTargetResponse({ page, url, signal, on, extract }) {
    return new Promise((resolve, reject) => {
        let settled = false
        let processing = false

        const finish = (operation, value) => {
            if (settled) return
            settled = true
            signal?.removeEventListener('abort', handleAbort)
            operation(value)
        }
        const handleAbort = () => finish(reject, abortReason(signal))
        const handleClose = () => {
            const error = new Error('Browser page closed before completion')
            error.code = 'PAGE_CLOSED'
            finish(reject, error)
        }
        const handleResponse = response => {
            if (settled || processing) return
            if (![200, 302].includes(response.status())) return
            if (!matchesTarget(response.url(), url)) return
            processing = true
            void Promise.resolve()
                .then(() => extract(response))
                .then(value => finish(resolve, value))
                .catch(error => finish(reject, error))
                .finally(() => {
                    processing = false
                })
        }

        on('response', handleResponse)
        on('close', handleClose)
        signal?.addEventListener('abort', handleAbort, { once: true })
        if (signal?.aborted) {
            handleAbort()
            return
        }

        // Playwright fires `response` events natively; no request interception
        // is needed to observe the target document response.
        void page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 })
            .catch(error => finish(reject, error))
    })
}

module.exports = {
    matchesTarget,
    navigateForTargetResponse,
}
