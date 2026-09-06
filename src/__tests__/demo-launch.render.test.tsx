import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("src/app/demo/launch/page.tsx", "utf8");
const clientSource = readFileSync(
  "src/app/demo/launch/DemoLaunchClient.tsx",
  "utf8",
);
const validationRouteSource = readFileSync(
  "src/app/api/demo/validate/route.ts",
  "utf8",
);

describe("USB 시연 실행 화면", () => {
  it("주소 조각을 브라우저 기록에서 지운 뒤 서버 검증과 로그인을 수행한다", () => {
    expect(clientSource).toContain("window.location.hash");
    expect(clientSource).toContain("window.history.replaceState");
    expect(clientSource).toContain('fetch("/api/demo/validate"');
    expect(clientSource).toContain('signIn("demo-launch"');
    expect(clientSource).toContain(
      'window.location.replace("/student-dashboard")',
    );
    expect(clientSource).not.toContain("useRouter");
    expect(clientSource).not.toContain("localStorage");
    expect(clientSource).not.toContain("sessionStorage");
  });

  it("만료, 권한, 연결 오류를 구분하고 같은 화면에서 다시 시도한다", () => {
    expect(clientSource).toContain("사용 기간이 끝났습니다");
    expect(clientSource).toContain("실행 권한을 확인할 수 없습니다");
    expect(clientSource).toContain("인터넷 연결을 확인해 주세요");
    expect(clientSource).toContain("다시 시도");
  });

  it("서버 검증 주소는 실행 표를 응답에 포함하지 않는다", () => {
    expect(validationRouteSource).toContain("validateDemoLaunchTicket");
    expect(validationRouteSource).toContain('reason: validation.reason');
    expect(validationRouteSource).not.toContain("ticket,");
  });

  it("실행 화면에는 질문연구소 이미지와 시연 학생 안내가 있다", () => {
    expect(pageSource).toContain("DemoLaunchClient");
    expect(clientSource).toContain("/login-inquiry-hero.png");
    expect(clientSource).toContain("학생1");
  });
});
