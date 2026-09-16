-- 평가 문항 이미지 저장소 — **비공개 버킷 + 서명 URL**
--
-- 2026-09-16 교사 결정: 천재교육 평가자료의 문항 크롭은 **로그인한 학생에게만**
-- 보인다 (docs/rights_policy.md). 교과서 삽화(§2.5, 공개)와 다르게 다루는 이유는
-- 평가문항이 문제집 시장을 직접 대체하기 때문이다.
--
-- 그래서 이미지는 공개 리포(app/public)에 두지 않는다. 여기 비공개 버킷에 올리고
-- 앱은 로그인한 세션으로 서명 URL 을 받아 간다 (app/src/lib/exam.ts).
--
-- 올리기: python app/scripts/upload_exam_assets.py  (service_role 키 필요)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam', 'exam', false, 5242880, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 읽기는 로그인한 사람만. 익명(anon)에게는 정책을 주지 않는다 —
-- 정책이 없으면 RLS 가 막는다
drop policy if exists "exam read for signed in" on storage.objects;
create policy "exam read for signed in" on storage.objects
  for select to authenticated using (bucket_id = 'exam');

-- 쓰기 정책은 두지 않는다. 올리는 일은 교사가 service_role 키로 하고,
-- 그 키는 정책을 지나간다. 학생 세션에 쓰기를 열어 둘 이유가 없다

notify pgrst, 'reload schema';
