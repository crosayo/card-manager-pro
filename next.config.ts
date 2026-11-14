import type { NextConfig } from "next";

// 全ページに付けるセキュリティヘッダー（T-2026-11-14-C / DEV-2026-11-14-3）。
// 細かい CSP（script-src など）は Supabase への接続や Next.js のインライン script を壊しやすいため入れず、
// 画面が壊れにくい3つだけにしている。
const securityHeaders = [
  // 応答の Content-Type を守らせ、ブラウザが種類を推測して実行しないようにする
  { key: "X-Content-Type-Options", value: "nosniff" },
  // ほかのサイトの iframe に埋め込ませない（クリックジャッキング対策。X-Frame-Options: DENY 相当）
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // 外部サイトへ移るときは URL のパスやクエリ（編集用リンクのトークンなど）を送らず、オリジンだけを送る
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // 設定画面（server component）が読み込む SQL を、サーバー側の実行ファイルにも同梱する（A2）。
  // /settings はビルド時に静的に描画される見込みだが、Vercel で動的に描画された場合の保険
  outputFileTracingIncludes: {
    "/settings": ["./supabase/schema.sql"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
