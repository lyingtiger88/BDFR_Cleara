# Cleara

**Cleara** is a privacy-first digital-footprint cleanup utility. The About screen identifies the project as **BDFR Cleara**.

## v0.2 local test build

Available connectors:
- GitHub: token validation, Gist scan/filter/preview/delete.
- X / Twitter: OAuth 2.0 Authorization Code + PKCE, authenticated-user discovery, paginated own-post scan, filters, preview, refresh tokens and explicit-confirmation deletion.

Planned: Reddit and Telegram.

## Run

Requires Node.js 18+.

```bash
npm test
npm start
```

Open `http://127.0.0.1:4177`.

## X setup

1. Create/configure an App in the X Developer Console and enable OAuth 2.0 user authentication.
2. Register this exact callback URL: `http://127.0.0.1:4177/api/x/callback`.
3. Use scopes: `tweet.read tweet.write users.read offline.access`.
4. Paste the OAuth 2.0 Client ID into Cleara. Client Secret is optional for public PKCE clients; enter it only when your X app is configured as a confidential client.
5. Click **Connect X**, approve access, then scan and preview posts.

X API access/usage may require an eligible X developer account and billing/credits depending on X's current plan rules.

## Safety / privacy model

- Cleara never asks for an X password.
- X OAuth tokens are kept only in the local Node process memory in v0.2 and are cleared when Cleara exits.
- Browser `sessionStorage` stores only Cleara's random local connection ID, not the X access/refresh token.
- Delete defaults to preview/selection and requires typing `DELETE`.
- API failures are recorded per selected item; rate-limit errors surface the reset timestamp when X provides it.

## Local-test boundary

Automated tests mock X network responses and verify request construction, PKCE, token refresh, pagination, mapping, deletion and local server safety. A live X account test additionally requires your own X Client ID (and Client Secret only if applicable) plus current X API access.
