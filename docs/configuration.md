# Configuration

Chrome Request Mocker reads `.json` files from the selected folder. Subdirectories are not scanned.

## Config file

```json
{
  "id": "projects",
  "name": "Projects",
  "rules": []
}
```

- `id` — required, unique across all config files.
- `name` — optional, shown in the popup. Defaults to `id`.
- `rules` — required array of mock rules.

The config `id` is used to preserve its enabled state between syncs, so renaming the file does not reset it.

Configs are evaluated in filename order. Rules are evaluated in array order. The first enabled matching rule wins.

New configs are disabled by default. New rules added to an existing config are enabled by default.

Enabled state is stored by the extension and should not be added to JSON files.

## Rule

```json
{
  "id": "project-details",
  "name": "Project details",
  "pattern": "**/api/projects/*",
  "methods": ["GET"],
  "delay": 500,
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "id": "project-123",
      "name": "Example project"
    }
  }
}
```

Required fields:

- `id` — unique inside the config.
- `pattern` — URL glob.
- `response.body` — any valid JSON value.

Optional fields:

- `name` — label shown in the popup. Defaults to `id`.
- `methods` — HTTP methods to match. Defaults to all methods.
- `delay` — delay in milliseconds. Defaults to `0`.
- `response.status` — HTTP status. Defaults to `200`.
- `response.statusText` — HTTP status text.
- `response.headers` — response headers. Defaults to `Content-Type: application/json`.

Method matching is case-insensitive.

## URL patterns

Patterns are matched against the full absolute URL without the query string or hash.

| Pattern | Meaning |
| --- | --- |
| `*` | Any number of characters except `/` |
| `**` | Any number of characters, including `/` |
| `?` | One character except `/` |

Examples:

```text
**/api/users/me
**/api/projects/*/items/*
https://api.example.com/users/**
```

For example:

```text
**/api/projects/*/items/*
```

matches:

```text
https://example.com/api/projects/123/items/456
```

but not:

```text
https://example.com/api/projects/123/nested/items/456
```

because `*` cannot cross `/`.

Query parameters are ignored when matching, so these use the same rule:

```text
/api/users?page=1
/api/users?page=2
```

## Response

`response.body` may be any JSON value:

```json
{}
```

```json
[]
```

```json
null
```

```json
"hello"
```

```json
123
```

Example error response:

```json
{
  "id": "service-unavailable",
  "pattern": "**/api/payments",
  "methods": ["POST"],
  "response": {
    "status": 503,
    "statusText": "Service Unavailable",
    "headers": {
      "Retry-After": "30"
    },
    "body": {
      "code": "TRY_AGAIN_LATER"
    }
  }
}
```

Statuses `204`, `205`, and `304` require:

```json
"body": null
```

`HEAD` requests also return an empty body.

Invalid status values, headers, or other unsupported response values are rejected during sync.

### Multiple responses

A rule may define `response` as a non-empty array of complete response objects. Each object uses the same fields and defaults as a single response and must include `body`:

```json
"response": [
  { "name": "Loading", "status": 200, "body": { "loading": true } },
  { "name": "Ready", "status": 200, "body": { "loading": false } }
]
```

The optional response `name` must be a non-empty string and is shown in the popup; it is not sent as an HTTP response property. Without a name, the popup uses `Response 1`, `Response 2`, and so on.

New arrays select the first response. The selected zero-based index is stored locally by config and rule ID and falls back to `0` when it is missing or out of range. Reordering or inserting responses changes the meaning of a saved index.

## Complete example

```json
{
  "id": "storefront",
  "name": "Storefront",
  "rules": [
    {
      "id": "product",
      "pattern": "**/api/products/*",
      "methods": ["GET"],
      "response": {
        "body": {
          "id": "product-1",
          "name": "Mechanical Keyboard",
          "available": true
        }
      }
    },
    {
      "id": "update-product",
      "pattern": "**/api/products/*",
      "methods": ["PUT", "PATCH"],
      "delay": 800,
      "response": {
        "status": 202,
        "body": {
          "accepted": true
        }
      }
    }
  ]
}
```
