# Configuration

Chrome Request Mocker reads JSON files from the selected folder; subfolders are ignored. Sync applies changes only if every file is valid. Otherwise, the previous configuration remains unchanged.

## Config

A config contains an array of rules. This complete example returns an empty project list:

```json
{
  "id": "projects",
  "name": "Projects",
  "rules": [
    {
      "id": "list",
      "pattern": "**/api/projects",
      "methods": ["GET"],
      "response": { "body": { "items": [] } }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Required, non-empty identifier unique across config files |
| `name` | Optional label; defaults to `id` |
| `inputs` | Optional input declarations; see [Inputs and templates](#inputs-and-templates) |
| `rules` | Required array of rules |

## Rules

The first enabled rule whose URL, method, and conditions match returns a mock response without contacting the server. Requests without a matching rule pass through normally.

Common rule fields:

| Field | Meaning |
| --- | --- |
| `id` | Required, non-empty identifier unique within the config |
| `name` | Optional label; defaults to `id` |
| `pattern` | Required URL pattern; see [URL patterns](#url-patterns) |
| `methods` | Optional, non-empty array of HTTP methods; omitted means all methods |
| `queryMap` | Optional mapping of query parameter names to template variable names; see [Query variables](#query-variables) |
| `delay` | Optional response delay; see [Response delay](#response-delay) |

Each rule uses one of the following three forms. `response` and `responses` cannot be combined.

### One response

Use `response` to return a single [response object](#response), as in the config above. Optional rule-level `query` conditions limit which requests match.

### Manually selected responses

Use a non-empty `responses` array to define variants:

```json
{
  "id": "list",
  "pattern": "**/api/projects",
  "responses": [
    { "id": "empty", "name": "Empty", "body": { "items": [] } },
    { "id": "full", "name": "Full", "body": { "items": [1] } }
  ]
}
```

Each item is a [response object](#response) with a required, non-empty `id` unique within the rule and an optional `name` defaulting to `id`.

The selected variant is used for every matching request. Initially, the first response is selected. Sync preserves the selection by ID, regardless of ordering; if that ID is removed, the first response is selected instead.

Optional rule-level `query` conditions limit matching requests; they do not select a variant.

### Automatically routed responses

Add `routes` to a rule with `responses` to select a variant by request conditions:

```json
{
  "id": "list",
  "pattern": "**/api/projects",
  "responses": [
    { "id": "active", "body": { "items": [1] } },
    { "id": "empty", "body": { "items": [] } }
  ],
  "routes": [
    { "query": [{ "status": "active" }], "responseId": "active" },
    { "responseId": "empty" }
  ]
}
```

`routes` is a non-empty array, checked in order. The first matching route wins.

| Route field | Meaning |
| --- | --- |
| `query` | Optional conditions on query parameters after `?` |
| `params` | Optional conditions on values captured by the URL pattern |
| `responseId` | Required ID of a response in this rule's `responses` array |

- `query` and `params` use the same [condition format](#conditions-query-and-params). When both are present, both must match.
- Put `query` on routes, not on the rule.
- A route without either condition is a fallback. At most one is allowed, and it must be last.
- If no route matches and there is no fallback, matching continues with the next rule.

## URL patterns

`pattern` matches the absolute URL without query parameters or hash.

| Syntax | Matches |
| --- | --- |
| `*` | Zero or more characters, except `/` |
| `**` | Zero or more characters, including `/` |
| `?` | Exactly one character, except `/` |
| `{id}` | One non-empty segment without `/`, captured as `id` |
| `{path:**}` | Zero or more characters, including `/`, captured as `path` |

Captures use the shared [variable naming rules](#template-syntax). Names must be unique within the pattern and must not conflict with inputs or `queryMap` variables.

Captured values are strings. Percent-encoded characters are decoded once; `+` stays `+`. If a value contains invalid percent encoding, it is left unchanged.

Use captures in route `params` conditions or insert them with `$[[name]]`:

```json
{
  "id": "project-file",
  "pattern": "**/projects/{id}/files/{path:**}",
  "responses": [
    { "id": "file", "body": { "projectId": "$[[id]]", "file": "$[[path]]" } }
  ],
  "routes": [
    {
      "params": [{ "id": ["42", "43"], "path": "*.json" }],
      "query": [{ "owner": "$[[id]]" }],
      "responseId": "file"
    }
  ]
}
```

For a URL ending in `/projects/42/files/reports/daily.json?owner=42`, this returns `{"projectId":"42","file":"reports/daily.json"}`. Both the captured-value conditions and the query condition must match.

Capture syntax applies only to `pattern`; `{id}` in a response body is ordinary text.

## Query variables

Use rule-level `queryMap` to make query values available through `$[[name]]`. Each key is a query parameter name; its value is a template variable name:

```json
{
  "id": "search",
  "pattern": "**/api/search",
  "queryMap": { "q": "query.search", "tag": "query.tags" },
  "responses": [
    {
      "id": "results",
      "body": { "search": "$[[query.search]]", "tags": "$[[query.tags]]" }
    },
    { "id": "empty", "body": { "items": [] } }
  ],
  "routes": [
    { "query": [{ "q": "+" }], "responseId": "results" },
    { "responseId": "empty" }
  ]
}
```

For `/api/search?q=hello&tag=red&tag=blue`, this returns `{"search":"hello","tags":["red","blue"]}`.

- An absent parameter produces `""`; one occurrence produces a string; multiple occurrences produce an array of strings in URL order, including empty or duplicate values.
- Values are decoded, with `+` treated as a space, just like query conditions.
- `queryMap` does not filter requests. Use `query` conditions to require a parameter; a request without `q` in the example still reaches the fallback.
- Query variables are available in conditions and responses in all three rule forms. Route `params` keys still refer only to pattern captures.
- Parameter names must be non-empty. Variable names follow the shared [naming rules](#template-syntax); duplicates and conflicts reject sync.

<a id="query-matching"></a>

## Conditions: query and params

`query` checks query parameters after `?`. Route `params` checks URL captures; every key must name a capture in the rule's pattern.

Both use a non-empty array of non-empty objects:

- Objects are alternatives: any one may match (OR).
- Keys within an object must all match (AND).
- A value is a string pattern or a non-empty array of string patterns; any item may match (OR).

```json
{
  "query": [
    { "status": ["active", "draft"], "page": "1" },
    { "preview": "?" }
  ]
}
```

This matches `status=active&page=1`, `status=draft&page=1`, or a present `preview` parameter with zero or one character.

Names and values are case-sensitive. Specified parameters must be present; extra parameters are ignored. For repeated query parameters, at least one value must match. Query values are decoded, with `+` treated as a space.

### Condition patterns

These wildcards apply to both `query` and `params`, and can match `/` and line breaks:

| Syntax | Matches |
| --- | --- |
| `*` | Zero or more characters |
| `?` | Zero or one character |
| `+` | One or more characters |

Unlike URL patterns, `?` here can match an empty value. An empty pattern matches only an empty value.

Escape wildcard characters and backslashes to match them literally:

| Write in JSON | Matches |
| --- | --- |
| `"\\*"` | Literal `*` |
| `"\\?"` | Literal `?` |
| `"\\+"` | Literal `+` |
| `"\\\\"` | Literal `\` |

Other condition-pattern backslash escapes are invalid and reject sync.

## Response

These fields apply to both a single `response` and every item in `responses`:

| Field | Meaning |
| --- | --- |
| `body` | Required, any JSON value |
| `status` | Optional HTTP status, an integer from `200` to `599`; defaults to `200` |
| `statusText` | Optional HTTP status text; defaults to an empty string |
| `headers` | Optional object of header names and string values; includes `Content-Type: application/json` by default |
| `delay` | Optional delay overriding the rule's delay |

Custom headers replace default headers with the same name, ignoring case. Statuses `204`, `205`, and `304` require `body: null`.

### Response delay

Delays use milliseconds:

- `500` — a fixed delay.
- `{ "min": 200, "max": 800 }` — a uniformly random delay chosen for each request.

Numbers must be finite and non-negative; ranges require both boundaries with `min <= max`. A response's delay overrides the rule's delay, including `0`; they are not added together. The default is `0`.

## Inputs and templates

Declare inputs in the top-level `inputs` object and supply values locally or set a `default` in the config. Every declared input needs a value. Input IDs follow the shared [variable naming rules](#template-syntax).

Each input descriptor accepts only these fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | Input ID | Non-empty label |
| `description` | Omitted | Description of the input |
| `type` | `"string"` | `"string"`, `"number"`, `"boolean"`, `"datetime"`, or `"relative-datetime"` |
| `masked` | `false` | Hides entered text; a boolean allowed only for string inputs |
| `format` | `"iso"` | Date/time inputs only: `"iso"`, `"timestamp-ms"`, or `"timestamp-s"` |
| `default` | Omitted | Initial value: matches the input type; ISO string for `datetime`, seconds offset for `relative-datetime` |

```json
{
  "id": "tenant-api",
  "inputs": {
    "tenant": { "name": "Tenant ID" },
    "limit": { "type": "number", "default": 20 },
    "preview": { "type": "boolean", "default": false }
  },
  "rules": [
    {
      "id": "list",
      "pattern": "**/tenants/$[[tenant]]/items",
      "response": {
        "headers": { "X-Tenant": "$[[tenant]]" },
        "body": {
          "limit": "$[[limit]]",
          "preview": "$[[preview]]",
          "message": "Tenant $[[tenant]]"
        }
      }
    }
  ]
}
```

### Template syntax

| Syntax | Result |
| --- | --- |
| `$[[name]]` | Value of an input, URL capture, or `queryMap` variable |
| `$$[[name]]` | Literal text `$[[name]]` |

Variable names must match `[A-Za-z_][A-Za-z0-9_.]*`. Dots are ordinary name characters, not property access: `query.search`, `query..search`, and `query.` are valid; `.search` is not. Prefixes such as `query`, `path`, and `input` have no special meaning.

Inputs, pattern captures, and `queryMap` variables share a namespace within each rule. Conflicts are checked by full name: `id` and `query.id` are different variables. Duplicate names, unknown references, and malformed placeholders reject sync; rename a conflicting variable to resolve it.

| Template location | Available values |
| --- | --- |
| Rule `pattern` | Inputs only |
| Rule or route `query` values, route `params` values | Inputs, this rule's URL captures and query variables |
| String values anywhere in response `body`, response header values | Inputs, this rule's URL captures and query variables |

Object keys and other fields such as `id`, `name`, `methods`, `status`, and `statusText` are not templates.

When a body value is exactly one placeholder, its type is preserved: `"$[[limit]]"` becomes a number, `"$[[preview]]"` a boolean, and `"$[[query.tags]]"` an array when `tag` is repeated. URL captures are always strings. Interpolation such as `"Tenant $[[tenant]]"`, condition substitutions, and all header substitutions produce strings; arrays become comma-separated text, such as `red,blue`.

Inserted values are literal: they are never parsed again as templates, wildcards, or captures. For example, an inserted `team-*` matches that exact text, not every name starting with `team-`.

### Date and time inputs

Use `datetime` for a fixed date or `relative-datetime` for current time plus an offset in seconds:

```json
{
  "inputs": {
    "createdAt": { "type": "datetime" },
    "statusChangedAt": { "type": "relative-datetime", "format": "timestamp-ms", "default": -30 }
  }
}
```

Use `"$[[statusChangedAt]]"` in a response body:

| `format` | Exact body placeholder produces |
| --- | --- |
| `"iso"` (default) | UTC ISO string, e.g. `"2026-10-05T12:00:00.000Z"` |
| `"timestamp-ms"` | Number of milliseconds since the Unix epoch |
| `"timestamp-s"` | Number of whole seconds since the Unix epoch, rounded down |

Fixed dates are entered in the browser's local time zone. Relative offsets default to `0`; `-30` means 30 seconds ago. Relative dates are saved, not recalculated per request; changing `format` preserves the date. Headers and interpolated strings produce text.

### Input values

Sync fills missing values from `default`; saved values take precedence, even if the default changes. Defaults must be valid, non-empty values. A `datetime` default is a UTC ISO string such as `"2026-10-05T12:00:00.000Z"`, regardless of output format. Newly applied relative defaults share one current time at sync, not per request.

Values are local to your browser profile and survive sync while config ID, input ID, and type remain unchanged. Changing an input's type or deleting the input or config discards its values; label, description, masking, and format changes do not.

Incomplete inputs disable the config. Empty strings count as missing, numbers must be finite, and `0` and `false` are valid values. Date/time inputs require a valid fixed date or a finite relative offset that produces a valid date. After completing the inputs, enable the config again.

`masked` does not encrypt values. Values used by enabled configs are visible to page scripts; see [Runtime data visibility](limitations.md#runtime-data-visibility).
