# Survey & Reporting Platform

A web-based survey and reporting system for committee decision-making. Administrators create surveys, participants join and submit their responses, and the results appear on a dashboard with charts and archived reports. It is in live use by an investment committee.

**Live demo:** [investment-poll.vercel.app](https://investment-poll.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-App_Router-black) ![TypeScript](https://img.shields.io/badge/TypeScript-blue) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E) ![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black)

---

## Features

- **Admin panel:** create and manage surveys and their questions.
- **Participant flow:** join a survey, select options and submit responses.
- **Results dashboard:** live charts built with Recharts.
- **Report archive:** each survey gets its own report page (`/reports/[id]`), so historical results are kept.
- **PDF export:** download reports as PDF.
- **Input validation:** checks responses before they are saved.
- **Asset categories:** surveys can cover several investment asset categories.
- **Paginated responses** and a **connection-status warning** for unstable networks.
- **Persian (RTL) interface** with Persian digit formatting.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), React |
| Language | TypeScript |
| Database & backend | Supabase (PostgreSQL) |
| Charts | Recharts |
| Hosting & CI/CD | Vercel, with automatic deploys from `main` |

## Project Structure

```
app/
├── admin/          # Admin panel (survey list)
│   └── new/        # Create a new survey
├── dashboard/      # Live results dashboard
├── join/           # Participant entry
│   └── select/     # Option selection
├── questions/      # Survey questions
├── reports/        # Report archive
│   └── [id]/       # Single report page (with PDF export)
├── lib/
│   ├── supabase.js     # Supabase client
│   ├── chartColors.ts  # Chart color palette
│   └── format.ts       # Number and Persian-digit formatting
├── layout.tsx
└── page.tsx
```

## Getting Started

```bash
git clone https://github.com/fatemehajihashemi/investment-poll.git
cd investment-poll
npm install
```

Create a `.env.local` file with your Supabase project credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notable Fixes

- Fixed PDF rendering errors in exported reports.
- Fixed a shared-state bug that changed chart colors across different reports.

## Author

**Fatemeh Hajihashemi** — designed, built and maintains this project.
[LinkedIn](https://www.linkedin.com/in/fatemeh-hajihashemi) · [GitHub](https://github.com/fatemehajihashemi)