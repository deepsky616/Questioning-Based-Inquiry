/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["nodemailer"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 학생 로그인 화면을 iframe에 넣는 클릭재킹 차단
          { key: "X-Frame-Options", value: "DENY" },
          // MIME 추측으로 응답이 스크립트로 실행되는 것 차단
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 외부 이동 시 내부 경로(세션 id 등) 유출 최소화
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 사용하지 않는 브라우저 권한 원천 차단
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
