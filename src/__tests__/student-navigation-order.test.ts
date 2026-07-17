import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(student)/StudentShell.tsx", "utf8");

function readStudentPages() {
  const pagesBlock = layoutSource.match(/const STUDENT_PAGES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  return Array.from(pagesBlock.matchAll(/\{ href: "([^"]+)", key: "([^"]+)" \}/g), ([, href, key]) => ({
    href,
    key,
  }));
}

function readAppNavAccountLinks(source: string) {
  const sourceFile = ts.createSourceFile("student-layout.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
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

describe("student navigation order", () => {
  it("학생 학습 흐름의 전체 메뉴 순서를 고정한다", () => {
    expect(readStudentPages()).toEqual([
      { href: "/student-dashboard", key: "dashboard" },
      { href: "/student-question-learning", key: "questionLearning" },
      { href: "/student-practice", key: "practice" },
      { href: "/student-ask", key: "ask" },
      { href: "/student-questions", key: "explore" },
      { href: "/student-question-play", key: "questionPlay" },
    ]);
  });

  it("학생 설정을 상단 계정 메뉴에서 접근할 수 있다", () => {
    expect(readAppNavAccountLinks(layoutSource)).toMatchObject({ settingsHref: "/student-settings" });
  });

  it("AppNav 밖에 있는 계정 경로는 무시한다", () => {
    const detachedAccountLink = `
      <AppNav pages={pages} />
      const detached = { settingsHref: "/student-settings" };
    `;

    expect(readAppNavAccountLinks(detachedAccountLink)).toEqual({});
  });
});
