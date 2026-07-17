import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(teacher)/TeacherShell.tsx", "utf8");

function readTeacherPages() {
  const pagesBlock = layoutSource.match(/const TEACHER_PAGES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  return Array.from(pagesBlock.matchAll(/\{ href: "([^"]+)", key: "([^"]+)" \}/g), ([, href, key]) => ({
    href,
    key,
  }));
}

function readAppNavAccountLinks(source: string) {
  const sourceFile = ts.createSourceFile("teacher-layout.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const accountLinks: Record<string, string> = {};

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === "AppNav") {
      const accountLinksAttribute = node.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === "accountLinks",
      );
      const expression =
        accountLinksAttribute?.initializer && ts.isJsxExpression(accountLinksAttribute.initializer)
          ? accountLinksAttribute.initializer.expression
          : undefined;

      if (expression && ts.isObjectLiteralExpression(expression)) {
        for (const property of expression.properties) {
          if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
            accountLinks[property.name.getText(sourceFile)] = property.initializer.text;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return accountLinks;
}

describe("teacher navigation order", () => {
  it("교사 수업 흐름의 전체 메뉴 순서를 고정한다", () => {
    expect(readTeacherPages()).toEqual([
      { href: "/teacher-dashboard", key: "dashboard" },
      { href: "/teacher-question-learning", key: "questionLearning" },
      { href: "/teacher-practice", key: "practice" },
      { href: "/teacher-sessions", key: "sessions" },
      { href: "/teacher-questions", key: "questions" },
      { href: "/teacher-question-play", key: "questionPlay" },
    ]);
    expect(layoutSource).toContain('aliases: ["/teacher-curriculum"]');
  });

  it("교사 설정과 학생 관리를 상단 계정 메뉴에서 접근할 수 있다", () => {
    const accountLinks = readAppNavAccountLinks(layoutSource);
    expect(accountLinks).toMatchObject({
      settingsHref: "/teacher-settings",
      studentManagementHref: "/teacher-students",
    });
    expect(accountLinks).not.toHaveProperty("withdrawalHref");
  });

  it("AppNav 밖에 있는 계정 경로는 무시한다", () => {
    const detachedAccountLinks = `
      <AppNav pages={pages} />
      const detached = {
        settingsHref: "/teacher-settings",
        studentManagementHref: "/teacher-students",
      };
    `;

    expect(readAppNavAccountLinks(detachedAccountLinks)).toEqual({});
  });
});
