# Fort Portal City Council — City Connect v2

A citizen portal, staff complaint workspace and WhatsApp chatbot adapter. Node.js 22+; no npm dependencies. This is a local pilot, not an official council deployment.

## Install or upgrade

1. Back up your existing chatbot folder, especially `data/` and `.env`.
2. Stop the old server with Ctrl+C.
3. Extract this export and copy its application files into your existing chatbot folder. Keep your existing `data/` folder and `.env`. Neither is included in the ZIP.
4. Open a terminal in that folder and run `npm start`.
5. Open http://127.0.0.1:3000 and refresh the browser (Ctrl+F5).

Existing complaint records are retained. On first migration, older records receive departments, statuses and pilot deadlines. A `data/store-before-v2-*.json` backup is created before migration. Old browser demo identities from version 1 cannot be recovered by a new browser cookie, but their records remain available to staff. New browser identities persist for 30 days across refreshes and server restarts. Clearing cookies loses browser access to those records; WhatsApp reports remain linked to their original sender.

## Staff login

Choose **Staff workspace** in the sidebar. On first startup, the server creates a random password in `data/initial-staff-password.txt`. Open that file locally to read the password. Do not distribute it with the exported app.

Alternatively copy `.env.example` to `.env` and set `STAFF_PASSWORD` to your own value of at least 12 characters, then restart. Staff sessions last eight hours and are invalidated at restart. This pilot uses one shared staff password; it does not implement separate officer/supervisor accounts, role-based permissions or individual audit identities. Case history records staff actions under the shared Staff identity.

## Ten connected features

| Feature | Where and how it works |
| --- | --- |
| Staff dashboard | Staff workspace shows the same records created by the browser and WhatsApp chatbot. Search and filter by department or status, assign an officer, add internal notes, and record resolutions. |
| Complaint routing | Keyword rules assign departments on submission. Staff can reassign a case. Configure rules in Service administration; first matching rule wins, with Communications as fallback. Department names and initial rules are proposed pilot defaults. |
| Reference and status lookup | Every complaint gets an FP reference. My complaints and chatbot option 3 enforce the original browser/sender identity. Citizen results omit internal notes, sender identifiers and duplicate candidates. |
| Overdue alerts | Supervisor alerts shows overdue open cases. Staff and alert screens poll every 30 seconds while open. Default target is 72 elapsed hours, a configurable pilot setting rather than an approved council SLA. Existing deadlines stay unchanged when the default changes. No email/SMS/WhatsApp alert delivery is configured. |
| Satisfaction surveys | Resolving a case enables a 1–5 rating and optional comment in My complaints. The WhatsApp status response invites the citizen to option 8. One response per case; only the original owner can respond. No proactive WhatsApp template message is sent. |
| Duplicate detection | Matching normalized locations and similar description words within 30 days produce suggestions visible only to staff. Staff can link a duplicate to another reference. No complaint is automatically merged, deleted, or suppressed. |
| Problem map and hotspots | Private staff map plots supplied latitude/longitude. Roughly 1 km grid cells group recurring locations. No automatic geocoding or invented positions. Leaflet/OpenStreetMap require internet; coordinate lists remain usable if the map cannot load. |
| Public dashboard | Aggregate status and department counts plus overall satisfaction; no complaint descriptions, sender identifiers, case references or precise locations. No small-group suppression or formal statistical disclosure control is implemented. |
| Appointment booking | Staff publish future office slots with location and capacity. Citizens book/cancel in the portal, or book via chatbot option 7. Capacity and duplicate bookings are checked on the server. Staff can complete/cancel bookings. All displayed times use Africa/Kampala. |
| Citizen service directory | Staff edit requirements, fees, office locations and hours. Drafts stay private until staff explicitly publish. Published entries appear in the directory and chatbot option 1. Initial entries are unapproved placeholders. |

## Suggested acceptance test

1. In Report a problem submit a waste complaint with a public landmark and optional coordinates.
2. Keep its reference. In the same browser, open My complaints.
3. Sign in as staff: confirm automatic Environment & sanitation routing; assign an officer and update the case to In progress.
4. Submit a second complaint with the same location and similar wording; inspect the duplicate suggestion in staff case details.
5. Resolve the first case with a resolution summary. Return to My complaints and submit the satisfaction survey.
6. In Service administration publish approved service information and a future appointment slot. Check the citizen directory, book the slot, and inspect it in the staff Appointments tab.
7. Open Problems & hotspots to inspect coordinate reports. Public statistics shows aggregate counts only.

For overdue testing, use an isolated test data store and a deliberately past dueAt timestamp. Do not change live case deadlines merely to demonstrate an alert. Run `npm test` for the isolated workflow checks; test records are not inserted into the main data store.

## LAN deployment

Use a dedicated server and reserved LAN address. Set `HOST=0.0.0.0` in `.env` and allow TCP 3000 only from the intended LAN for testing. Browse to `http://SERVER-LAN-IP:3000`.

For public access use HTTPS through a reverse proxy, set `PUBLIC_HTTPS=true`, keep Node bound to `127.0.0.1` when the proxy is on the same machine, and forward the hostname in the proxy Host header. Browser mutation requests check Origin against this hostname. Set `ENABLE_DEMO=false` to disable browser chatbot conversation testing; the citizen portal and its submission/booking tools remain available. Do not expose the staff workspace publicly without deployment hardening and an appropriate authentication system. The prior webhook-only proxy configuration does not publish the new portal: explicitly configure the portal routes if required.

No IFMS integration is included. Use approved internal APIs and network isolation for any later council-system connection.

## WhatsApp connection

The API adapter is retained. Existing WhatsApp Business app numbers require the appropriate supported onboarding/coexistence path; this app does not perform that onboarding. Fill in `.env` with the authorized Meta access token, phone number ID, app secret, current supported Graph API version and a random webhook verification token. Never substitute the phone number itself for the phone number ID.

Register `https://YOUR-HOST/webhook`, subscribe to messages and the correct WhatsApp Business Account, and test with an authorized number. Webhook signatures are validated. Shared WhatsApp location messages are accepted when the chatbot is asking for the complaint location. Alternatively enter `latitude,longitude | public landmark`. Incoming text supports service lookup, complaints, tracking, booking and survey flows. WhatsApp delivery has not been tested without your credentials.

[Meta webhook documentation](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) · [Leaflet map documentation](https://leafletjs.com/examples/quick-start/)

## Data and operating limits

`data/store.json` stores complaint records, owner identifiers, optional coordinates, staff history, survey responses, services, routing settings, slots and appointments. Protect the folder with operating-system access controls. No automatic data retention/deletion is configured. Back up the store and define an approved privacy notice before resident use.

Run one Node process only. Requests are serialized and the JSON store is written through a temporary file. This is not a multi-server database or durable messaging queue. A crash or ambiguous Meta response can duplicate a WhatsApp reply. External alert delivery, proactive survey messages, human handover pauses in WhatsApp, per-officer accounts, robust anti-abuse controls, full audit attribution, and IFMS integrations need further implementation before a public production rollout. Map tiles use third-party services; review their usage policies for a production deployment.

Exported packages omit credentials, passwords, test records and saved citizen data. This folder's source is the same application you run with `npm start`.
