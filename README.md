# 📞 Pastoral CRM

A lightweight CRM for tracking pastoral calls, follow-ups, and outreach cadences — built on Google Apps Script and Sheets.

**[Live Demo →](https://pikcalltracker.netlify.app/)**

---

## Screenshots

<img width="1918" src="https://github.com/user-attachments/assets/ac61f187-16d1-4e35-9bf0-a9d87fec23e2" />
<img width="1902" src="https://github.com/user-attachments/assets/4b13189b-3bff-40d0-a7db-fefb47b7d544" />
<img width="1900" src="https://github.com/user-attachments/assets/7a7d9d3c-6347-4f81-9973-ed56a2c64152" />
<img width="1123" src="https://github.com/user-attachments/assets/840c0f64-724f-416d-9ef0-5018638a5de2" />

---

## The Problem

Managing outreach manually means missed follow-ups, scattered notes, and no clear sense of who to call next. This system creates one workflow where nothing slips — every call is logged, every follow-up is tracked, and the next action is always obvious.

---

## Features

- Priority dashboard — callbacks, overdue, today, this week
- Call logging with outcome, notes, and next action
- Automatic follow-up and callback scheduling
- Daily and weekly email reminders
- Duplicate submission protection
- Works on any device, no Google sign-in required for users

---

## How It Works

```
User logs a call
       ↓
Apps Script processes it
       ↓
Data written to Google Sheets
       ↓
Priority logic runs:
  → Who is overdue?
  → Who needs a callback?
  → Who is due today?
       ↓
Outputs:
  → Dashboard (what to do right now)
  → Email reminders (daily + weekly)
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Backend | Google Apps Script |
| Database | Google Sheets |
| Frontend | HTML / CSS / JS |
| Email | GmailApp |
| Hosting | Netlify |

---

## Architecture

The frontend calls the Apps Script web app as a plain HTTP API — no Google auth required for end users. The server renders data directly into the HTML at page load, so it works on any phone or browser.

```
Frontend (HTML/JS)
       ↓  fetch() / server-side render
Apps Script Web App — doGet()
       ↓
Code.gs — core logic
       ↓
Google Sheets (PEOPLE · INTERACTIONS · FOLLOWUPS)
       ↓
api_getDuePeople() — transforms raw rows into priority buckets
       ↓
  → Dashboard UI
  → Email system
```

---

## Data Flow

Raw sheet data is transformed into structured priority buckets on every request:

- **callbacks** — open follow-ups waiting on a response
- **overdue** — past their due date
- **today** — due today
- **this week** — coming up soon
- **no date** — needs scheduling

This is essentially a mini data pipeline: ingest → store → process → output → schedule.

---

## Setup

### 1. Create a Google Sheet

Open a new Google Sheet and note the URL.

### 2. Open Apps Script

In the sheet: **Extensions → Apps Script**

### 3. Paste the code

Copy the contents of `Code.gs` into the editor and save.

### 4. Run setup

```javascript
setupSystem()
```

This creates four sheets with the correct headers:

| Sheet | Purpose |
|---|---|
| PEOPLE | Who you're tracking |
| INTERACTIONS | Every call logged |
| FOLLOWUPS | Open callbacks and follow-ups |
| SETTINGS | Email and schedule config |

### 5. Add people

Fill the `PEOPLE` sheet:

| PersonID | FullName | CadenceDays | Active |
|---|---|---|---|
| P001 | John Doe | 7 | TRUE |

### 6. Set your reminder email

In the `SETTINGS` sheet, set `REMINDER_EMAIL` to your email address.

### 7. Refresh statuses

```javascript
refreshDueStatuses()
```

### 8. Set up triggers

In Apps Script → Triggers, add:

| Function | Schedule |
|---|---|
| `refreshDueStatuses` | Daily |
| `sendMorningDueNowReminder` | Daily |
| `sendMondayFollowupsThisWeek` | Every Monday |

### 9. Deploy as web app

- **Execute as:** Me
- **Who has access:** Anyone
- Copy the `/exec` URL — that's what you share

---

## What Makes This an Engineering Project

- API-style design inside a serverless environment (Apps Script)
- Server-side rendering to avoid auth issues on mobile
- Duplicate submission protection via script cache
- Automated scheduling with time-based triggers
- Clean data transformation layer separating storage from presentation
- Full stack: frontend → API → data → email → scheduler


---

## Core Idea

> Clarity → Consistency → Results.

Track properly. Follow up properly. Nothing gets missed.
