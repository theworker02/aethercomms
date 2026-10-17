# Deploying AetherComms

This guide is for maintainers. The public README intentionally keeps setup instructions brief.

## Architecture

AetherComms has **two services**:

1. **Frontend:** React/Vite static assets, served from Netlify.
2. **Backend:** A persistent Node.js HTTP and WebSocket service with account and message storage. Netlify Functions cannot replace this long-running WebSocket process.

Do not announce a public launch until both are running and have been tested together.

## 1. Deploy the backend

Use a Node host that supports persistent WebSocket connections and durable storage (for example Railway, Render, or a VPS). The service starts with `npm start`; its entry point is `server/index.mjs`.

Set these backend environment variables:

| Variable | Value |
| --- | --- |
| `PORT` | Host-provided listening port (local default: `8787`) |
| `DATA_FILE` | Path inside a **persistent mounted volume**, e.g. `/data/aethercomms.json` |
| `APP_ORIGINS` | Exact HTTPS origin of the Netlify site, without trailing slash |

Verify `GET https://YOUR-BACKEND/api/health` returns JSON containing `"status":"ok"`. Confirm the host supports secure WebSockets (`wss://`) at `/socket`.

**Production readiness:** The current JSON-file store is a development baseline. Before opening registration publicly, migrate to transactional persistence, add backups, abuse protections, account recovery, and proper operational monitoring.

## 2. Deploy frontend to Netlify

Connect the GitHub repository `theworker02/aethercomms` to a Netlify site, with production branch `main`.

Netlify reads `netlify.toml` automatically:

- Build command: `npm run build`
- Publish directory: `dist`
- Node.js version: `22`
- Client-side route fallback: `/index.html`

Create this **build-time** environment variable in Netlify:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | Public HTTPS URL of the deployed backend, e.g. `https://api.example.com` |

This is a public client configuration, **not a secret**. It must not point to `localhost`. Trigger a fresh Netlify build whenever the API URL changes.

Update `APP_ORIGINS` on the backend to the exact Netlify production origin. Also allow intended preview origins separately if preview deployments need API access.

## 3. Smoke test

- Open the production HTTPS site in two independent browsers or browser profiles.
- Register two accounts and log in.
- Send a channel message and confirm it arrives in the other browser.
- Open `comms://peer/<other-handle>` and verify both sides can decrypt a direct message.
- Start a voice call, grant microphone permissions, and verify two-way audio.
- Reload both clients and confirm account sessions and message history persist.
- Test a direct route refresh and a mobile viewport.
- Test a restrictive network. Configure **TURN** for WebRTC when STUN alone cannot connect.

## 4. Add the public URL to the README

Only after the production site is deployed and smoke-tested, add a **Launch AetherComms** link to the top of `README.md` pointing to the confirmed HTTPS Netlify domain. Do not add a guessed `*.netlify.app` URL.

## Local development

```sh
npm install
npm run dev:all
```

Open `http://localhost:5173`. Run `npm test` and `npm run build` before release.
