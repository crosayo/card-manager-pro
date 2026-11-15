# supabase/

Card Manager Pro のデータベース（Supabase / PostgreSQL）の設計図を置くフォルダ（05 A2）。

| ファイル | 役割 |
|---|---|
| `schema.sql` | DB 構成 SQL の正本。設定画面の「データベース構成 (SQL)」はこのファイルを読んで表示する（`src/app/settings/page.tsx` がサーバー側で読み込む）。何度実行しても同じ結果になるよう `if not exists`・`create or replace`・`drop policy if exists` で書いている |
| `migrations/` | これからの DB 変更の差分を `YYYY-MM-DD_内容.sql` で置く場所（2026-11-14 時点では空） |

## 注意

- **`schema.sql` にはまだ `requests`・`request_items`・`request_edit_logs`・`supplies`・`stock_logs` の CREATE TABLE がない。** これらは実際の DB にしかなく、新しい環境は `schema.sql` だけでは作り直せない。実 DB から定義を取り出して足すのが A2 第2段（別途承認）。
- `docs/design/` にある日付付きの SQL（確認・変更・戻し）は、改修ログ（03・05・06）から参照しているので動かさない。これからの分だけ `migrations/` に置く。
- アプリがこれらの SQL を自動で実行することはない。実行するのは管理者が Supabase の SQL Editor で行う。
- `schema.sql` を変えたら、設定画面の表示も変わる（ビルドし直しが必要）。DB を変える改修では、`schema.sql` を最新の定義にそろえ、差分を `migrations/` か `docs/design/` に置き、03 改修ログの「DB変更」に書く。
