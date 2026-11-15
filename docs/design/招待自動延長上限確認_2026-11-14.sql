-- Q-2026-11-06-7: 招待リンクの自動延長の上限（作成から180日）の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「招待自動延長上限変更_2026-11-14.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ:
--   - 「2.」に出る招待リンクは、変更後は自動で延びなくなり、詳細の期限で切れる。使い続けてほしい相手なら、変更後に画面で手動延長する。
--   - 変更後は「4.」が 1。

with auto as (
  select i.id, i.label, i.created_at, i.expires_at, i.auto_extend_days
  from public.invites i
  where i.auto_extend_days is not null and i.revoked_at is null and i.expires_at > now()
)
select '1. 有効な自動延長付きの招待リンク' as 項目,
       (select count(*) from auto) as 件数,
       coalesce((select string_agg(format('id %s %s（作成 %s・期限 %s・%s日）', id, coalesce(label, ''), to_char(created_at, 'YYYY-MM-DD'), to_char(expires_at, 'YYYY-MM-DD'), auto_extend_days), ' / ' order by id)
                 from (select * from auto order by id limit 20) t), 'なし') as 詳細,
       '参考' as 判定
union all
select '2. 作成から180日を過ぎた自動延長付きの招待リンク',
       (select count(*) from auto where created_at + interval '180 days' < now()),
       coalesce((select string_agg(format('id %s %s（作成 %s・期限 %s）', id, coalesce(label, ''), to_char(created_at, 'YYYY-MM-DD'), to_char(expires_at, 'YYYY-MM-DD')), ' / ' order by id)
                 from auto where created_at + interval '180 days' < now()), 'なし'),
       case when (select count(*) from auto where created_at + interval '180 days' < now()) = 0 then 'OK'
            else '参考（変更後は自動で延びない。必要なら手動で延長）' end
union all
select '3. 作成から期限までの最長日数（全招待リンク）',
       coalesce((select max(extract(day from expires_at - created_at))::integer from public.invites), 0),
       '参考（自動延長の上限は作成から180日）',
       '参考'
union all
select '4. redeem_invite に上限が入っているか',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'redeem_invite' and p.prosrc like '%180 days%'),
       '変更前は 0、変更後は 1',
       '参考';
