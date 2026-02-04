> [!WARNING]
> This repo will no longer receive updates. Thank you to everyone who supported it.

# CF Clearance Scraper

This library was created for testing and training purposes to retrieve the page source of websites, create Cloudflare Turnstile tokens and create Cloudflare WAF sessions.

Cloudflare protection not only checks cookies in the request. It also checks variables in the header. For this reason, it is recommended to use it with the sample code in this readme file.

Cookies with cf in the name belong to Cloudflare. You can find out what these cookies do and how long they are valid by **[Clicking Here](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)**.

## Sponsor

[![ScrapeDo](src/data/sdo.gif)](https://scrape.do/?utm_source=github&utm_medium=repo_ccs)

## Installation

Installation with Docker is recommended.

**Docker**

Please make sure you have installed the latest image. If you get an error, try downloading the latest version by going to Docker Hub.

```bash
sudo docker rmi zfcsoftware/cf-clearance-scraper:latest --force
```

```bash
docker run -d -p 3000:3000 \
-e PORT=3000 \
-e browserLimit=20 \
-e timeOut=60000 \
-e CLIENT_KEY=your_client_key \
zfcsoftware/cf-clearance-scraper:latest
```

If `CLIENT_KEY` is set, each request must include the same key (recommended via `x-client-key` header), otherwise it returns 401.

**Docker Compose**

`docker-compose.yml` is included in this repo.

```bash
docker compose up -d
```

**Github**

```bash
git clone https://github.com/zfcsoftware/cf-clearance-scraper
cd cf-clearance-scraper
npm install
npm run start
```

## Create Cloudflare WAF Session

By creating a session as in the example, you can send multiple requests to the same site without being blocked. Since sites may have TLS protection, it is recommended to send requests with the library in the example.

If you didn't set `CLIENT_KEY`, you can omit the `x-client-key` header in the examples below.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://nopecha.com/demo/cloudflare","mode":"waf-session"}'
```

## Create Turnstile Token with Little Resource Consumption

This endpoint allows you to generate tokens for a Cloudflare Turnstile Captcha. It blocks the request that fetches the page resource and instead makes the page resource a simple Turnstile render page. This allows you to generate tokens without having to load any additional css or js files. 

However, in this method, the siteKey variable must be sent to Turnstile along with the site to create the token. If this does not work, you can examine the token generation system by loading the full page resource described in the next section.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://turnstile.zeroclover.io/","siteKey":"0x4AAAAAAAEwzhD6pyKkgXC0","mode":"turnstile-min"}'
```

## Creating Turnstile Token with Full Page Load

This example request goes to the page at the given url address with a real browser, resolves the Turnstile and returns you the token.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://turnstile.zeroclover.io/","mode":"turnstile-max"}'
```

## Getting Page Source from a Site Protected with Cloudflare WAF

With this request you can scrape the page source of a website protected with CF WAF.

```bash
curl -sS -X POST "http://localhost:3000/cf-clearance-scraper" \
  -H "content-type: application/json" \
  -H "x-client-key: your_client_key" \
  --data-raw '{"url":"https://nopecha.com/demo/cloudflare","mode":"source"}'
```

## Quick Questions and Answers

### Does It Open A New Browser On Every Request?
No, a new context is started with each request and closed when the job is finished. Processes are executed with isolated contexts through a single browser.

### How Do I Limit the Browser Context to Open?
You can do this by changing the process.env.browserLimit value. The default is 20

### How Do I Add Authentication to Api?
You can add authorisation by changing the process.env.authToken variable. If this variable is added, it returns 401 if the authToken variable in the request body is not equal to the token you specify.

### How Do I Add clientKey Validation to Api?
You can add clientKey validation by setting `process.env.CLIENT_KEY` (or `process.env.clientKey`). If set, the API returns 401 unless the request provides the same key via the `x-client-key` header (recommended), `x-api-key` header, `clientKey` in request body, or `clientKey` query string.

### How Do I Set The Timeout Time?
You can give the variable process.env.timeOut a value in milliseconds. The default is 60000.

## Disclaimer of Liability
This repository was created purely for testing and training purposes. The user is responsible for any prohibited liability that may arise from its use.
The library is not intended to harm any site or company. The user is responsible for any damage that may arise. 
Users of this repository are deemed to have accepted this disclaimer. 
