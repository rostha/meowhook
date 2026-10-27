# Contributing to Meowhook

Use Node.js 22.16 or newer (CI uses Node.js 24), then run `npm ci` and `npm run dev`.
The anonymous editor works without credentials. For account and bot features, copy
`.env.example` to `.env.local` and configure your own services as described in the README.

Before submitting changes, run:

```sh
npm run release:check
npm run lint
npm test
npm run build
```

Keep changes focused and describe their behavior and validation in the pull request.
Preserve existing copyright and dependency notices. Contributions are provided under
the project's Apache-2.0 license.

Do not include webhook URLs, bot tokens, OAuth secrets, database URLs with credentials,
local databases, account/session data, uploads, browser storage exports, or private
screenshots in issues or pull requests. Use synthetic examples in tests.

Development logs, assistant notes, local state, and release output are deliberately
ignored. If a credential is committed accidentally, revoke it and notify the maintainer
privately; deleting it from the latest version does not remove it from Git history.
