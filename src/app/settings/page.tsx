import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SettingsPageClient } from './SettingsPageClient';

// DB 構成 SQL は supabase/schema.sql を正とし、サーバー側（ビルド時）で読み込んで画面に渡す。
// Vercel で動的に描画される場合に備え、next.config.ts の outputFileTracingIncludes で同梱している
const schemaSql = readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8');

export default function SettingsPage() {
  return <SettingsPageClient schemaSql={schemaSql} />;
}
