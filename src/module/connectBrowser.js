const { chromium } = require('patchright')

// Adapter for createBrowserManager: it expects `connect(launchOptions)` to
// resolve to `{ browser }`. Patchright's `chromium.launch()` returns the
// Browser directly, so wrap it to keep the manager engine-agnostic.
async function connect(launchOptions) {
    const browser = await chromium.launch(launchOptions)
    return { browser }
}

module.exports = { connect }
