## ATS App (Next.js + Tailwind + PostgreSQL)

This is a minimal full-stack Applicant Tracking System scaffold built with:

- **Next.js (App Router)**
- **Tailwind CSS**
- **PostgreSQL** using **node-postgres (`pg`)**

### Structure

- `app/` – App Router pages and API routes
  - `app/page.tsx` – main dashboard
  - `app/api/jobs/route.ts` – backend routes for jobs
- `components/` – shared UI components (e.g. `JobList`)
- `lib/db.js` – node-postgres connection pool using `DATABASE_URL`
- `api/` – placeholder for additional backend utilities or services

### Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
DB_SSL=false
```

### Getting Started

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
