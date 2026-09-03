const { withBrowserPage } = require('../module/browserTask')
const { navigateForTargetResponse } = require('../module/pageNavigation')

async function findAcceptLanguage(page) {
  return page.evaluate(async () => {
    const result = await fetch('https://httpbin.org/get')
      .then(res => res.json())
      .then(res => res.headers['Accept-Language'] || res.headers['accept-language'])
      .catch(() => null)
    return result
  })
}

async function wafSession(data, { browser, signal, timeoutMs }) {
  const { url, proxy } = data
  if (!url) throw new Error('Missing url parameter')

  return withBrowserPage(
    { browser, proxy, signal, timeoutMs },
    async (page, lifecycle) => {
      if (proxy?.username && proxy?.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        })
      }

      const acceptLanguage = await findAcceptLanguage(page)
      await page.setRequestInterception(true)
      return navigateForTargetResponse({
        page,
        url,
        ...lifecycle,
        extract: async response => {
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {})
          const cookies = await page.cookies()
          const headers = await response.request().headers()
          delete headers['content-type']
          delete headers['accept-encoding']
          delete headers.accept
          delete headers['content-length']
          headers['accept-language'] = acceptLanguage
          return { cookies, headers }
        },
      })
    },
  )
}

module.exports = wafSession
