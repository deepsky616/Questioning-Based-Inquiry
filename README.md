# Question Lab

Questioning-Based Inquiry Web App - 질문기반 탐구수업 웹앱

## Features

- 학생: 질문 작성 및 AI 분류, 질문库里, 다른 학생 질문 탐구
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

# Push database schema
npx prisma db push

# Run development server
npm run dev
```

## Environment Variables

```env
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_API_KEY="your-gemini-api-key"
RESEND_API_KEY="re_your_api_key"
RESEND_FROM_EMAIL="Question Lab <noreply@your-domain.com>"
```

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional in development. If either value is missing, the app skips email sending and keeps the main request successful.

### Supabase Free setup

1. Create a Supabase Free project.
2. Copy the pooled Postgres connection string from Supabase Database settings.
3. Set it as `DATABASE_URL`.
4. Run `npx prisma generate` and `npx prisma db push`.

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
