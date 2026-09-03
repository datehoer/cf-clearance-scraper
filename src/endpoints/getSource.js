const { withBrowserPage } = require('../module/browserTask')
const { navigateForTargetResponse } = require('../module/pageNavigation')

async function getSource(data, { browser, signal, timeoutMs }) {
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

      await page.setRequestInterception(true)
      return navigateForTargetResponse({
        page,
        url,
        ...lifecycle,
        extract: async () => {
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {})
          return page.content()
        },
      })
    },
  )
}

module.exports = getSource
