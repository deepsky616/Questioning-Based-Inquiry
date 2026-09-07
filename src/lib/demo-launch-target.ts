export type DemoLaunchRole = "student" | "teacher";

export const DEMO_LAUNCH_TARGETS = {
  student: { id: "usb-demo-student-01", role: "STUDENT", dashboard: "/student-dashboard" },
  teacher: { id: "usb-demo-teacher", role: "TEACHER", dashboard: "/teacher-dashboard" },
} as const;

/** 역할이 없는 기존 학생 실행 파일은 계속 지원한다. 그 밖의 역할은 허용하지 않는다. */
export function parseDemoLaunchRole(value: unknown): DemoLaunchRole | null {
  if (value === undefined || value === "") return "student";
  return value === "student" || value === "teacher" ? value : null;
}
