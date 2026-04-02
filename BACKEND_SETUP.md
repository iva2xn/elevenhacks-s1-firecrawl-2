# Cloudflare Backend Setup Guide ⛅️

Follow these steps to initialize and replicate the **Aero Co-Pilot** backend on Cloudflare.

---

## 1. D1 Database Setup (Persistence)

### Create the Database
First, create your D1 database instance:
```bash
npx wrangler d1 create aero-pins-db
```
*Take note of the `database_id` returned in the terminal.*

```bash
npx wrangler d1 execute aero-pins-db --command "CREATE TABLE pins (id TEXT PRIMARY KEY, longitude REAL, latitude REAL, type TEXT, text TEXT, author TEXT, timestamp INTEGER, audio_id TEXT)" --remote
```

### Update Existing Database (Migration)
If you already have a database, run this to add image support:
```bash
npx wrangler d1 execute aero-pins-db --command "ALTER TABLE pins ADD COLUMN images TEXT" --remote
```

---

## 2. R2 Object Storage Setup (Voice Clips)

### Enable R2
Before running terminal commands, you **must** enable R2 in your Cloudflare dashboard:
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) 
2. Click **R2** in the sidebar.
3. Click **"Enable R2"**.

Once enabled, create the buckets for the files:
```bash
npx wrangler r2 bucket create aero-audio-clips
npx wrangler r2 bucket create aero-images
```

---

## 3. Wrangler Configuration (`wrangler.toml`)

Ensure your `worker/wrangler.toml` file includes the following bindings. Replace the `database_id` with yours from Step 1.

```toml
name = "aero-copilot-backend"
main = "src/index.ts"
compatibility_date = "2024-03-31"

[[d1_databases]]
binding = "DB"
database_name = "aero-pins-db"
database_id = "PASTE_YOUR_DATABASE_ID_HERE"

[ai]
binding = "AI"

[[r2_buckets]]
binding = "FILES"
bucket_name = "aero-audio-clips"
```

---

## 4. Final Deployment

Deploy your worker to link the new storage and database:
```bash
cd worker && npx wrangler deploy
```

---

## 🧪 Verification Commands

To check if your database schema is correct:
```bash
npx wrangler d1 execute aero-pins-db --command "PRAGMA table_info(pins)" --remote
```

To list all files in your audio storage:
```bash
npx wrangler r2 object list aero-audio-clips
```
