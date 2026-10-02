# Breaking changes

## 2.0.0

Input templates now use `$[[id]]` instead of `${id}` to avoid conflicts with JavaScript template literals and other embedded scripts.

- Replace intentional input references `${id}` with `$[[id]]`.
- Use `$$[[id]]` to produce the literal text `$[[id]]`.
- Replace old escaped references `$${id}` with `${id}` to preserve their previous literal output, or with `$$[[id]]` for a literal new-style placeholder.
- `${...}` and `$${...}` are now ordinary text and are never substituted.
- Whole-value substitutions still preserve the input's type; substitutions within strings still produce text.

Existing config files and imported snapshots are not migrated automatically. After upgrading, update the config files and synchronize the folder again. Input IDs and locally saved values do not need to change.

## 1.0.0

Version 1.0 introduces a new rule schema:

- `response` accepts one response object and no longer accepts an array.
- Multiple responses use the `responses` field.
- Every item in `responses` requires a stable, unique `id` within its rule.
- Manual response selection is stored by response ID instead of array index.
- Automatic response routing can be configured with `routes`.

Old config syntax and previously imported snapshots are not migrated. After upgrading, update the config files and synchronize the folder again.
