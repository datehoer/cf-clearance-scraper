const { buildBrowserLaunchOptions } = require('../src/module/browserLaunchOptions')

test('rejects an inaccessible Chromium path before calling the launcher', () => {
    expect(() => buildBrowserLaunchOptions({
        CHROME_PATH: '/definitely-not-a-browser-binary',
    })).toThrow(expect.objectContaining({ code: 'CHROME_EXECUTABLE_INVALID' }))
})

test('preserves safe Chrome defaults and local-only debugging', () => {
    const options = buildBrowserLaunchOptions({ CHROME_PATH: process.execPath })
    expect(options.ignoreAllFlags).toBe(false)
    expect(options.args).toContain('--remote-debugging-address=127.0.0.1')
})
