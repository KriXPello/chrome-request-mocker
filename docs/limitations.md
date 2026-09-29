# Limitations and troubleshooting

## When changes take effect

Changes to enabled configs, rules, selected responses, input values, and synchronized files are sent to open pages immediately. They affect subsequent requests; requests already in progress keep the configuration with which they started.

The badge on the extension icon shows the number of enabled configs whose required inputs are complete. It counts configs rather than individual rules; an enabled config is counted even when all of its rules are disabled.

## What is intercepted

Chrome Request Mocker intercepts requests made by page code through:

- `fetch`
- asynchronous `XMLHttpRequest`
- synchronous `XMLHttpRequest` after the mock config has loaded

It does not intercept:

- page navigations
- images or scripts loaded by HTML
- WebSocket or EventSource connections
- requests made inside Service Workers
- pages where Chrome does not allow extensions to run, such as `chrome://` pages

Requests without a matching rule are sent normally.

When a rule matches, the configured response is returned without contacting the real server.

## Syncing

Config files are read only when you choose a folder, click **Sync from folder** in Settings, or click **Sync** in the popup.

A successful sync stores a local snapshot inside Chrome. Folder access is not required while using already synced mocks.

If any config file is invalid, the sync fails and the previous working snapshot remains unchanged.

## Runtime data visibility

Config files and input values are stored locally in the browser profile and are not uploaded by the extension. However, enabled and complete configs are resolved and delivered to pages where the extension runs so that page-context code can intercept requests. At present, every eligible page receives the active runtime configuration, even when none of its URLs match a rule. Page scripts can observe that configuration, including input values used in patterns, query conditions, response bodies, or response headers.

Treat `masked` as a display convenience, not a security boundary. Do not store credentials that must remain secret from the pages open in this browser profile.

## A rule does not match

Check that:

- both the config and rule are enabled;
- all inputs declared by the config have values;
- the HTTP method matches;
- `*` is used for one path segment and `**` when the match needs to cross `/`;
- the pattern does not depend on query parameters.

You can also check the application DevTools console for `[Chrome Request Mocker]` messages.

## Folder access was lost

Click **Sync** in the popup or **Sync from folder** in Settings. Chrome may ask for permission to access the folder.

Already synced mocks continue to work.
