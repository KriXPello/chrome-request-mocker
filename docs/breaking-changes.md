# Breaking changes

## 1.0.0

Version 1.0 introduces a new rule schema:

- `response` accepts one response object and no longer accepts an array.
- Multiple responses use the `responses` field.
- Every item in `responses` requires a stable, unique `id` within its rule.
- Manual response selection is stored by response ID instead of array index.
- Automatic response routing can be configured with `routes`.

Old config syntax and previously imported snapshots are not migrated. After upgrading, update the config files and synchronize the folder again.
