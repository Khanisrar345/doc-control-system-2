# Document Control System v2 — Enterprise Edition

A full-stack enterprise document management system for construction projects.
Built with Node.js · Express · MongoDB · EJS · Chart.js.

**Prepared by:** Israr Khan — Sr. Document Controller

---

## What's New in v2

- 🔐 **Secure login** — bcrypt-hashed passwords, no credentials ever shown on the login page
- 🔑 **Self-service password management** — any user can change their own password; Super Admin can reset anyone's
- 🎨 **Full branding control** — company/client/consultant/contractor/project logos, project name, project number, contract number — all editable from Settings, no code changes
- 🎨 **Theme colors** — customize primary and accent colors from the UI
- 📊 **10 KPI cards** — Total, Approved, Under Review, Active, Overdue, Revise & Resubmit, Transmittals, Submitted Today/Week, Approval Rate
- 📈 **4 chart types** on dashboard — Type volume, Status doughnut, Monthly trend, Discipline breakdown
- 🗂 **Document Type × Discipline × Status matrix** — fully dynamic, auto-detects new types/disciplines/statuses from your data with zero code changes
- 🖨 **Professional print/PDF** — clean print header with logos and project info, print footer with "Prepared By", portrait/landscape/page-size options
- 📱 **Fully responsive** — works on desktop, tablet, and mobile with a collapsible sidebar
- 👥 **5 role types** — Super Admin, Admin, Document Controller, Reviewer, Viewer (+ Contractor)
- 🏷️ **Priority field** — Low/Normal/High/Critical on every document

---

## Quick Start (Local)

```bash
cd doc-control-system
npm install
export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/dcs?retryWrites=true&w=majority"
npm start
```

Open http://localhost:3000

### First Login

On first run, a Super Admin account is created automatically. **Check your server console/logs** for the one-time credentials — they are never displayed in the browser or written to any file, only printed once to the server console:

```
✅ Super Admin created — login: admin@dcs.com / Admin@2025
```

**Change this password immediately** after your first login via Settings → Change Password.

---

## Deploy to Render.com

1. Push this project to GitHub
2. Render.com → New → Web Service → connect your repo
3. Build command: `npm install` · Start command: `node server.js`
4. Add environment variable: `MONGODB_URI` = your MongoDB Atlas connection string
5. Deploy

Check the Render **Logs** tab after first deploy to find your Super Admin credentials (printed once).

---

## User Roles

| Role | Access |
|---|---|
| **Super Admin** | Everything — including changing their own login email/username, and managing all other users |
| **Admin** | Manage users, register, transmittals, reports, settings |
| **Document Controller** | Add/edit documents, transmittals, revisions, reports |
| **Reviewer** | View register, reports (read-only) |
| **Viewer** | Read-only register access |
| **Contractor** | Sees only their own submissions (matched by company name), can apply leave, send feedback |

---

## Security Notes

- All passwords are hashed with **bcrypt** (10 salt rounds) — never stored in plain text
- Login page **never displays** default credentials or hints
- Sessions expire after 8 hours of inactivity
- Password changes force re-login (session destroyed)
- Only Super Admin can change their own login identifier (email/username)
- Only Admin/Super Admin can reset other users' passwords

**For production**, also consider:
- Setting a custom `SESSION_SECRET` environment variable
- Enabling MongoDB Atlas IP allow-listing instead of `0.0.0.0/0`
- Adding rate-limiting on `/login` to prevent brute-force attempts

---

## Branding & Customization

Go to **Settings** (sidebar → Settings) as Admin or Super Admin:

- **Project Info tab** — project name, project/contract numbers, company/client/consultant/contractor names, "Prepared By" text for reports
- **Logos tab** — upload up to 5 logos (Company, Client, Consultant, Contractor, Project) — click any box to upload
- **Theme Colors tab** — pick your own primary and accent colors
- **Change Password tab** — every user can change their own password here
- **Change Login tab** (Super Admin only) — change your own login email or username

All stored in MongoDB — no code editing required, ever.

---

## Dynamic Data Engine

The system **never hardcodes** document types, disciplines, statuses, contractors, or areas. Every dropdown, filter, chart, and the Type × Discipline × Status matrix is built live from whatever values exist in your `Document` collection.

If you add a new document type like `"Vendor Data"` or a new status like `"Approved with Comments"` through the Add Document form (or via JSON import), it automatically appears in all filters, charts, and the matrix tables — no code changes needed.

---

## Importing Your Document Register

1. Log in as Admin, Super Admin, or Document Controller
2. Dashboard → **📥 Import Document Register** card
3. Choose your `.json` file → **Import**
4. Idempotent (upserts by `doc_number`) — safe to re-run anytime

---

## File Structure

```
doc-control-system/
├── server.js          ← Backend: models, auth, routes, business logic
├── package.json
├── views/
│   ├── login.ejs       ← Secure login page
│   └── app.ejs         ← Full application (all pages, single template)
├── public/
│   └── uploads/        ← Attachments & logos (ephemeral on Render free tier)
└── README.md
```

---

## Production Notes

- `/public/uploads/` is ephemeral on Render's free tier. For production, integrate Cloudinary or AWS S3 (see comment above multer config in `server.js`).
- Sessions are in-memory by default; add `connect-mongo` (already listed in package.json) as the session store for multi-instance deployments.
- "Forgot Password" is architecture-ready but not yet wired to email — Admin/Super Admin resets passwords manually via Manage Users.

---

## Document Fields

| Field | Description |
|---|---|
| doc_number | Auto-generated or manual, e.g. WIR-CIVIL-001 |
| type | Any value (dynamic) |
| title | Full document title |
| rev | Revision e.g. A, B, 0, 1 |
| status | Any value (dynamic) |
| discipline | Any value (dynamic) |
| area / zone / package | Location/grouping |
| contractor / consultant | Submitting/reviewing parties |
| submitted_by / reviewer / approver | People involved |
| priority | Low / Normal / High / Critical |
| issue_date / due_date / response_date | Key dates |
| days_open | Auto-calculated |
| remarks | Free text |
| attachments | Uploaded files |

---

*© 2025 Document Control System · Prepared by Israr Khan — Sr. Document Controller*
