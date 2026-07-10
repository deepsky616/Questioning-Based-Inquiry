import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { buildLoginIdentity, isLoginAttemptAllowed } from "@/lib/login-guard";
import { authCallbacks, authPages, authSession } from "@/lib/auth-shared";
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
  callbacks: authCallbacks,
  pages: authPages,
  session: authSession,
});
