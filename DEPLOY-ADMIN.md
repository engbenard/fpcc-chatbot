# FPCC Officer Dashboard Deployment

Upload/replace these files in the GitHub repository:

- `db.mjs` — replace existing
- `server.mjs` — replace existing
- `admin.html` — add new file

Keep the existing:
- `bot.mjs`
- `index.html`
- `package.json`
- `.env.example`
- `.gitignore`

## Render environment variables

Add two new secrets:

```text
ADMIN_USERNAME=<choose an officer username>
ADMIN_PASSWORD=<choose a long unique password>
```

Keep:
```text
DATABASE_URL=<Neon connection string>
HOST=0.0.0.0
ENABLE_DEMO=true
```

Do not commit the username/password to GitHub.

## Dashboard

After Render redeploys successfully:

```text
https://YOUR-SERVICE.onrender.com/admin
```

The browser will request the officer username/password.

## Features

- Central report list from Neon
- Search and filters
- Total/submitted/in-progress/resolved/overdue statistics
- Department assignment
- Officer assignment
- Priority update
- Status update
- Resolution/follow-up notes
- Automatic resolved timestamp
- CSV export
