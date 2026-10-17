<div align="center">
  <img src="public/wordmark.svg" alt="AetherComms" width="560" />

  <p><strong>Conversations have a new address.</strong></p>
  <p>Messaging, communities, and voice in one modern communication workspace.</p>

  [Explore the code](https://github.com/theworker02/aethercomms) · [Report an issue](https://github.com/theworker02/aethercomms/issues)
</div>

---

## Meet AetherComms

AetherComms brings the conversations you care about into one beautifully simple interface. Join a community, message a friend, or start a voice call — without special receivers, radio equipment, or hardware beyond your everyday device.

Instead of browsing websites, move between conversations with addresses like `comms://channel/general` or `comms://peer/alex` in the **app's own address bar**.

### What you can do

- **Message in real time.** Keep up with people and conversations across channels.
- **Talk privately.** Send browser-encrypted direct messages between supported single-device identities.
- **Call with your voice.** Make one-to-one browser-based audio calls with WebRTC.
- **Discover your space.** Explore channels, see online presence, and navigate with familiar addresses.
- **Move between screens.** Use the responsive interface on desktop and mobile browsers.

## Preview the project

AetherComms is currently **in development**; there is no verified public deployment link yet. The README will link to the live app after its frontend and messaging backend are deployed and tested together.

### Run it locally

You'll need Node.js 20.19 or newer.

```bash
git clone https://github.com/theworker02/aethercomms.git
cd aethercomms
npm install
npm run dev:all
```

Open [http://localhost:5173](http://localhost:5173) and create an account. To test conversations, sign into a second account using a different browser or browser profile.

## Built for connection

| | |
| --- | --- |
| **Interface** | React, TypeScript, Vite |
| **Messaging** | Node.js and WebSockets |
| **Voice** | WebRTC |
| **Private messages** | ECDH P-256 and AES-GCM in the browser |
| **Brand** | [Official logo](public/logo.svg) · [Wordmark](public/wordmark.svg) |

**Security note:** This is an early-stage project, not an audited secure messenger. Public channels are not end-to-end encrypted. Direct-message keys are tied to local browser storage and aren't verified independently; losing storage may make older messages unreadable. Audio calls may require TURN connectivity on restricted networks. Do not rely on this release for sensitive communications.

## For developers

Want to contribute or self-host? See the [deployment guide](docs/DEPLOYMENT.md), explore the source, or [open an issue](https://github.com/theworker02/aethercomms/issues). You can run checks with `npm test` and `npm run build`.

---

<div align="center">
  <sub>AetherComms · Made for the way we connect.</sub>
</div>
