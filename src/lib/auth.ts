import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { buildStudentEmail } from "@/lib/student-auth";

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

        let email = credentials.email as string | undefined;

        if (credentials.loginType === "student") {
          const school = credentials.school as string;
          const grade = credentials.grade as string;
          const className = credentials.className as string;
          const studentNumber = credentials.studentNumber as string;
          if (!school || !grade || !className || !studentNumber) return null;
          email = buildStudentEmail(school, grade, className, studentNumber);
        }

        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password as string, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
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
        token.role = (user as any).role;
        token.school = (user as any).school;
        token.grade = (user as any).grade;
        token.className = (user as any).className;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).school = token.school;
        (session.user as any).grade = token.grade;
        (session.user as any).className = token.className;
      }
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
