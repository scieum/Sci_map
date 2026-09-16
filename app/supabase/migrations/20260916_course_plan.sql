-- 학기별 수강 과목 — profiles.course_plan (lib/enrollment.ts)
--
-- schema.sql 을 통째로 다시 실행해도 같은 결과가 된다. 이 파일은 이미 스키마를
-- 올려 둔 프로젝트에 이 열 하나만 붙이려 할 때 쓴다. 여러 번 실행해도 안전하다.
--
-- ★ subjects 열을 대체하지 않는다. 저쪽은 **지금 학기**의 과목이고 스케줄러와
--   개념 탭이 보는 값이다. 여섯 학기를 한 열에 담아 두고 매번 지금 칸을 꺼내
--   쓰게 하면, 학년·학기가 비어 있는 계정에서 출제 범위가 통째로 사라진다.
alter table public.profiles
  add column if not exists course_plan jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
