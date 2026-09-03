const { createAuditFingerprinter, createLogger } = require('../src/module/logger')

test('structured logger keeps only allowlisted and redacted fields', () => {
    const lines = []
    const logger = createLogger({ writer: line => lines.push(line) })
    logger.info({
        event: 'test',
        message: 'token=super-secret https://private.example/path',
        sourceId: 'abc123',
        url: 'https://private.example/path',
        cookie: 'secret',
    })
    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({ event: 'test', sourceId: 'abc123' })
    expect(entry.url).toBeUndefined()
    expect(entry.cookie).toBeUndefined()
    expect(lines[0]).not.toContain('super-secret')
    expect(lines[0]).not.toContain('private.example')
})

test('audit fingerprints are stable and do not contain the source value', () => {
    const fingerprint = createAuditFingerprinter('stable-test-key')
    expect(fingerprint('192.0.2.10')).toBe(fingerprint('192.0.2.10'))
    expect(fingerprint('192.0.2.10')).not.toContain('192.0.2.10')
    expect(fingerprint('192.0.2.10')).not.toBe(fingerprint('192.0.2.11'))
})
