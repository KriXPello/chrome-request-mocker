# Project structure

The extension uses native JavaScript modules without a build step. Load the repository root as an unpacked extension; `manifest.json` points to the entry files under `src/`.

```text
src/
  background/
    index.js                Service worker messaging, badge and runtime updates
    runtime-config.js       Assembly of enabled rules with saved inputs
  content/
    bridge.js               Isolated-world bridge to page scripts
    interceptor-main.js     Main-world fetch/XHR interception and request matching
  config/
    normalize-config.js     Config validation and normalization
    inputs.js               Input declarations, defaults and value readiness
    templates.js            Template parsing and substitution
    url-pattern.js          URL pattern parsing, captures and compilation
    runtime-rule.js         Rule preparation with saved inputs and deferred templates
    datetime.js             Date/time input values and formatting
  sync/
    sync-from-directory.js  Directory access, JSON reading and config import
  storage/
    db.js                   IndexedDB and persisted config/input state
  ui/
    runtime-config.js       Runtime update notification after saving
    popup/
      index.html
      styles.css
      index.js              Interaction state, loading and persistence actions
      config-card.js        Config card rendering and collapse preferences
      rule-row.js           Rule controls, query conditions and routes
      input-editor.js       Input editor rendering and value collection
      input-drafts.js       Local input drafts and raw value conversion
      format-date.js        Sync and source modification date display
    settings/
      index.html
      styles.css
      index.js              Folder selection, synchronization and logging settings
    viewer/
      index.html
      styles.css
      index.js              Read-only response browsing and local variant selection
      sidebar-resize.js     Pointer and keyboard resizing of the rule navigation
    controls/
      datetime-control.js   Shared date/time input controls
      method-indicator.js   Shared HTTP method indicator
      method-indicator.css  Method colors shared by the popup and viewer
      rule-details.js       Shared routing tables and query condition rendering
      rule-details.css      Shared routing and condition styles
```

`vendor/codemirror/` contains a pinned CodeMirror 5 distribution, its MIT license and source information. Only the response viewer loads it, through local script and stylesheet tags; no package installation or build is required.

## Data flow

1. `sync/` reads the selected folder and passes each JSON config to `config/normalize-config.js`.
2. `storage/db.js` replaces the imported snapshot in one transaction, preserving compatible input values, enabled states, response selections and display order.
3. `background/runtime-config.js` loads enabled configs and saved inputs, then prepares runtime rules through `config/runtime-rule.js`.
4. The service worker sends the runtime snapshot to `content/bridge.js`, which publishes it to the page's main world.
5. `content/interceptor-main.js` matches requests, substitutes path/query variables, selects routed responses and returns mocks through fetch/XHR.

## Boundaries

Config processing is independent of the UI. The popup entry module owns interaction state and persistence actions; rendering modules report those actions through callbacks. Input draft and collapse preferences remain local to the extension UI.

The database module keeps snapshot replacement and preservation of local state together because they must be atomic. Moving files does not change the IndexedDB name, schema version, config format or local storage keys.

The content scripts remain standalone classic scripts, as declared in the manifest. They do not import the extension's JavaScript modules. The bridge runs in the isolated world; the interceptor runs in the page's main world.

The response viewer reads the last synced snapshot from IndexedDB. Its rule and response selection lives in the page URL, not in the database; browsing variants never changes the response used for interception. Bodies and headers retain template placeholders. Reloading the snapshot reads saved data again but does not synchronize the config folder.

The viewer remembers the rule navigation width in pixels under the localStorage key `response-viewer-sidebar-width`. The saved preference is constrained by the available window width without being overwritten on window resize.
