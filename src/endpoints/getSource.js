const { withBrowserPage } = require('../module/browserTask')
const { navigateForTargetResponse } = require('../module/pageNavigation')

async function getSource(data, { browser, signal, timeoutMs }) {
  const { url, proxy } = data
  if (!url) throw new Error('Missing url parameter')

  return withBrowserPage(
    { browser, proxy, signal, timeoutMs },
    async (page, lifecycle) => {
      return navigateForTargetResponse({
        page,
        url,
        ...lifecycle,
        extract: async () => {
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
          return page.content()
        },
      })
    },
  )
}

module.exports = getSource
