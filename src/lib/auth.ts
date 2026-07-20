import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { buildLoginIdentity, isLoginAttemptAllowed } from "@/lib/login-guard";
import { authCallbacks, authPages, authSession } from "@/lib/auth-shared";
import { normalizeStudentIdentity } from "@/lib/student-registration";
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
          const rawIdentity = [
            credentials.school,
            credentials.grade,
            credentials.className,
            credentials.studentNumber,
          ];
          if (rawIdentity.some((value) => typeof value !== "string" || !value.trim())) {
            return null;
          }
          const identity = normalizeStudentIdentity({
            school: credentials.school as string,
            grade: credentials.grade as string,
            className: credentials.className as string,
            studentNumber: credentials.studentNumber as string,
          });
          user = await prisma.user.findUnique({
            where: { studentIdentity: identity },
          });
          if (user?.role !== "STUDENT") return null;
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
