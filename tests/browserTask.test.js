const { withBrowserPage } = require('../src/module/browserTask')

function deferred() {
    let resolve
    const promise = new Promise(next => {
        resolve = next
    })
    return { promise, resolve }
}

test('removes page listeners and closes page and context after success', async () => {
    const page = {
        on: jest.fn(),
        removeListener: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
    }
    const context = {
        newPage: jest.fn().mockResolvedValue(page),
        close: jest.fn().mockResolvedValue(undefined),
    }
    const browser = {
        createBrowserContext: jest.fn().mockResolvedValue(context),
    }

    await expect(withBrowserPage(
        { browser, timeoutMs: 100 },
        async (_page, { on }) => {
            on('response', () => {})
            return 'done'
        },
    )).resolves.toBe('done')
    expect(page.removeListener).toHaveBeenCalledWith('response', expect.any(Function))
    expect(page.close).toHaveBeenCalledTimes(1)
    expect(context.close).toHaveBeenCalledTimes(1)
})

test('closes a context that is acquired after timeout', async () => {
    jest.useFakeTimers()
    const creation = deferred()
    const context = { close: jest.fn().mockResolvedValue(undefined) }
    const browser = { createBrowserContext: jest.fn(() => creation.promise) }

    const task = withBrowserPage(
        { browser, timeoutMs: 10 },
        async () => 'unreachable',
    )
    const taskFailure = expect(task).rejects.toMatchObject({
        code: 'BROWSER_TIMEOUT',
    })
    await jest.advanceTimersByTimeAsync(10)
    await taskFailure
    creation.resolve(context)
    await jest.advanceTimersByTimeAsync(0)
    expect(context.close).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
})
