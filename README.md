# Chrome Request Mocker

Chrome extension for mocking `fetch` and XHR requests using local JSON files.

Configs stay on your device, so you can edit them in your IDE, keep them in Git, or ask a coding agent to modify them.

> 100% vibe-coded. Bugs are guaranteed.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extension directory.
5. Open the extension settings and select a folder with your mock configs.
6. Click **Sync from folder**.
7. Enable the configs and rules you need in the popup.
8. Reload your application.

## Config file example

```json
{
  "id": "demo",
  "name": "Demo API",
  "rules": [
    {
      "id": "current-user",
      "name": "Current user",
      "pattern": "**/api/users/me",
      "methods": ["GET"],
      "delay": 500,
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "id": 42,
          "name": "Test User"
        }
      }
    }
  ]
}
```

A matching request is intercepted and the configured response is returned without contacting the server.

You can configure:

- URL pattern
- HTTP methods
- delay
- status and status text
- headers
- response body

Multiple config files and individual rules can be enabled or disabled from the extension popup.

After changing config files, click **Sync** in the popup and reload the page. Use Settings to choose the folder initially or change it later.

## URL patterns

`*` matches characters inside one path segment.

`**` can also match `/`.

Example:

```text
**/api/projects/*/items/*
```

Query parameters and hash are ignored when matching.

## Documentation

- [Configuration reference](docs/configuration.md)
- [Limitations and troubleshooting](docs/limitations.md)
