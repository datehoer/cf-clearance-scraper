const { loadConfig } = require('../src/config')

test('requires authentication outside development by default', () => {
    expect(() => loadConfig({})).toThrow('Authentication is required')
})

test('accepts legacy names while preferring bounded modern settings', () => {
    const config = loadConfig({
        CLIENT_KEY: 'configured',
        browserLimit: '7',
        timeOut: '1234',
    })
    expect(config.browserLimit).toBe(7)
    expect(config.browserTimeoutMs).toBe(1234)
})

test('allows an explicit unauthenticated development deployment', () => {
    const config = loadConfig({ ALLOW_UNAUTHENTICATED: 'true' })
    expect(config.allowUnauthenticated).toBe(true)
})
