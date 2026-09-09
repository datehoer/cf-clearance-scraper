const fs = require('node:fs')

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

// clark-browser fingerprint switches. These are no-ops on stock Chromium but
// drive the source-level persona patches in the clark-browser binary. Defaults
// mirror the configuration that was verified to pass HCA's managed challenge.
function clarkFingerprintArgs(env) {
    const seed = env.CLARK_FINGERPRINT || String(Math.floor(10000 + Math.random() * 90000))
    const platform = env.CLARK_FINGERPRINT_PLATFORM || 'linux'
    const brand = env.CLARK_FINGERPRINT_BRAND || 'Chrome'
    const brandVersion = env.CLARK_FINGERPRINT_BRAND_VERSION || '148.0.0.0'
    const timezone = env.CLARK_FINGERPRINT_TIMEZONE || 'America/New_York'
    const locale = env.CLARK_FINGERPRINT_LOCALE || 'en-US'
    const networkProfile = env.CLARK_FINGERPRINT_NETWORK_PROFILE || 'residential'

    return [
        `--fingerprint=${seed}`,
        `--fingerprint-platform=${platform}`,
        `--fingerprint-brand=${brand}`,
        `--fingerprint-brand-version=${brandVersion}`,
        `--fingerprint-timezone=${timezone}`,
        `--fingerprint-locale=${locale}`,
        `--fingerprint-network-profile=${networkProfile}`,
        '--disable-features=WebGPU',
        `--lang=${locale}`,
        '--accept-lang=en-US,en',
    ]
}

function buildBrowserLaunchOptions(env = process.env) {
    const extraArgs = String(env.CHROME_LAUNCH_ARGS || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    const args = [...new Set([
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--remote-debugging-address=127.0.0.1',
        ...clarkFingerprintArgs(env),
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
        executablePath: chromePath,
        // Patchright strips --enable-automation and adds
        // --disable-blink-features=AutomationControlled itself; keep the
        // remaining Playwright defaults (viewport, etc.) intact.
        ignoreDefaultArgs: [],
    }
}

module.exports = { buildBrowserLaunchOptions }
