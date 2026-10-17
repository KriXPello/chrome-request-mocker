# Site access

The extension requests site access through Chrome's optional host permissions. A new installation has no site access and injects no content scripts until permission is granted. There is no separate allowlist stored by the extension: the settings page displays Chrome's granted permissions.

## Granting access

For the current site, click the extension icon and choose **Grant access** in the popup. Approve Chrome's permission request, then click **Reload page**. The site-access panel disappears once the page's interceptor is running. Browser-internal and non-HTTP(S) pages cannot be granted access here.

The `activeTab` permission lets the popup identify the current site when you click the extension icon. It does not grant persistent site access or automatically enable injection: persistent access is requested separately through Chrome's optional host permissions.

To manage other sites or include subdomains, use the extension settings:

1. Open the extension settings and find **Site access**.
2. Enter a site, for example `https://site.test.com` or `http://localhost:3000`.
3. Click **Grant access** and approve Chrome's permission request.
4. Reload the site so the interceptor can run at the start of the document.

Grant access to the site displaying your application, not just the API server it calls. Permissions control where the page's fetch/XHR functions can be patched; config rules still decide which outgoing request URLs are mocked.

Access is scoped to the scheme and host, optionally a port, and applies to every path. Use `https://*.example.com` to include the domain and its subdomains. Without an explicit port, the permission covers all ports on that host. HTTP and HTTPS permissions are separate.

Scripts are registered dynamically for granted sites in both the page's main world and the extension's isolated world. They run at `document_start`, including matching frames. Related frames such as `about:blank` or `blob:` can inherit injection eligibility from their creator's origin; runtime configuration is still checked against the sending frame's origin. Opaque origins are not given mock configuration.

Chrome's own extension site-access controls may further restrict execution. Sites where Chrome prohibits extensions, such as `chrome://` pages, cannot be enabled here.

## Removing access

Click **Remove** beside a granted permission. The extension updates its registered scripts and notifies open pages to reread their access. A frame without permission receives an empty runtime configuration, so subsequent requests pass through normally.

Unregistering a content script does not remove code already injected into a document. Reload open pages to remove it completely. Previously intercepted requests keep their selected responses; already disclosed configuration cannot be retracted.

Broader grants can overlap narrower grants. For example, removing access to a specific host does not exclude it from an existing `https://*.example.com/*` permission. Remove the covering permission if you want to revoke that host's access.

## Existing installations

After updating from a version with access to all sites, inspect the **Site access** list. If Chrome retained broad permissions such as `<all_urls>` or `https://*/*`, remove them and grant only the sites you need. The extension does not silently revoke existing browser permissions.

## Configuration visibility

Background broadcasts contain only an update notification, not mock data. Each frame requests its configuration separately, and the background checks Chrome permissions before reading it and again before returning it.

Granted pages receive the entire active runtime configuration, not only rules matching that page. Their scripts can observe resolved input values, bodies and headers. Site permissions reduce the set of pages receiving this data; they do not make it secret from pages that you allow.
