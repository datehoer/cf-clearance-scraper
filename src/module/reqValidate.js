const Ajv = require("ajv")
const addFormats = require("ajv-formats")

const ajv = new Ajv()
addFormats(ajv)

const schema = {
    "type": "object",
    "maxProperties": 6,
    "properties": {
        "mode": {
            "type": "string",
            "enum": ["source", "turnstile-min", "turnstile-max", "waf-session"],
        },
        "proxy": {
            "type": "object",
            "properties": {
                "host": { "type": "string", "minLength": 1, "maxLength": 255 },
                "port": { "type": "integer", "minimum": 1, "maximum": 65535 },
                "username": { "type": "string", "maxLength": 512 },
                "password": { "type": "string", "maxLength": 512 }
            },
            "required": ["host", "port"],
            "additionalProperties": false
        },
        "url": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://",
            "maxLength": 4096
        },
        "authToken": {
            "type": "string",
            "maxLength": 4096
        },
        "clientKey": {
            "type": "string",
            "maxLength": 4096
        },
        "siteKey": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
        }
    },
    "required": ["mode", "url"],
    "allOf": [
        {
            "if": {
                "properties": { "mode": { "const": "turnstile-min" } },
                "required": ["mode"]
            },
            "then": { "required": ["siteKey"] }
        }
    ],
    "additionalProperties": false
}

// const data = {
//     mode: "source",
//     url: "https://example.com",
//     proxy: {
//         host: "localhost",
//         port: 8080,
//         username: "test",
//         password: "test"
//     },
//     authToken: "123456"
// }


const validateRequest = ajv.compile(schema)

function validate(data) {
    const valid = validateRequest(data)
    if (!valid) return validateRequest.errors
    else return true
}

module.exports = validate
