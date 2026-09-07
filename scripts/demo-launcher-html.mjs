const DEFAULT_LAUNCH_URL = "https://questioning-based-inquiry.vercel.app/demo/launch";

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function createDemoLauncherHtml({ ticket, launchUrl = DEFAULT_LAUNCH_URL }) {
  const normalizedTicket = String(ticket ?? "").trim();
  if (!normalizedTicket) throw new Error("시연 실행 표가 비어 있습니다.");
  const target = new URL(launchUrl);
  if (target.protocol !== "https:" && !(target.protocol === "http:" && target.hostname === "localhost")) {
    throw new Error("올바른 시연 주소가 필요합니다.");
  }
  const linkFor = (role) => {
    target.hash = `ticket=${encodeURIComponent(normalizedTicket)}&role=${role}`;
    return escapeHtml(target.href);
  };
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="referrer" content="no-referrer">
  <title>질문연구소 · 교사와 학생 로그인</title>
  <script>
    try {
      var savedTheme = localStorage.getItem("questionlab-launcher-theme");
      if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
    } catch (_) {}
  </script>
  <style>
    :root { color-scheme: light; --bg:#f5f7fc; --surface:#ffffff; --text:#20283e; --muted:#556079; --line:#dce2ee; --teacher:#076d65; --teacher-soft:#e6f5f0; --student:#5d43bd; --student-soft:#f0ebff; --shadow:0 18px 52px #2032510a; }
    :root[data-theme="dark"] { color-scheme:dark; --bg:#111727; --surface:#1b2437; --text:#f0f3ff; --muted:#bbc5dc; --line:#3d4962; --teacher:#8ce5d1; --teacher-soft:#173d3a; --student:#c8b6ff; --student-soft:#33294e; --shadow:0 18px 52px #00000024; }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) { color-scheme:dark; --bg:#111727; --surface:#1b2437; --text:#f0f3ff; --muted:#bbc5dc; --line:#3d4962; --teacher:#8ce5d1; --teacher-soft:#173d3a; --student:#c8b6ff; --student-soft:#33294e; --shadow:0 18px 52px #00000024; }
    }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif; font-size:18px; line-height:1.65; word-break:keep-all; }
    button,a { -webkit-tap-highlight-color:transparent; }
    button { font:inherit; cursor:pointer; }
    a:focus-visible,button:focus-visible { outline:3px solid #cc8413; outline-offset:5px; }
    .shell { width:min(1080px,100% - 64px); margin:auto; }
    header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:28px 0; }
    .brand { display:flex; align-items:center; gap:10px; font-size:22px; font-weight:800; letter-spacing:-.6px; }
    .brand-mark { display:grid; place-items:center; width:40px; height:40px; border-radius:13px; background:var(--student-soft); color:var(--student); }
    svg { width:24px; height:24px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex:none; }
    .theme { display:flex; align-items:center; gap:7px; min-height:44px; padding:7px 13px; border:1px solid var(--line); border-radius:12px; background:var(--surface); color:var(--text); font-size:14px; font-weight:600; }
    main { padding:28px 0 32px; }
    .intro { display:grid; grid-template-columns:1fr 230px; align-items:center; gap:32px; margin-bottom:36px; }
    .eyebrow { display:inline-flex; margin:0 0 12px; color:var(--student); font-size:15px; font-weight:750; letter-spacing:.02em; }
    h1 { margin:0; font-size:clamp(32px,4.2vw,46px); font-weight:800; line-height:1.3; letter-spacing:-1.3px; }
    .intro p:last-child { margin:16px 0 0; color:var(--muted); line-height:1.8; }
    .illustration { width:230px; height:172px; object-fit:cover; border-radius:28px; border:1px solid var(--line); box-shadow:var(--shadow); }
    .cards { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    .card { display:flex; flex-direction:column; padding:30px; border:1px solid var(--line); border-radius:24px; background:var(--surface); box-shadow:var(--shadow); }
    .teacher { --accent:var(--teacher); --soft:var(--teacher-soft); }
    .student { --accent:var(--student); --soft:var(--student-soft); }
    .role-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .role-icon { display:grid; place-items:center; width:60px; height:60px; border-radius:18px; background:var(--soft); color:var(--accent); }
    .role-icon svg { width:32px; height:32px; }
    .role-tag { border-radius:100px; padding:5px 13px; font-size:14px; font-weight:750; color:var(--accent); background:var(--soft); }
    h2 { font-size:28px; letter-spacing:-.7px; margin:22px 0 3px; line-height:1.4; }
    .class-info { margin:0; color:var(--muted); font-size:15px; }
    .description { margin:20px 0 22px; color:var(--muted); font-size:17px; line-height:1.85; flex:1; }
    .features { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 26px; padding:0; list-style:none; }
    .features li { font-size:14px; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:3px 9px; }
    .login { display:flex; justify-content:center; align-items:center; gap:10px; min-height:58px; padding:13px 18px; border-radius:14px; font-size:19px; font-weight:750; text-decoration:none; color:#fff; background:#076d65; transition:transform .15s,box-shadow .15s; }
    .student .login { background:#6044bf; }
    .login:hover { transform:translateY(-2px); box-shadow:0 6px 14px #00000022; }
    .login:active { transform:translateY(0); }
    .connection { display:flex; align-items:flex-start; justify-content:center; gap:9px; margin:28px 0 0; color:var(--muted); font-size:15px; text-align:center; }
    .connection svg { width:20px; height:20px; margin-top:3px; }
    footer { padding:0 0 26px; color:var(--muted); text-align:center; font-size:14px; }
    footer p { margin:0; }
    @media (max-width:700px) { .shell { width:calc(100% - 36px); } header { padding:20px 0; } main { padding-top:18px; } .intro { grid-template-columns:1fr; gap:0; margin-bottom:26px; } .illustration { display:none; } .cards { grid-template-columns:1fr; gap:18px; } .card { padding:24px; } .brand { font-size:20px; } h2 { font-size:26px; } .theme { padding:7px 10px; } }
    @media (prefers-reduced-motion: reduce) { .login { transition:none; } .login:hover { transform:none; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 2h.01"/></svg></span>질문연구소</div>
      <button class="theme" id="theme-toggle" type="button" aria-label="어두운 테마로 변경" hidden><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z"/></svg><span id="theme-label">어둡게</span></button>
    </header>
    <main>
      <div class="intro">
        <div>
          <p class="eyebrow">질문기반 탐구수업 · 시연</p>
          <h1>어떤 화면으로 시작할까요?</h1>
          <p>질문으로 생각을 키우는 우리 반.<br>김탐구 선생님과 김질문 학생의 연결된 수업을 만나보세요.</p>
        </div>
        <img class="illustration" src="../media/image/login-inquiry-hero.png" alt="" width="230" height="172">
      </div>
      <div class="cards">
        <section class="card teacher" aria-labelledby="teacher-name">
          <div class="role-row"><span class="role-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="m7 21 5-5 5 5M12 3V1M7 8h5m-5 4h10"/></svg></span><span class="role-tag">교사 화면</span></div>
          <h2 id="teacher-name">김탐구 선생님</h2>
          <p class="class-info">질문초등학교 · 5학년 1반 담임</p>
          <p class="description">학생들의 질문을 살펴보고,<br>질문수업과 탐구설계를 이끌어요.</p>
          <ul class="features" aria-label="교사 주요 기능"><li>질문수업 만들기</li><li>탐구설계</li><li>학생 피드백</li></ul>
          <a class="login" id="teacher-login" href="${linkFor("teacher")}" referrerpolicy="no-referrer">교사 로그인<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>
        </section>
        <section class="card student" aria-labelledby="student-name">
          <div class="role-row"><span class="role-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M8.5 8.5a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/></svg></span><span class="role-tag">학생 화면</span></div>
          <h2 id="student-name">김질문 학생</h2>
          <p class="class-info">질문초등학교 · 5학년 1반 1번</p>
          <p class="description">나만의 질문을 만들고,<br>친구들과 탐구하고 질문놀이에 참여해요.</p>
          <ul class="features" aria-label="학생 주요 기능"><li>질문하기</li><li>질문탐구</li><li>질문놀이</li></ul>
          <a class="login" id="student-login" href="${linkFor("student")}" referrerpolicy="no-referrer">학생 로그인<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>
        </section>
      </div>
      <p class="connection"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></svg><span>두 계정은 같은 학급과 수업에 연결되어 있어요.<br>버튼을 누르면 별도 입력 없이 해당 계정으로 로그인돼요.</span></p>
    </main>
    <footer><p>인터넷에 연결된 상태에서 사용할 수 있어요.</p></footer>
  </div>
  <script>
    (function () {
      var button = document.getElementById("theme-toggle");
      var label = document.getElementById("theme-label");
      var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
      function isDark() { return document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : systemTheme.matches; }
      function updateLabel() {
        label.textContent = isDark() ? "밝게" : "어둡게";
        button.setAttribute("aria-label", isDark() ? "밝은 테마로 변경" : "어두운 테마로 변경");
      }
      button.hidden = false;
      updateLabel();
      systemTheme.addEventListener("change", updateLabel);
      button.addEventListener("click", function () {
        var theme = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem("questionlab-launcher-theme", theme); } catch (_) {}
        updateLabel();
      });
    })();
  </script>
</body>
</html>
`;
}
