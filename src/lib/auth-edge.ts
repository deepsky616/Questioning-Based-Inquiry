import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth-shared";

export const { auth } = NextAuth(edgeAuthConfig);
