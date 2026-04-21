# Question Lab

Questioning-Based Inquiry Web App - 질문기반 탐구수업 웹앱

## Features

- 학생: 질문 작성 및 AI 분류, 질문库里, 다른 학생 질문 탐구
- 교사: 학생 질문 통계, 유형별 분석, 질문 수정/코멘트

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: NextAuth.js v5, Prisma, SQLite
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
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_API_KEY="your-gemini-api-key"
```

## Deployment to Vercel

1. Push code to GitHub
2. Import project in Vercel (https://vercel.com/new)
3. Set environment variables in Vercel dashboard:
   - `DATABASE_URL`: Use Turso SQLite or similar
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your Vercel deployment URL
   - `GOOGLE_API_KEY`: Your Gemini API key

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