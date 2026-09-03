const MODES = Object.freeze(['source', 'turnstile-min', 'turnstile-max', 'waf-session', 'unknown'])
const OUTCOMES = Object.freeze([
    'success',
    'bad_request',
    'unauthorized',
    'rejected',
    'timeout',
    'aborted',
    'unavailable',
    'failure',
])

function createMetrics() {
    const totals = new Map()
    let activeRequests = 0
    let browserReady = false
    let browserLaunchAttempts = 0
    let browserLaunchFailures = 0

    function key(mode, outcome) {
        return `${MODES.includes(mode) ? mode : 'unknown'}\0${OUTCOMES.includes(outcome) ? outcome : 'failure'}`
    }

    return Object.freeze({
        requestStarted() {
            activeRequests += 1
        },
        requestFinished(mode, outcome) {
            activeRequests = Math.max(0, activeRequests - 1)
            const metricKey = key(mode, outcome)
            totals.set(metricKey, (totals.get(metricKey) || 0) + 1)
        },
        setBrowserReady(value) {
            browserReady = value === true
        },
        browserLaunchStarted() {
            browserLaunchAttempts += 1
        },
        browserLaunchFailed() {
            browserLaunchFailures += 1
        },
        snapshot() {
            return {
                activeRequests,
                browserReady,
                browserLaunchAttempts,
                browserLaunchFailures,
            }
        },
        render() {
            const lines = [
                '# HELP cfcs_active_requests In-flight scraper requests.',
                '# TYPE cfcs_active_requests gauge',
                `cfcs_active_requests ${activeRequests}`,
                '# HELP cfcs_browser_ready Whether the browser is ready.',
                '# TYPE cfcs_browser_ready gauge',
                `cfcs_browser_ready ${browserReady ? 1 : 0}`,
                '# HELP cfcs_browser_launch_attempts_total Browser launch attempts.',
                '# TYPE cfcs_browser_launch_attempts_total counter',
                `cfcs_browser_launch_attempts_total ${browserLaunchAttempts}`,
                '# HELP cfcs_browser_launch_failures_total Browser launch failures.',
                '# TYPE cfcs_browser_launch_failures_total counter',
                `cfcs_browser_launch_failures_total ${browserLaunchFailures}`,
                '# HELP cfcs_requests_total Scraper requests by mode and outcome.',
                '# TYPE cfcs_requests_total counter',
            ]
            for (const [metricKey, value] of [...totals.entries()].sort()) {
                const [mode, outcome] = metricKey.split('\0')
                lines.push(`cfcs_requests_total{mode="${mode}",outcome="${outcome}"} ${value}`)
            }
            return `${lines.join('\n')}\n`
        },
    })
}

module.exports = { createMetrics }
