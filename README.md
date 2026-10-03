# Cleara

**Cleara** is a privacy-first digital footprint cleanup utility. The About screen identifies the project as **BDFR Cleara**.

## v0.1 test build

The current MVP includes:
- local dashboard and connector catalog
- live GitHub authentication using a user-supplied token
- scan + filter + preview for authenticated-user gists
- explicit destructive-action confirmation before deletion
- token kept in browser memory only; Cleara does not persist it to disk
- connector-ready architecture for Reddit, Telegram and X
- zero third-party runtime dependencies

## Run

Requires Node.js 18+.

```bash
npm test
npm start
```

Open `http://127.0.0.1:4177`.

## GitHub token

For deletion, the token must have permission to write Gists. Prefer a narrowly scoped token and revoke it when testing is finished.

## Safety model

Cleara defaults to preview. Destructive actions require explicit selection plus typing `DELETE`.

## Roadmap

- v0.1: GitHub Gists connector + core UI
- v0.2: Reddit OAuth connector, archive/export, job history
- v0.3: Telegram user-session connector where permitted, secure credential vault
- later: X and additional services, packaged desktop shell
