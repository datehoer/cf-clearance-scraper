const { createBrowserManager } = require('../src/module/browserManager')
const { createMetrics } = require('../src/module/metrics')

function browserHandle() {
    return {
        once: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        createBrowserContext: jest.fn(),
    }
}

test('bounds startup retries and rejects invalid browser handles', async () => {
    const connect = jest.fn().mockResolvedValue({ browser: undefined })
    const metrics = createMetrics()
    const manager = createBrowserManager({
        connect,
        launchOptions: {},
        retryDelayMs: 1,
        startTimeoutMs: 100,
        maxStartAttempts: 3,
        logger: { info() {}, warn() {}, error() {} },
        metrics,
        sleep: () => Promise.resolve(),
    })

    await expect(manager.start()).rejects.toMatchObject({
        code: 'INVALID_BROWSER_HANDLE',
    })
    expect(connect).toHaveBeenCalledTimes(3)
    expect(metrics.snapshot().browserLaunchFailures).toBe(3)
})

test('closes a valid handle returned after the startup timeout', async () => {
    jest.useFakeTimers()
    const handle = browserHandle()
    let resolveConnect
    const connect = jest.fn(() => new Promise(resolve => {
        resolveConnect = resolve
    }))
    const manager = createBrowserManager({
        connect,
        launchOptions: {},
        retryDelayMs: 1,
        startTimeoutMs: 10,
        maxStartAttempts: 1,
        logger: { info() {}, warn() {}, error() {} },
        metrics: createMetrics(),
    })

    const startup = manager.start()
    const startupFailure = expect(startup).rejects.toMatchObject({
        code: 'BROWSER_START_TIMEOUT',
    })
    await jest.advanceTimersByTimeAsync(10)
    await startupFailure
    resolveConnect({ browser: handle })
    await jest.advanceTimersByTimeAsync(0)
    expect(handle.close).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
})

test('starts once and closes the managed browser', async () => {
    const handle = browserHandle()
    const manager = createBrowserManager({
        connect: jest.fn().mockResolvedValue({ browser: handle }),
        launchOptions: {},
        retryDelayMs: 1,
        startTimeoutMs: 100,
        maxStartAttempts: 1,
        logger: { info() {}, warn() {}, error() {} },
        metrics: createMetrics(),
    })

    await expect(manager.start()).resolves.toBe(handle)
    expect(manager.isReady()).toBe(true)
    await manager.close()
    expect(handle.close).toHaveBeenCalledTimes(1)
})
