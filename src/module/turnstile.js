// Playwright port of puppeteer-real-browser's Turnstile auto-clicker.
// The original `connect({ turnstile: true })` ran this loop on every page to
// click the Cloudflare Turnstile checkbox inside the challenge iframe, which
// is what resolves interactive challenges. Patchright does not ship this, so
// we reimplement it here with the same detection heuristics.

async function checkTurnstile(page) {
    return new Promise(resolve => {
        const waitInterval = setTimeout(() => {
            clearInterval(waitInterval)
            resolve(false)
        }, 5000)

        void (async () => {
            try {
                const elements = await page.$$('[name="cf-turnstile-response"]')
                if (elements.length <= 0) {
                    // No response field yet: find the Turnstile checkbox by its
                    // characteristic ~300px square and click it.
                    const coordinates = await page.evaluate(() => {
                        const coordinates = []
                        document.querySelectorAll('div').forEach(item => {
                            try {
                                const itemCoordinates = item.getBoundingClientRect()
                                const itemCss = window.getComputedStyle(item)
                                if (itemCss.margin === '0px' && itemCss.padding === '0px' && itemCoordinates.width > 290 && itemCoordinates.width <= 310 && !item.querySelector('*')) {
                                    coordinates.push({ x: itemCoordinates.x, y: itemCoordinates.y, w: itemCoordinates.width, h: itemCoordinates.height })
                                }
                            } catch (_err) {}
                        })
                        if (coordinates.length <= 0) {
                            document.querySelectorAll('div').forEach(item => {
                                try {
                                    const itemCoordinates = item.getBoundingClientRect()
                                    if (itemCoordinates.width > 290 && itemCoordinates.width <= 310 && !item.querySelector('*')) {
                                        coordinates.push({ x: itemCoordinates.x, y: itemCoordinates.y, w: itemCoordinates.width, h: itemCoordinates.height })
                                    }
                                } catch (_err) {}
                            })
                        }
                        return coordinates
                    })

                    for (const item of coordinates) {
                        try {
                            const x = item.x + 30
                            const y = item.y + item.h / 2
                            await page.mouse.click(x, y)
                        } catch (_err) {}
                    }
                    clearInterval(waitInterval)
                    resolve(true)
                    return
                }

                for (const element of elements) {
                    try {
                        const parentElement = await element.evaluateHandle(el => el.parentElement)
                        const box = await parentElement.boundingBox()
                        const x = box.x + 30
                        const y = box.y + box.height / 2
                        await page.mouse.click(x, y)
                    } catch (_err) {}
                }
                clearInterval(waitInterval)
                resolve(true)
            } catch (_err) {
                clearInterval(waitInterval)
                resolve(false)
            }
        })()
    })
}

function startTurnstileSolver(page) {
    let active = true
    let timer = null
    const stop = () => {
        active = false
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }
    page.on('close', stop)

    const loop = async () => {
        while (active) {
            await checkTurnstile(page).catch(() => {})
            if (!active) break
            await new Promise(resolve => {
                timer = setTimeout(() => {
                    timer = null
                    resolve()
                }, 1000)
            })
        }
    }
    void loop()

    return stop
}

module.exports = { checkTurnstile, startTurnstileSolver }
