const request = require('supertest')

const { createApp } = require('../src/app')
const { createLogger } = require('../src/module/logger')
const { createMetrics } = require('../src/module/metrics')

function testApp() {
    const browserManager = {
        isReady: () => false,
        getBrowser: jest.fn(),
    }
    const config = {
        clientKey: 'client-key-123',
        authToken: null,
        browserLimit: 20,
        browserTimeoutMs: 100,
        auditHashKey: 'test-audit-key',
    }
    const logger = createLogger({ writer: () => {} })
    return createApp({
        config,
        browserManager,
        logger,
        metrics: createMetrics(),
    }).app
}

test('rejects a request without the configured client key', async () => {
    await request(testApp())
        .post('/cf-clearance-scraper')
        .send({ url: 'https://example.com', mode: 'source' })
        .expect(401)
})

test('accepts the configured client key before checking browser readiness', async () => {
    await request(testApp())
        .post('/cf-clearance-scraper')
        .set('x-client-key', 'client-key-123')
        .send({ url: 'https://example.com', mode: 'source' })
        .expect(503)
})
