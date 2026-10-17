<div align="center">
<img src="public/wordmark.svg" alt="AetherComms logo" width="620" />

**The communication browser for conversations, communities, and voice.**

![Version](https://img.shields.io/badge/version-1.3.0-31d3a3?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Node.js-58cfda?style=flat-square)
![Status](https://img.shields.io/badge/status-development-f3c979?style=flat-square)

[Get started](#quick-start) · [Architecture](#architecture) · [Security](#security-model) · [Roadmap](#roadmap)
</div>

---

## Connection has a new address.

AetherComms is a messaging-first communication browser. Instead of navigating websites, you navigate conversations using familiar, human-readable addresses:

| Address | Destination |
| --- | --- |
| \`comms://channel/general\` | Community channel |
| \`comms://mesh/general\` | Alias to channel |
| \`comms://peer/alex\` | Encrypted direct message |
| \`comms://call/alex\` | Browser-to-browser audio call |

No SDR, LoRa receiver, or other dedicated hardware is needed. It runs on a laptop or phone with a supported browser and microphone.

### Included in v1.3.0

- Responsive React + TypeScript messaging interface, conversation sidebar, global URI address bar, composable chat workspace.
- Node.js WebSocket server with persistent accounts, password hashing, sessions, chat history, real-time events, and presence.
- Public community channels and direct conversations.
- Browser-side ECDH P-256 / AES-GCM encryption for direct messages; private keys created as **non-extractable** Web Crypto keys and saved in IndexedDB.
- One-to-one voice calling with WebRTC offer/answer and ICE signaling over the server, with native WebRTC encrypted media.
- An original vector brand system, product artwork, promotional audio and a launch storyboard.

### Quick start

Requirements: Node.js >= 20.19.

\`\`\`bash
git clone https://github.com/theworker02/aethercomms.git
cd aethercomms
npm install
npm run dev:all
\`\`\`

Then open **http://localhost:5173**. Register two users in different browsers or profiles, navigate to \`comms://peer/<other_handle>\`, and exchange encrypted messages or start a voice call.

Commands: \`npm run dev\` (frontend), \`npm run dev:server\` (API), \`npm run dev:all\` (both), \`npm test\`, \`npm run build\`, \`npm start\`.

### Architecture

\`\`\`text
React / Vite browser SPA
 ├── comms:// route parser
 ├── channels, people, messaging workspace
 ├── Web Crypto (non-exportable private ECDH key in IndexedDB)
 └── WebRTC voice / microphone
             │ REST / WebSocket
             ▼
Node.js HTTP + ws signaling API
 ├── account registration, scrypt password hashes
 ├── opaque bearer sessions (SHA-256 server storage)
 ├── real-time message fan-out and online presence
 ├── offer/answer/ICE delivery (WebRTC signaling only)
 └── JSON file persistence (development baseline)
\`\`\`

### Configuration

| Variable | Used by | Description |
| --- | --- | --- |
| \`PORT\` | API | Default \`8787\` |
| \`DATA_FILE\` | API | Persistent JSON file path, default \`.data/aethercomms.json\` |
| \`APP_ORIGINS\` | API | Comma-separated browser origins allowed by CORS and WebSocket |
| \`VITE_API_URL\` | SPA | HTTPS backend URL for separate hosting; empty for local Vite proxy |

For local development no environment values are needed.

### Deployment

**Static frontend:** Netlify (build \`npm run build\`, publish \`dist\`, set \`VITE_API_URL=https://your-api.example\`). The SPA must use HTTPS to access microphone/media features.

**WebSocket backend:** Deploy Node to a persistent Node host (Railway, Render, Fly.io, or VPS) with a mounted persistent volume for \`DATA_FILE\`. Set \`APP_ORIGINS\` to your frontend's exact HTTPS origin. This is **not** a Netlify-functions-only backend; it needs a long-lived WebSocket process.

**WebRTC:** Public STUN is configured in the client. Corporate networks and many mobile carrier NATs need **TURN**; configure a TURN service before production calls. STUN alone does not guarantee connectivity.

### Security model

| Surface | What is true today | Caveat |
| --- | --- | --- |
| Direct messages | ECDH P-256 derived AES-GCM key, random IV; server stores ciphertext | No Double Ratchet, forward secrecy, safety-number verification, or external audit |
| Channels | Stored as readable text on the backend | **Not end-to-end encrypted** |
| Voice | WebRTC encrypts media in transit (DTLS-SRTP) | Not an audited end-to-end voice system; TURN may be necessary |
| Accounts | Scrypt salted password hashes; opaque token sessions | No recovery flow, MFA, or device management |
| Private keys | Non-extractable key in browser IndexedDB | Keys are device/browser specific; losing browser storage loses the ability to decrypt past DMs |
| Storage | Atomic JSON-file writes | Replace with transactional database and multi-instance pub/sub before scaling |
| Threat prevention | Origin allowlist, capped payloads, basic auth rate limit | Harden against spam, abuse, replay, account enumeration and DoS before production |

**Do not market the current release as audited, zero-knowledge, fully decentralized, or production-secure.** Initial peer keys are served by the backend and are not independently authenticated; device enrollment and identity verification need additional work.

### Known limitations

- A newly signed-in second browser creates a different local identity. Existing ciphertext may not decrypt and other users still encrypt to the original registered key. Account-level multi-device key management has not been implemented.
- No push notifications, message search index, attachments, group voice, message edits, or moderation dashboard yet.
- Voice calls are one-to-one, require browser microphone consent, and are not guaranteed without TURN.
- Initial channels are public to all authenticated users.
- Artwork generated with ElevenLabs is creative direction; screens shown in promotional renders should not be interpreted as verified screenshots or shipped functionality.

### Roadmap

1. Production PostgreSQL + Redis pub/sub, observability, backups and abuse protection.
2. Verified device enrollment, safety numbers, secure key backup, ratcheting and independent cryptographic review.
3. TURN provisioning, call ringing/reconnect, media device controls, mobile optimizations and audio quality telemetry.
4. Encrypted attachments, media previews, group messaging, notifications, and searchable channels.

### Brand and commercial

- Official **source-of-truth vector logo**: [public/logo.svg](public/logo.svg)
- Wordmark and README masthead: [public/wordmark.svg](public/wordmark.svg)
- [Launch campaign script and storyboard](brand/launch-campaign.md)
- ElevenLabs creative campaign: https://elevenlabs.io/app/flows/UL5PwFmdsQDI7Fw9bafQ

**Brand palette:** Navy \`#0B0F19\`, cyan \`#60E6D6\`, emerald \`#31D3A3\`, text \`#F0F8FF\`. Typography: modern humanist sans-serif with monospace for protocol labels.

### Development & contribution

Contributions, issues and security fixes are welcome via GitHub. Avoid posting unpatched vulnerabilities in public issues; ask a maintainer for a private disclosure route. This is a development-stage project and does not yet offer a formal security bounty or production SLA.

Copyright 2026 AetherComms contributors. No license grant is implied until a LICENSE file is added.
