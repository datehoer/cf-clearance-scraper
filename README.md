# CF Clearance Scraper

This library retrieves the page source of Cloudflare-protected websites, creates Cloudflare Turnstile tokens, and creates Cloudflare WAF sessions.

It is powered by a fully open-source stealth stack:

- **[Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)** (Apache-2.0) — a patched, undetected Playwright driver.
- **[clark-browser](https://github.com/clark-labs-inc/clark-browser)** (MIT) — a stealth Chromium fork with source-level fingerprint patches (the open-source alternative to CloakBrowser).

Cloudflare protection not only checks cookies in the request. It also checks variables in the headers. For this reason, it is recommended to use the returned cookies and headers together when replaying requests.

Cookies with `cf` in the name belong to Cloudflare. You can find out what these cookies do and how long they are valid by **[clicking here](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)**.

## Installation

Installation with Docker is recommended.

**Docker**

Build the local image (the Dockerfile downloads and SHA256-verifies the clark-browser stealth Chromium binary):

```bash
docker build -t cf-clearance-scraper:local .
```

```bash
docker run -d --name cf-clearance-scraper \
  --restart unless-stopped \
  --shm-size=1g \
  -p 127.0.0.1:3000:3000 \
  -e CLIENT_KEY=replace_with_a_strong_random_value \
  cf-clearance-scraper:local
```

Production startup requires `CLIENT_KEY` or `AUTH_TOKEN` unless
`ALLOW_UNAUTHENTICATED=true` is explicitly set. Binding to loopback is recommended
unless a protected reverse proxy is in front of the service.

**Docker Compose**

`docker-compose.yml` is included in this repo.

```bash
CLIENT_KEY=replace_with_a_strong_random_value docker compose up -d --build
```

**GitHub**

```bash
git clone https://github.com/datehoer/cf-clearance-scraper
cd cf-clearance-scraper
npm install
npm run start
```

## Configuration

Environment variables used by the current implementation:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP port for the Express server. |
| `BROWSER_LIMIT` | No | `20` | Maximum concurrent browser contexts. Legacy `browserLimit` remains supported. |
| `BROWSER_TIMEOUT_MS` | No | `60000` | Hard deadline for context creation and browser work. Legacy `timeOut` remains supported. |
| `BROWSER_START_TIMEOUT_MS` | No | `30000` | Deadline for one Chromium launch attempt. |
| `BROWSER_MAX_START_ATTEMPTS` | No | `3` | Bounded launch attempts before exit so Docker can clean the process namespace. |
| `BROWSER_RETRY_DELAY_MS` | No | `3000` | Delay between launch attempts. |
| `SHUTDOWN_GRACE_MS` | No | `15000` | Grace period for HTTP and browser shutdown. |
| `TRUST_PROXY_HOPS` | No | `0` | Number of explicitly trusted reverse-proxy hops used to derive the pseudonymous caller ID. |
| `CLIENT_KEY` or `clientKey` | Production: one auth method | unset | Shared secret for client-key validation. |
| `AUTH_TOKEN` or `authToken` | Production: one auth method | unset | Shared secret for request-body auth-token validation. |
| `AUDIT_HASH_KEY` | No | random per process | Makes pseudonymous source IDs stable across restarts. Never logged. |
| `ALLOW_UNAUTHENTICATED` | No | `false` outside development | Explicitly permits startup without either auth method. |
| `BROWSER_HEADLESS` | No | `false` | Run the browser headless. Headed mode (with Xvfb) is required for Cloudflare managed challenges. |
| `CLARK_FINGERPRINT` | No | random | clark-browser master fingerprint seed. Omit for a fresh identity per launch. |
| `CLARK_FINGERPRINT_PLATFORM` | No | `linux` | Spoofed OS platform (`windows`/`macos`/`linux`). |
| `CLARK_FINGERPRINT_BRAND` | No | `Chrome` | UA Client Hints browser brand. |
| `CLARK_FINGERPRINT_BRAND_VERSION` | No | `148.0.0.0` | UA Client Hints brand version. |
| `CLARK_FINGERPRINT_TIMEZONE` | No | `America/New_York` | Spoofed timezone. Align with your proxy's geography. |
| `CLARK_FINGERPRINT_LOCALE` | No | `en-US` | Spoofed locale. |
| `CLARK_FINGERPRINT_NETWORK_PROFILE` | No | `residential` | Network quality profile (`desktop`/`datacenter`/`residential`/`mobile`/`slow`). |

## API Overview

- Base URL: `http://localhost:3000`
- Route: `POST /cf-clearance-scraper`
- Content type: `application/json`

### Request Body

All requests use the same JSON envelope:

```json
{
  "url": "https://example.com",
  "mode": "source",
  "proxy": {
    "host": "127.0.0.1",
    "port": 3000,
    "username": "username",
    "password": "password"
  },
  "authToken": "your_auth_token",
  "clientKey": "your_client_key",
  "siteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
}
```

Field behavior:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | `string` | Yes | Must be a valid absolute URI. |
| `mode` | `string` | Yes | One of `source`, `turnstile-min`, `turnstile-max`, `waf-session`. |
| `proxy.host` | `string` | No | Proxy host. |
| `proxy.port` | `integer` | No | Proxy port. |
| `proxy.username` | `string` | No | Proxy username. |
| `proxy.password` | `string` | No | Proxy password. |
| `authToken` | `string` | Only if `AUTH_TOKEN` or legacy `authToken` is set | Read from the JSON body only. |
| `clientKey` | `string` | Optional fallback | Only used if you choose to send the client key in the body instead of headers or query string. |
| `siteKey` | `string` | Required for `turnstile-min` | Needed to render the lightweight Turnstile page. |

Additional request fields are rejected with `400 Bad Request`.

## Authentication

The current implementation supports two optional shared-secret checks. They are independent and can be enabled together.

### Client Key Validation

Set `CLIENT_KEY` or `clientKey` in the server environment to require a client key on every request.

The server accepts the client key in this order:

1. `x-client-key` header
2. `x-api-key` header
3. `clientKey` in the JSON body
4. `clientKey` in the query string

If the provided value does not exactly match the configured key, the API returns `401 Unauthorized`.

Recommended request style:

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://example.com","mode":"source"}'
```

### Auth Token Validation

Set `AUTH_TOKEN` (or legacy `authToken`) in the server environment to require a matching token in the JSON body of every request.

Important:

- This value is not read from headers.
- This value is not read from query parameters.
- The field name in the request body must be `authToken`.

Example:

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  --data-raw '{"url":"https://example.com","mode":"source","authToken":"your_auth_token"}'
```

### When Both Are Enabled

If both `CLIENT_KEY` and `authToken` are configured, both checks must pass for the request to continue.

## Endpoint Reference

### 1. Get Page Source

Use `mode: "source"` to load the page in a real browser and return the final HTML source.

If you want to use a proxy, add a `proxy` object to the JSON body:

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://example.com","mode":"source","proxy":{"host":"127.0.0.1","port":3000,"username":"username","password":"password"}}'
```

Successful response shape:

```json
{
  "source": "<html>...</html>",
  "code": 200
}
```

### 2. Create Cloudflare WAF Session

Use `mode: "waf-session"` to retrieve cookies and request headers from a real browser session. This is useful when you want to replay requests against the same site with the harvested session data.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://nopecha.com/demo/cloudflare","mode":"waf-session"}'
```

Successful response shape:

```json
{
  "cookies": [],
  "headers": {},
  "code": 200
}
```

### 3. Create Turnstile Token with Little Resource Consumption

This endpoint generates a Cloudflare Turnstile token while loading as little page content as possible. It intercepts the target document request and replaces it with a minimal page that renders Turnstile only.

In this mode, `siteKey` must be provided in the JSON body. If this does not work for your target, use the full-page mode described below.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://turnstile.zeroclover.io/","siteKey":"0x4AAAAAAAEwzhD6pyKkgXC0","mode":"turnstile-min"}'
```

Successful response shape:

```json
{
  "token": "0.xxxxx",
  "code": 200
}
```

### 4. Create Turnstile Token with Full Page Load

This mode loads the real target page in a browser, waits for Turnstile to resolve, and returns the token.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://turnstile.zeroclover.io/","mode":"turnstile-max"}'
```

Successful response shape:

```json
{
  "token": "0.xxxxx",
  "code": 200
}
```

## Response Codes

Common responses from the current implementation:

| HTTP status | Response body | Meaning |
| --- | --- | --- |
| `200` | `{ "code": 200, ... }` | Request succeeded. The payload field depends on `mode`. |
| `400` | `{ "code": 400, "message": "Bad Request", "schema": [...] }` | Request body failed schema validation. |
| `401` | `{ "code": 401, "message": "Unauthorized" }` | `CLIENT_KEY` or `authToken` validation failed. |
| `404` | `{ "code": 404, "message": "Not Found" }` | Route not found. |
| `429` | `{ "code": 429, "message": "Too Many Requests" }` | `browserLimit` was reached. |
| `503` | `{ "code": 503, "message": "Service Unavailable" }` | Browser is starting, restarting, or draining. |
| `504` | `{ "code": 504, "message": "Gateway Timeout" }` | The bounded browser task timed out. |
| `500` | `{ "code": 500, "message": "Internal Server Error" }` | An unclassified endpoint failure occurred. |

## Operations

- `GET /livez`: process liveness.
- `GET /readyz`: browser readiness and drain state.
- `GET /health`: safe status summary with active-request and browser state.
- `GET /metrics`: Prometheus text metrics with fixed, low-cardinality labels.

Scraper requests receive an `X-Request-ID`. Structured logs contain only an
allowlisted event schema. Caller address and user agent are represented as
HMAC-based `sourceId` and `agentId` values; raw addresses, target URLs, cookies,
tokens, proxy credentials, and returned page source are not logged. Set a private
`AUDIT_HASH_KEY` if those pseudonymous IDs must remain comparable across restarts.
Keep `TRUST_PROXY_HOPS=0` for direct exposure; set the exact hop count only when
the service is reachable exclusively through trusted proxies.

## Notes and Behavior

- The service keeps one global browser instance and creates a new isolated browser context per request.
- `turnstile-min` requires `siteKey`; the request schema enforces it.
- If browser startup is still in progress, requests return `503`.
- Proxy credentials are applied at the browser context level when both `proxy.username` and `proxy.password` are provided.
- Every request closes its Page and BrowserContext in a bounded cleanup path, including timeout and client-cancellation cases.
- The browser engine is clark-browser (stealth Chromium) driven through Patchright. The `CLARK_FINGERPRINT_*` environment variables control the browser persona; keep them coherent (platform, timezone, locale, network profile) to avoid detection.

## Quick Questions and Answers

### Does It Open A New Browser On Every Request?
No, a new context is started with each request and closed when the job is finished. Processes are executed with isolated contexts through a single browser.

### How Do I Limit The Browser Contexts That Can Open?
Set `BROWSER_LIMIT`. The legacy `browserLimit` spelling remains supported. The default is `20`.

### How Do I Add Authentication To The API?
You can enable one or both of these checks:

- `AUTH_TOKEN` (or legacy `authToken`): requires a matching `authToken` field in the JSON body.
- `process.env.CLIENT_KEY` or `process.env.clientKey`: requires a matching client key via `x-client-key`, `x-api-key`, `clientKey` in the body, or `clientKey` in the query string.

If a configured value does not match, the API returns `401`.

### How Do I Add Client-Key Validation To The API?
Set `process.env.CLIENT_KEY` or `process.env.clientKey`. If set, the API returns `401` unless the request provides the same key via the `x-client-key` header, `x-api-key` header, `clientKey` in the request body, or `clientKey` in the query string.

### How Do I Set The Timeout?
Set `BROWSER_TIMEOUT_MS` in milliseconds. The legacy `timeOut` spelling remains supported. The default is `60000`.

## Disclaimer of Liability

This repository was created purely for testing and training purposes. The user is responsible for any prohibited liability that may arise from its use.

The library is not intended to harm any site or company. The user is responsible for any damage that may arise.

Users of this repository are deemed to have accepted this disclaimer.
