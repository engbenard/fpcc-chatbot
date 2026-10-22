# Fort Portal City Council WhatsApp chatbot prototype

A working local test chatbot and Meta WhatsApp Cloud API adapter. No council affiliation or integration is implied. No external packages are needed.

## Run

Install Node.js 22 or newer. Open a terminal in this folder:

```powershell
npm start
```

Open http://127.0.0.1:3000. Keep the tab open while testing: refreshing starts a new demo identity. Run `npm test` for the conversation checks. Stop the server with Ctrl+C.

Try: **2 → yes → Central road → An overflowing waste bin near the market**. Copy the returned reference, then choose **3** to look it up. Reports are saved in `data/store.json` and survive server restarts. Demo browser identity does not survive a page refresh; WhatsApp identity uses the sender's number.

## What works

- Menu and council service topic discovery
- Consent, location, description, reference generation and local report storage
- Report lookup limited to the submitting conversation
- Staff assistance requests saved using the same report flow
- WhatsApp verification handshake, request signature validation, inbound text handling, and outbound replies

Fees, contact details, office hours and service requirements are intentionally unconfigured. Edit `bot.mjs` when the council provides approved content. Staff requests are not forwarded to officers. This version has no staff dashboard, payments or council case-management connection.

## Connect WhatsApp later

1. Create a Meta developer business app and add WhatsApp. Use the test number and approved test recipients supplied by Meta to begin.
2. Copy `.env.example` to `.env`. Fill in the access token, phone number ID, app secret, your own random verification token, and a currently supported Graph API version from your Meta dashboard. Never share or commit `.env`.
3. Host this app behind an HTTPS endpoint reachable by Meta. Set `HOST=0.0.0.0` if required by the host and set `ENABLE_DEMO=false` before exposing it publicly. Restart after changing settings.
4. Configure `https://YOUR-HOST/webhook` as the callback URL and enter the matching verification token. Subscribe to WhatsApp `messages` events and connect the correct WhatsApp Business Account.
5. Send MENU from an approved test recipient and verify the full report flow. Actual WhatsApp delivery requires your Meta account and credentials and has not been tested here.

References: [Meta webhook verification](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) and [Meta webhook payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).

## Operating limits

This is a single-process prototype. It uses a local JSON store, a serialized webhook queue, and bounded message deduplication. Run only one instance. There is no durable job queue: network ambiguity or a crash between sending a WhatsApp reply and saving can cause a duplicate reply. Move to a transactional database and durable queue before production. The local demo is intended for trusted local use and must be disabled on a public host.

Define council ownership, officer routing, privacy notice, access controls, retention/deletion, backups, monitoring and verified service content before public launch. Anyone with filesystem access can read the report store. The prototype explicitly tells users that reports are not delivered to the council.
