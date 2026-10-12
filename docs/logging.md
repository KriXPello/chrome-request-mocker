# Request logging

Choose a logging mode in the extension settings. Changes are saved automatically and apply to open pages:

- **Off**: no mock request logs; configuration diagnostics remain enabled.
- **Short** (default): a summary line when a request is intercepted and another when it completes.
- **Detailed**: the summary plus request metadata, config/rule/response IDs and delay details.

Each mocked request produces a **Request** log immediately after a matching rule is selected, before the configured delay. Completion produces a **Response**, **Abort** or **Timeout** log. Both entries share a request number, such as `[Mock #1]`, so parallel requests can be correlated. Numbers are shared by fetch and XHR within a page frame and reset when it reloads. Requests passed through to the server are not logged.

The delay shown is the configured delay resolved for this request, not the elapsed time until completion. Detailed logs also include `requestId` and `event` (`request`, `response`, `abort` or `timeout`).

Enable the **Include response** checkbox to also log `{ status, statusText, headers, body }` for completed mock responses:

- With **Short**, the response object appears directly beside the summary, without a `response` wrapper.
- With **Detailed**, the response object is included in the details under `response`.
- With **Off**, the checkbox is disabled, but its saved value is retained.

The checkbox is off by default. The body is an expandable JSON value with templates already resolved and the actual selected response variant. Logs use a snapshot, so subsequent application changes to the received object do not change the logged body.

Logs appear in the intercepted page's DevTools console at the **Verbose** (`console.debug`) level. Only **Response** entries include a response object when the checkbox is enabled; **Request**, **Abort** and **Timeout** entries do not. HEAD requests and statuses 204, 205 and 304 log `body: null` because no body is delivered.

Response headers and bodies may contain sensitive data; response logging is opt-in. The extension does not save request history.
