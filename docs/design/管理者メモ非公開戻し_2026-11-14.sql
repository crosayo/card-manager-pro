-- Q-2026-11-06-2 の戻し: 「管理者メモ非公開変更_2026-11-14.sql」を実行する前の状態（anon が admin_memo を読める）に戻す
-- 2026-11-14 作成。招待リンクのリクエスト一覧が権限エラーで出ないとき（古いアプリが admin_memo を読んでいるとき）などに実行する。
-- 戻すと、招待リンクを持つ人が全リクエストの管理者メモを読める状態に戻る。アプリを新しい版にしたら、もう一度「変更」を実行する。

grant select (admin_memo) on public.requests to anon;

-- 結果（読み取りのみ）: anon が読める requests の列（admin_memo があること）
select column_name as anon_が読める列
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'requests' and grantee = 'anon' and privilege_type = 'SELECT'
order by column_name;
