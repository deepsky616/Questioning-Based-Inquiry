import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { buildLoginIdentity, isLoginAttemptAllowed } from "@/lib/login-guard";
import type { UserRole } from "@/types/user";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        school: {},
        grade: {},
        className: {},
        studentNumber: {},
        loginType: {},
      },
      authorize: async (credentials) => {
        if (!credentials?.password) return null;

        // 계정 단위 시도 제한 — 비밀번호 무한 시도(브루트포스) 차단.
        // DB 조회 전에 검사해 초과 시도는 비용 없이 거절한다.
        const identity = buildLoginIdentity(credentials);
        if (identity && !isLoginAttemptAllowed(identity)) return null;

        let user;

        if (credentials.loginType === "student") {
          const school = credentials.school as string;
          const grade = credentials.grade as string;
          const className = credentials.className as string;
          const studentNumber = credentials.studentNumber as string;
          if (!school || !grade || !className || !studentNumber) return null;
          user = await prisma.user.findFirst({
            where: { role: "STUDENT", school, grade, className, studentNumber },
          });
        } else {
          const email = credentials.email as string | undefined;
          if (!email) return null;
          user = await prisma.user.findUnique({ where: { email } });
        }

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password as string, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email ?? undefined,
          role: user.role as UserRole,
          name: user.name,
          school: user.school,
          grade: user.grade,
          className: user.className,
          studentNumber: user.studentNumber,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.school = user.school;
        token.grade = user.grade;
        token.className = user.className;
        token.studentNumber = user.studentNumber;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.school = (token.school as string | null) ?? null;
      session.user.grade = (token.grade as string | null) ?? null;
      session.user.className = (token.className as string | null) ?? null;
      session.user.studentNumber = (token.studentNumber as string | null) ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
