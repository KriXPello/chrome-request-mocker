# Limitations and troubleshooting

## When changes take effect

After changing enabled configs/rules or syncing config files, reload the application page.

The active mock rules are loaded when the page starts.

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

Config files are read only when you choose a folder or click **Sync from folder**.

A successful sync stores a local snapshot inside Chrome. Folder access is not required while using already synced mocks.

If any config file is invalid, the sync fails and the previous working snapshot remains unchanged.

## A rule does not match

Check that:

- both the config and rule are enabled;
- the page was reloaded after the last change;
- the HTTP method matches;
- `*` is used for one path segment and `**` when the match needs to cross `/`;
- the pattern does not depend on query parameters.

You can also check the application DevTools console for `[Chrome Request Mocker]` messages.

## Folder access was lost

Open Settings and run **Sync from folder** again. Chrome may ask for permission to access the folder.

Already synced mocks continue to work.
