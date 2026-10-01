# Configuration

Chrome Request Mocker reads JSON configs from the selected folder.

- Subfolders are ignored.
- The first enabled matching rule wins.
- Sync applies changes only if every file is valid.

## Config and rule

A config file is an object containing an array of rules:

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
- `inputs` - optional, object of required local input descriptors used by templates; see [Inputs and templates](#inputs-and-templates)
- `rules` - required, array of rules

Each rule uses one of three forms.

### Fields common to all three rule forms

- `rules[].id` - required, rule identifier unique within the config
- `rules[].name` - optional, rule name shown in the popup; `rules[].id` is used when omitted
- `rules[].pattern` - required, URL glob matched against the absolute URL without query or hash
- `rules[].methods` - optional, non-empty array of HTTP methods; all methods are matched when omitted
- `rules[].delay` - optional, response delay in milliseconds: a number or `{ "min": number, "max": number }`; defaults to `0`. See [Response delay](#response-delay).

In the popup, a colored strip beside each rule shows its methods. Hover for the list; omitted `methods` shows “All methods”.

### Rule Form 1 - one response

Returns one fixed response. Add `query` to limit which requests match.

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
- `response.delay` - optional, overrides the rule's delay; uses the same number or range format
- `query` - optional, query conditions that determine whether the rule matches

Statuses `204`, `205`, and `304` require `body: null`.

### Rule Form 2 - manually selected responses

Choose a response variant in the popup.

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
- `query` - optional, limits requests for the whole rule; does not select a response

Response fields are the same as for a single `response`: `body`, `status`, `statusText`, `headers`, and `delay`. Fields `id`, `name`, and `delay` are metadata, not HTTP response content.

Selection:

- New rules select the first response.
- Selection is stored by `id`; reordering changes nothing.
- Sync keeps the selected ID, or selects the first response if that ID was removed.

### Rule Form 3 - automatically routed responses

Select a response by request query parameters. The first matching route wins.

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

Constraints:

- Put `query` on routes, not on the rule.
- At most one fallback route is allowed; it must be last.
- No matching route and no fallback: continue to the next rule.

The popup displays `Automatic · N routes` instead of a response selector.

## Response delay

Set `delay` on a rule, its single `response`, or any item in `responses`. Both formats use milliseconds:

- `500` — fixed delay.
- `{ "min": 200, "max": 800 }` — uniformly random delay, picked anew for each request after selecting its response.

Constraints:

- Fixed delays and range boundaries must be finite, non-negative numbers.
- Ranges require both `min` and `max`, with `min <= max`.

Priority:

1. Response `delay`, if set — even `0`.
2. Otherwise, rule `delay`.
3. Otherwise, `0`.

Delays are not added together.

```json
{
  "id": "projects",
  "pattern": "**/api/projects",
  "delay": { "min": 200, "max": 800 },
  "responses": [
    { "id": "success", "body": { "items": [] } },
    { "id": "slow", "delay": 3000, "body": { "items": [] } },
    { "id": "instant", "delay": 0, "body": { "items": [] } }
  ]
}
```

## Rules toggle

- Configs are disabled by default; new rules are enabled.
- Toggle state is stored locally and survives sync while config and rule IDs stay the same.

## Inputs and templates

Declare inputs in the optional top-level `inputs` object; enter their values in the popup, not the JSON file.

- Every declared input is required.
- Values are local to your browser profile.
- Input IDs must match `[A-Za-z_][A-Za-z0-9_]*`.

Each descriptor accepts only these fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | input ID | Non-empty label shown in the popup |
| `description` | omitted | Tooltip on the `?` icon after the input label in the popup |
| `type` | `"string"` | One of `"string"`, `"number"`, or `"boolean"` |
| `masked` | `false` | Uses a password control in the popup; may be specified only for string inputs |

```json
{
  "id": "tenant-api",
  "inputs": {
    "tenant": { "name": "Tenant ID", "description": "Tenant whose API responses should be mocked" },
    "token": { "name": "Access token", "masked": true },
    "limit": { "type": "number" },
    "preview": { "type": "boolean" }
  },
  "rules": [
    {
      "id": "list",
      "pattern": "**/tenants/${tenant}/items",
      "query": [{ "token": "${token}" }],
      "response": {
        "headers": { "X-Tenant": "tenant-${tenant}" },
        "body": {
          "limit": "${limit}",
          "preview": "${preview}",
          "message": "Tenant ${tenant}",
          "placeholderExample": "$${tenant}"
        }
      }
    }
  ]
}
```

| Syntax | Result |
| --- | --- |
| `${id}` | Value of the declared input |
| `$${id}` | Literal text `${id}` |

Unknown inputs or malformed placeholders reject the entire sync.

Substitution is performed only in:

- rule `pattern`;
- rule and route `query` values;
- string values anywhere inside a response `body`;
- response header values.

Object keys and structural fields (`id`, `name`, `methods`, `status`, `statusText`, etc.) are not templates.

Body value types:

| Example | Result type |
| --- | --- |
| `"${limit}"` | Number, matching the input type |
| `"${preview}"` | Boolean, matching the input type |
| `"Tenant ${tenant}"` | String |

Header values always produce strings.

Inserted values are literal:

- They are never parsed again as templates.
- In `pattern` and `query`, input wildcards stay literal: `team-*` matches the text `team-*`.

### Editing and persistence

1. Open **Inputs** in the config header.
2. Edit the values.
3. Click **Save** or **Cancel** in the same header.

| Action | Effect |
| --- | --- |
| **Save** | Validates and replaces the config's entire local input set at once |
| **Cancel** | Discards the draft and restores saved values |

**Incomplete inputs**

- An empty string counts as missing; numbers must be finite.
- Booleans distinguish **Not set**, `true`, and `false`.
- Saving incomplete inputs disables the config.
- The config checkbox stays disabled until all inputs are filled. Then enable it manually.

**Drafts**

- Edits are saved locally as you type.
- Closing the popup keeps the draft and the **Inputs · Unsaved** marker.
- Reopening **Inputs** restores the draft.

**After sync**

Values are stored separately from configs, by config ID and input ID.

| Change | Saved values and drafts |
| --- | --- |
| Same config ID, input ID, and type | Kept |
| Only `name`, `description`, or `masked` changed | Kept |
| Input type changed, or input/config deleted | Removed |

If sync leaves inputs incomplete, the config is disabled automatically.

**Security**

- `masked` hides text in the popup; saved values and drafts are **not encrypted**.
- Ready, enabled configs send resolved rules to pages. See [Runtime data visibility](limitations.md#runtime-data-visibility).

## URL patterns

`pattern` matches the absolute URL without query or hash.

| Pattern | Matches |
| --- | --- |
| `*` | Zero or more characters, except `/` |
| `**` | Zero or more characters, including `/` |
| `?` | Exactly one character, except `/` |

Use `query` for query parameters.

## Query matching

`query` is an optional, non-empty array of non-empty objects.

- Objects: any one may match (OR).
- Keys within an object: all must match (AND).
- Each value: a string, or a non-empty string array where any item may match (OR).

```json
{
  "query": [
    { "status": ["active", "draft"], "page": "1" },
    { "preview": "?" }
  ]
}
```

For this example, either `status=active&page=1`, `status=draft&page=1`, or `preview` with zero or one character matches.

Matching rules:

- Names and values are case-sensitive.
- Configured parameters must be present; extra parameters are ignored.
- Repeated parameters: at least one value must match.
- Values are decoded with `URLSearchParams`; `+` becomes a space.
- An empty pattern matches only an empty value.

All query wildcards can match `/` and line breaks:

| Pattern | Matches |
| --- | --- |
| `*` | Zero or more characters |
| `?` | Zero or one character |
| `+` | One or more characters |

To match wildcard characters or backslashes literally:

| Write in JSON | Matches |
| --- | --- |
| `"\\*"` | Literal `*` |
| `"\\?"` | Literal `?` |
| `"\\+"` | Literal `+` |
| `"\\\\"` | Literal `\` |

Other pattern backslash escapes are not allowed. Invalid escapes reject the entire sync.
