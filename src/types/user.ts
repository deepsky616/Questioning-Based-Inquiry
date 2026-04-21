export type UserRole = "STUDENT" | "TEACHER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  studentId?: string;
  className?: string;
  school?: string;
  createdAt: Date;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}