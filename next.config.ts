import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 設定画面（server component）が読み込む SQL を、サーバー側の実行ファイルにも同梱する（A2）。
  // /settings はビルド時に静的に描画される見込みだが、Vercel で動的に描画された場合の保険
  outputFileTracingIncludes: {
    "/settings": ["./supabase/schema.sql"],
  },
};

export default nextConfig;
