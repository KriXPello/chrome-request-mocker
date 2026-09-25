# Configuration (schema v1)

Chrome Request Mocker reads JSON files from the selected folder (not subdirectories). Files are sorted by filename and rules by array order; the first enabled match wins. Sync validates every file atomically. 

## Config and rule

A config file contains an array of rules:

```json
{
  "id": "projects",
  "name": "Projects",
  "rules": []
}
```

Config fields:

- `id` - required, config identifier unique across all config files
- `name` - optional, config name shown in the popup; `id` is used when omitted
- `rules` - required, array of rules

Each rule uses one of three forms.

### Fields common to all three rule forms

- `rules[].id` - required, rule identifier unique within the config
- `rules[].name` - optional, rule name shown in the popup; `rules[].id` is used when omitted
- `rules[].pattern` - required, URL glob matched against the absolute URL without query or hash
- `rules[].methods` - optional, non-empty array of HTTP methods; all methods are matched when omitted
- `rules[].delay` - optional, response delay in milliseconds; defaults to `0`

### Rule Form 1 - one response

The simplest rule. It always returns one fixed response.

An optional `query` limits which requests match the rule.

```json
{
  "id": "project-details",
  "name": "Project details",
  "pattern": "**/api/projects/*",
  "methods": ["GET"],
  "delay": 500,
  "query": [{ "view": "full" }],
  "response": {
    "status": 200,
    "body": { "id": 1 }
  }
}
```

- `response` - required, the response returned by the rule
- `response.body` - required, any JSON value
- `response.status` - optional, HTTP status code; defaults to `200`
- `response.statusText` - optional, HTTP status text; defaults to an empty string
- `response.headers` - optional, HTTP headers; defaults to `Content-Type: application/json`
- `query` - optional, query conditions that determine whether the rule matches

Statuses `204`, `205`, and `304` require `body: null`.

### Rule Form 2 - manually selected responses

Use this form to manually switch between predefined response variants in the extension popup.
The selected response is stored by its `id`, so reordering the array does not change the selection.
An optional `query` applies to the whole rule and does not select a response.

```json
{
  "id": "projects-list",
  "pattern": "**/api/projects",
  "responses": [
    { "id": "empty", "name": "Empty", "body": { "items": [] } },
    { "id": "full", "name": "Full", "body": { "items": [1] } }
  ]
}
```

- `responses` - required, non-empty array of response objects
- `responses[].id` - required, response identifier unique within the rule
- `responses[].name` - optional, response name shown in the popup; `id` is used when omitted
- `query` - optional, query conditions that determine whether the rule matches

Each item in `responses` uses the same `body`, `status`, `statusText`, and `headers` fields as a single `response`. Response `id` and `name` are configuration metadata and are not sent as part of the HTTP response. New rules select the first response; sync preserves the selected ID and falls back to the first response if that ID disappears.

### Rule Form 3 - automatically routed responses

Use this form when the response must be selected automatically from the request query parameters. Routes are checked in order, and the first matching route selects its response.

```json
{
  "id": "projects-list",
  "pattern": "**/api/projects",
  "responses": [
    { "id": "active", "body": { "items": [1] } },
    { "id": "fallback", "body": { "items": [] } }
  ],
  "routes": [
    { "query": [{ "status": "active" }], "responseId": "active" },
    { "responseId": "fallback" }
  ]
}
```

- `responses` - required, non-empty array of response objects with unique IDs
- `routes` - required, non-empty ordered array of routes
- `routes[].query` - optional, query conditions for the route; omitting it creates a fallback route
- `routes[].responseId` - required, ID of a response from the rule's `responses` array

A routed rule does not use a rule-level `query`; query conditions belong to individual routes.

At most one fallback route is allowed, and it must be last. If no route matches and there is no fallback, evaluation continues with the next rule.

The popup displays `Automatic · N routes` instead of a response selector.

## Rules toggle

Configs are disabled by default, and new rules are enabled by default. Enabled state is stored locally and preserved by config and rule IDs across sync.

## URL patterns

Patterns match the absolute URL without query or hash. `*` matches any characters except `/`, `**` matches any characters including `/`, and `?` matches one character except `/`. Query matching is configured separately.

## Query matching

`query` is an optional non-empty array of non-empty objects. Objects are OR alternatives; keys in an object are AND conditions. Each value is a string or non-empty string array (OR). Names and values are case-sensitive, extra request parameters are ignored, and a configured name must be present. Request values are decoded by `URLSearchParams`, including `+` as space; repeated values match existentially.

```json
{
  "query": [
    { "status": ["active", "draft"], "page": "1" },
    { "preview": "?" }
  ]
}
```

Query values support glob-like patterns (unlike `rule.pattern` including `/` and line terminators): 
- `*` is zero or more arbitrary characters;
- `?` is zero or one arbitrary characters;
- `+` is one or more. 

To match these characters literally, write `"\\*"`, `"\\?"`, `"\\+"`, or `"\\\\"` in the JSON file. After JSON parsing, these become the logical patterns `\*`, `\?`, `\+`, and `\\`.

No other backslash escapes are allowed. Empty strings match only empty values. Malformed escapes reject the complete sync.
