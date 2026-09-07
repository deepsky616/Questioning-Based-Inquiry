import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { STUDENT_NAMES, buildDemoRankingStudents } from "./seed-usb-demo.mjs";

function expectedStudents() {
  return [
    ...STUDENT_NAMES.map((name, index) => ({
      id: `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
      name, school: "질문초등학교", grade: "4", className: "1", studentNumber: String(index + 1),
    })),
    ...buildDemoRankingStudents(),
  ];
}

export function buildDemoStudentNamePlan(users) {
  const expected = expectedStudents();
  const byId = new Map(users.map((user) => [user.id, user]));
  if (users.length !== expected.length || byId.size !== expected.length) {
    throw new Error("시연 학생 목록이 예상과 달라 이름을 변경하지 않았습니다.");
  }
  return expected.flatMap((profile) => {
    const user = byId.get(profile.id);
    if (!user || !user.isDemo || user.role !== "STUDENT" ||
      ["school", "grade", "className", "studentNumber"].some((field) => user[field] !== profile[field])) {
      throw new Error("시연 학생 신원을 확인하지 못해 이름을 변경하지 않았습니다.");
    }
    return user.name === profile.name ? [] : [{ id: user.id, before: user.name, after: profile.name }];
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupPath = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);
  if (apply && !backupPath) throw new Error("적용 시 --backup=경로를 지정해 기존 이름을 보관하세요.");
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = new PrismaClient();
  const ids = expectedStudents().map(({ id }) => id);
  const select = {
    id: true, name: true, isDemo: true, role: true, school: true,
    grade: true, className: true, studentNumber: true, totalPoints: true,
  };
  try {
    const users = await db.user.findMany({ where: { id: { in: ids } }, select, orderBy: { id: "asc" } });
    const plan = buildDemoStudentNamePlan(users);
    if (apply && plan.length > 0) {
      writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), plan }, null, 2), { mode: 0o600, flag: "wx" });
      await db.$transaction(async (tx) => {
        for (const change of plan) {
          const result = await tx.user.updateMany({
            where: { id: change.id, name: change.before, isDemo: true, role: "STUDENT" },
            data: { name: change.after },
          });
          if (result.count !== 1) throw new Error("학생 정보가 변경되어 이름 변경을 취소했습니다.");
        }
        const after = await tx.user.findMany({ where: { id: { in: ids } }, select, orderBy: { id: "asc" } });
        if (buildDemoStudentNamePlan(after).length > 0 ||
          JSON.stringify(users.map((user) => ({ ...user, name: "" }))) !==
          JSON.stringify(after.map((user) => ({ ...user, name: "" })))) {
          throw new Error("이름 외의 학생 정보가 달라 이름 변경을 취소했습니다.");
        }
      }, { timeout: 60_000 });
    }
    console.log(JSON.stringify({ mode: apply ? "적용" : "미리보기", students: users.length, changed: plan.length,
      primaryName: STUDENT_NAMES[0], classNames: `${STUDENT_NAMES[0]}, ${STUDENT_NAMES[1]}~${STUDENT_NAMES.at(-1)}`, rankingNames: "학생29~학생405" }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message.split("\n").filter(Boolean).at(-1));
    process.exitCode = 1;
  });
}
