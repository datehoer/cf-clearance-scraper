const { withBrowserPage } = require('../module/browserTask')

async function solveTurnstileMax(data, { browser, signal, timeoutMs }) {
  const { url, proxy } = data
  if (!url) throw new Error('Missing url parameter')

  return withBrowserPage(
    { browser, proxy, signal, timeoutMs },
    async page => {
      if (proxy?.username && proxy?.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        })
      }

      await page.evaluateOnNewDocument(() => {
        let token = null
        async function waitForToken() {
          while (!token) {
            try {
              token = window.turnstile.getResponse()
            } catch (_error) {}
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          const response = document.createElement('input')
          response.type = 'hidden'
          response.name = 'cf-response'
          response.value = token
          document.body.appendChild(response)
        }
        void waitForToken()
      })

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 })
      await page.waitForSelector('[name="cf-response"]', { timeout: 0 })
      const token = await page.evaluate(() => {
        try {
          return document.querySelector('[name="cf-response"]').value
        } catch (_error) {
          return null
        }
      })
      if (!token || token.length < 10) throw new Error('Failed to get token')
      return token
    },
  )
}

module.exports = solveTurnstileMax
