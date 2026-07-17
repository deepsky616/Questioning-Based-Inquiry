# Question Lab

Questioning-Based Inquiry Web App - 질문기반 탐구수업 웹앱

## Features

- 학생: 질문 작성 및 AI 분류, 질문 보기, 다른 학생 질문 탐구
- 교사: 학생 질문 통계, 유형별 분석, 질문 수정/코멘트

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: NextAuth.js v5, Prisma, Supabase Postgres
- **Email**: Resend
- **AI**: Google Gemini API

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Apply versioned migrations, including database functions and triggers
npm run db:migrate:deploy

# Check required deployment tables/enums
npm run db:check

# Revoke direct Data API access and enable RLS
npm run db:security:apply

# Verify effective database privileges and RLS
npm run db:security:check

# Run development server
npm run dev
```

## Environment Variables

```env
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1"
# migrate 명령용 직접 연결(세션 모드, 5432) — transaction 풀러(6543)로는 migrate가 실패
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
TEACHER_REGISTRATION_CODE="replace-with-at-least-12-random-characters"
GOOGLE_API_KEY="your-gemini-api-key"
RESEND_API_KEY="re_your_api_key"
RESEND_FROM_EMAIL="Question Lab <noreply@your-domain.com>"
```

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional in development. If either value is missing, the app skips email sending and keeps the main request successful.

`TEACHER_REGISTRATION_CODE` must be at least 12 characters. Public teacher registration is denied when it is missing, and student accounts are created by an authenticated teacher from student management.

### Supabase Free setup

1. Create a Supabase Free project.
2. Copy the pooled Postgres connection string from Supabase Database settings.
3. Set it as `DATABASE_URL`.
4. Run `npx prisma generate` and `npm run db:migrate:deploy`.
5. Run `npm run db:security:apply` after the migrations and after adding database objects.
6. Run `npm run db:check` and `npm run db:security:check` before deployment.

Do not use `prisma db push` for an application environment. The versioned migrations
create required database functions, triggers, claims, and security rules that schema
push cannot reproduce.

### Point-integrity migration rollout

The point-integrity migration and the application release that depends on it must be
cut over together. Stop point-bearing writes and drain requests from the previous app
version, run `npm run db:migrate:deploy`, deploy the matching app version, run
`npm run db:security:apply` and the database checks, and only then resume writes. This
prevents an older app process from deleting award ledgers while the new immutable
claim rules are being installed.

The migration rejects every existing pending AI activity review and teacher-adjusted
review because older rows do not contain a verifiable source snapshot. Rejected rows
receive a `MIGRATED_REJECTED_` bonus-type prefix so the original per-question or
per-comment unique slot is available for a fresh analysis; approved ledger rows are
not changed. After writes resume, teachers must run the session analysis again to
create reviewable candidates from the current question and comment text.

Before backfilling question-game settlement receipts, the migration cross-checks
each active completed version-2 room against its participant accounts, saved award
result, and approved point logs. It does not mark partial histories as awarded.
Ephemeral completed rooms that still reference an already-deleted account are
removed while their surviving audit logs remain unchanged.

If `npm run db:migrate:deploy` fails while applying
`20260716211000_close_point_integrity_races`, keep point-bearing writes stopped.
Check `npm run db:migrate:status` and the database logs, then verify that the
transaction rolled back and none of that migration's new columns, indexes,
functions, triggers, or `activity_award_claims` table remain. Only after that
verification, mark the failed attempt as rolled back and retry the versioned
migration:

```bash
node scripts/run-prisma-with-env.mjs migrate resolve --rolled-back 20260716211000_close_point_integrity_races
npm run db:migrate:deploy
```

Do not run the migration SQL directly and do not use `prisma db push`. If any
partial object remains or rollback cannot be proven, do not resolve the failed
migration; keep writes stopped and repair or restore the database first.

### Supabase Data API security

This application accesses Postgres only from server code through Prisma. It does not use the Supabase client, REST, GraphQL, Realtime, or browser-side Supabase keys.

`npm run db:security:apply` performs one transaction that:

- revokes current table, sequence, and routine access from `PUBLIC`, `anon`, and `authenticated`
- revokes the same default privileges for future objects created by `postgres`
- removes the default `PUBLIC EXECUTE` privilege for future routines
- enables row level security on every current table without adding public policies

The command does not insert, update, or delete rows. The Prisma connection remains usable because it runs as the table owner with row level security bypass capability. The `service_role` grants are intentionally left unchanged for server administration and must never be exposed to a browser.

For defense in depth, turn off the Data API in the Supabase dashboard from the project's Data API settings. This is required because the `supabase_admin` default privileges cannot be changed by the application's `postgres` connection. See the [Supabase Data API security guide](https://supabase.com/docs/guides/api/securing-your-api).

The production build runs `db:security:check` and fails if public roles regain effective access, unsafe default grants return, or any public table has row level security disabled.

Emergency rollback restores the access state that existed before this hardening and therefore reopens the Data API. Run it only while handling a confirmed outage:

The rollback is pinned to the original 18-table schema and refuses automatic rollback after the public schema changes. Review a rollback manually if tables, sequences, or routines have changed.

```bash
CONFIRM_DB_SECURITY_ROLLBACK=restore-public-data-api-access npm run db:security:rollback
```

### Sentry error monitoring (optional)

1. Create a free Sentry project (Next.js platform).
2. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel (and `.env.local`).
3. Redeploy. Both values empty = monitoring fully disabled (no bundle cost).

Captured events: uncaught server/request errors (`onRequestError`), browser errors
(dynamic-loaded SDK, only when the public DSN is set), and every `logger.error` call
(server-side, so handled failures like point-award retries become alertable).
PII is not sent (`sendDefaultPii: false`) and tracing is off to stay in the free tier.

### Resend Free setup

1. Create a Resend API key.
2. Verify one sending domain in Resend.
3. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

The app sends email only from server routes:

- teacher welcome email after teacher registration
- teacher password reset link
- student bulk creation summary to the teacher
- new question notification to the session teacher

## Deployment to Vercel

1. Push code to GitHub
2. Import project in Vercel (https://vercel.com/new)
3. Set environment variables in Vercel dashboard:
   - `DATABASE_URL`: Supabase pooled Postgres connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your Vercel deployment URL
   - `GOOGLE_API_KEY`: Your Gemini API key
   - `RESEND_API_KEY`: Resend API key
   - `RESEND_FROM_EMAIL`: Verified sender, e.g. `Question Lab <noreply@your-domain.com>`

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, Register pages
│   ├── (student)/       # Student portal
│   ├── (teacher)/       # Teacher portal
│   └── api/             # API routes
├── components/ui/       # shadcn/ui components
└── lib/                 # Auth, DB, Gemini
```
