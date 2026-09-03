function parseBoolean(value, fallback) {
    if (value === undefined || value === '') return fallback
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
}

function parseHeadless(value) {
    if (value === undefined || value === '') return false
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    if (['new', 'shell'].includes(normalized)) return normalized
    return false
}

function buildBrowserLaunchOptions(env = process.env) {
    const extraArgs = String(env.CHROME_LAUNCH_ARGS || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    const args = [...new Set([
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--remote-debugging-address=127.0.0.1',
        ...extraArgs,
    ])]

    const chromePath = env.CHROME_PATH || env.CHROME_BIN || undefined
    if (chromePath) {
        try {
            fs.accessSync(chromePath, fs.constants.X_OK)
        } catch (cause) {
            const error = new Error('Configured Chromium executable is not accessible', { cause })
            error.code = 'CHROME_EXECUTABLE_INVALID'
            throw error
        }
    }

    return {
        args,
        headless: parseHeadless(env.BROWSER_HEADLESS),
        turnstile: true,
        connectOption: { defaultViewport: null },
        disableXvfb: parseBoolean(env.BROWSER_DISABLE_XVFB, false),
        // Keeping chrome-launcher's defaults is important. The prior deployed
        // image removed them and sometimes started Chromium without a page.
        ignoreAllFlags: false,
        customConfig: {
            chromePath,
            logLevel: env.CHROME_LAUNCHER_LOG_LEVEL || 'silent',
        },
    }
}

module.exports = { buildBrowserLaunchOptions }
const fs = require('node:fs')
