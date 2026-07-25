# Question Lab

Questioning-Based Inquiry Web App - 질문기반 탐구수업 웹앱

## Features

- 학생: 질문학습, 질문연습, 질문 작성과 탐구, 질문놀이, 학습 기록
- 교사: 질문수업 설계와 배포, 질문 분석, 질문놀이 관리, 학생 관리
- 공통: 역할별 대시보드, 알림, 포인트, 한국어와 영어 화면

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: NextAuth.js v5, Prisma, Supabase Postgres
- **Email**: Nodemailer with Gmail SMTP
- **AI**: Google Gemini API

## Getting Started

```bash
# Install the versions pinned in package-lock.json
npm ci

# Generate Prisma client
npm run db:generate

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
CRON_SECRET="replace-with-a-long-random-secret"
GAME_ACTIVITY_HASH_SECRET="replace-with-at-least-32-characters"
GMAIL_USER="your_gmail@gmail.com"
GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are optional. See `.env.example` for
the complete list and local defaults.

### Supabase Free setup

1. Create a Supabase Free project.
2. Copy the pooled Postgres connection string from Supabase Database settings.
3. Set it as `DATABASE_URL`.
4. Run `npm run db:generate` and `npm run db:migrate:deploy`.
5. Run `npm run db:security:apply` after the migrations and after adding database objects.
6. Run `npm run db:check` and `npm run db:security:check` before deployment.

Do not use `prisma db push` for an application environment. The versioned migrations
create required database functions, triggers, claims, and security rules that schema
push cannot reproduce.

`prisma/schema.prisma` and the files under `prisma/migrations` are the only database
schema sources of truth. Do not apply standalone or unversioned SQL schema files.

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

### AI setup

The runtime application does not read `GOOGLE_API_KEY`. A teacher configures the
Gemini API key and model in the teacher Settings page. The key selected by the
server follows the signed-in teacher and student relationship, with a system
configuration fallback when one has been set.

`GOOGLE_API_KEY` is used only when a developer runs
`scripts/translate-messages.mjs` directly. It is not a required deployment
environment variable.

### Gmail SMTP setup

1. Enable two-step verification for the sending Google account.
2. Create a Google app password for mail.
3. Set the account address as `GMAIL_USER` and the app password as
   `GMAIL_APP_PASSWORD`.

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
   - `DIRECT_URL`: Supabase direct session connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your Vercel deployment URL
   - `CRON_SECRET`: Long random value for scheduled cleanup routes
   - `GAME_ACTIVITY_HASH_SECRET`: Separate random value of at least 32 characters
   - `GMAIL_USER`: Sending Google account address
   - `GMAIL_APP_PASSWORD`: App password created for the same account
   - `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`: Optional error monitoring values

After changing either email variable, redeploy the production deployment and complete
one password reset using a registered teacher account. A successful request must log an
email result with `ok: true` and the message must arrive in the inbox or spam folder.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, Register pages
│   ├── (student)/       # Student portal
│   ├── (teacher)/       # Teacher portal
│   └── api/             # API routes
├── components/          # Shared and feature components
└── lib/                 # Auth, database, AI, and domain services
prisma/
├── schema.prisma        # Current database model
└── migrations/          # Versioned database changes
```
