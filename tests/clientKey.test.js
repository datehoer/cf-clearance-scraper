process.env.NODE_ENV = 'development'
process.env.SKIP_LAUNCH = "true"
process.env.clientKey = "client-key-123"
process.env.browserLimit = -1

const server = require('../src/index')
const request = require("supertest")

test('Client Key Control Test - missing key', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "source"
        })
        .expect(401)
}, 10000)

test('Client Key Control Test - valid key', async () => {
    return request(server)
        .post("/cf-clearance-scraper")
        .set("x-client-key", "client-key-123")
        .send({
            url: 'https://nopecha.com/demo/cloudflare',
            mode: "source"
        })
        .expect(429)
}, 10000)

