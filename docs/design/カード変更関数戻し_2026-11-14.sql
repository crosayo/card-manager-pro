-- Q-2026-11-06-5 の戻し: 「カード変更関数変更_2026-11-14.sql」で追加した change_request_item_as_admin を消す
-- 2026-11-14 作成。
-- ■ 新しいアプリはこの関数でカード変更（D8）を行うため、消すとリクエスト管理の「変更」「別バリアント」（管理者）が
--   「関数が見つかりません」で失敗する。アプリを前の版に戻してから実行する。データは変わらない。

drop function if exists public.change_request_item_as_admin(bigint, bigint, integer);

-- 結果（読み取りのみ）: 0 であること
select count(*) as 残っている関数の数
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'change_request_item_as_admin';
