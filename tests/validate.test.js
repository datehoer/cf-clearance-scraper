const request = require('supertest')

const { createApp } = require('../src/app')
const { createLogger } = require('../src/module/logger')
const { createMetrics } = require('../src/module/metrics')

function testApp() {
    const config = {
        clientKey: null,
        authToken: 'auth-token-123',
        browserLimit: 20,
        browserTimeoutMs: 100,
        auditHashKey: 'test-audit-key',
    }
    return createApp({
        config,
        browserManager: {
            isReady: () => false,
            getBrowser: jest.fn(),
        },
        logger: createLogger({ writer: () => {} }),
        metrics: createMetrics(),
    }).app
}

test('rejects a request without the configured auth token', async () => {
    await request(testApp())
        .post('/cf-clearance-scraper')
        .send({ url: 'https://example.com', mode: 'source' })
        .expect(401)
})

test('checks readiness after a valid auth token', async () => {
    await request(testApp())
        .post('/cf-clearance-scraper')
        .send({
            url: 'https://example.com',
            mode: 'source',
            authToken: 'auth-token-123',
        })
        .expect(503)
})
