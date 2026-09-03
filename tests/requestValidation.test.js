const validate = require('../src/module/reqValidate')

test('requires a site key for turnstile-min', () => {
    expect(validate({
        mode: 'turnstile-min',
        url: 'https://example.com',
    })).not.toBe(true)
})

test('requires a complete, bounded proxy', () => {
    expect(validate({
        mode: 'source',
        url: 'https://example.com',
        proxy: { host: 'proxy.example' },
    })).not.toBe(true)
})

test('accepts a valid source request', () => {
    expect(validate({
        mode: 'source',
        url: 'https://example.com/path',
    })).toBe(true)
})
