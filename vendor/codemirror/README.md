# CodeMirror 5 vendor files

- Version: 5.65.21 (highest stable 5.x version in npm registry metadata at time of vendoring).
- Upstream source tarball: https://registry.npmjs.org/codemirror/-/codemirror-5.65.21.tgz
- License: MIT; see `LICENSE` from the upstream package.
- Tarball integrity (registry SHA-512): `sha512-6teYk0bA0nR3QP0ihGMoxuKzpl5W80FpnHpBJpgy66NK3cZv5b/d/HY8PnRvfSsCG1MTfr92u2WUl+wT0E40mQ==`

Copied upstream files, retaining paths and content verbatim:

- `LICENSE`
- `lib/codemirror.js`
- `lib/codemirror.css`
- `mode/javascript/javascript.js`
- `addon/fold/foldcode.js`
- `addon/fold/foldgutter.js`
- `addon/fold/foldgutter.css`
- `addon/fold/brace-fold.js`

The JavaScript mode also provides JSON highlighting. These files support the response viewer's read-only JSON display and code folding, with no build step or runtime network access.
