-- 스터디룸 — 방·구성원 테이블과 서버 함수 (schema.sql 의 같은 절과 동일한 내용)
--
-- 왜 따로 두는가: 앱에서 "Could not find the function public.create_study_room
-- ... in the schema cache" 가 났다. 이 절이 **실제 프로젝트에 아직 실행되지
-- 않았다는 뜻**이다. schema.sql 전체를 다시 붙여 넣는 대신 이 파일만 Supabase
-- 대시보드 > SQL Editor 에 붙여 넣어 실행하면 된다. 여러 번 실행해도 안전하다.
--
-- ★ 마지막 줄의 notify 가 핵심이다. 함수를 만들어도 PostgREST 가 쥔 스키마
--   캐시가 갱신되지 않으면 앱에는 계속 "함수가 없다" 고 보인다.

-- 선행 테이블 확인. 없으면 여기서 멈추는 편이 낫다 — 절반만 만들어진 스키마는
-- "함수는 있는데 순위표만 터지는" 상태를 만든다
do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.attempts') is null
     or to_regclass('public.study_states') is null
     or to_regclass('public.arcade_scores') is null then
    raise exception '선행 테이블이 없어요. supabase/schema.sql 을 먼저 실행해 주세요.';
  end if;
end $$;

-- ── 스터디룸 ────────────────────────────────────────────────────────────────
-- ★ invite_codes 와 다른 것이다. 저쪽은 교사가 만들어 수업 참여를 확인하는
--   권리 장치이고(CLAUDE.md §6, docs/rights_policy.md), 이쪽은 학생끼리
--   학습량을 견주려고 만드는 자리다. 스터디룸 참여로 교과서 그림 열람 권한이
--   열리지 않는다 — 두 코드를 절대 합치지 마라.
create table if not exists public.study_rooms (
  code       text primary key,
  name       text not null,
  owner      uuid not null references public.profiles(id) on delete cascade,
  subjects   text[] default '{}',
  goal       int  not null default 10,     -- 하루 목표 문항 수
  max_size   int  not null default 30,
  created_at timestamptz default now()
);

create table if not exists public.room_members (
  code      text not null references public.study_rooms(code) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (code, user_id)
);
create index if not exists room_members_user on public.room_members (user_id);

alter table public.study_rooms  enable row level security;
alter table public.room_members enable row level security;

-- 구성원인지 묻는 통로. 정책 안에서 room_members 를 직접 조회하면 그 조회에
-- 다시 정책이 걸려 무한히 돈다 — definer 함수로 한 겹 벗겨 낸다
create or replace function public.is_room_member(p_code text)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.room_members
     where code = p_code and user_id = auth.uid()
  );
$$;
grant execute on function public.is_room_member(text) to authenticated;

-- 방은 **구성원에게만** 보인다. 코드를 하나씩 넣어 보며 방이 있는지 알아내는
-- 일을 막는다 (참여는 아래 join 함수가 definer 로 처리한다)
drop policy if exists "member reads room" on public.study_rooms;
create policy "member reads room" on public.study_rooms
  for select using (public.is_room_member(code));

drop policy if exists "owner edits room" on public.study_rooms;
create policy "owner edits room" on public.study_rooms
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "owner deletes room" on public.study_rooms;
create policy "owner deletes room" on public.study_rooms
  for delete using (auth.uid() = owner);

drop policy if exists "member reads roster" on public.room_members;
create policy "member reads roster" on public.room_members
  for select using (public.is_room_member(code));

-- 나가는 것은 언제나 자기 뜻이다
drop policy if exists "leave room" on public.room_members;
create policy "leave room" on public.room_members
  for delete using (auth.uid() = user_id);

-- 헷갈리는 글자를 뺀 코드 알파벳 — 0/O, 1/I/L 이 없다. 코드는 말로 불러 주는
-- 물건이라 "영이야 오야?" 를 묻게 만들면 안 된다
create or replace function public.new_room_code()
returns text language plpgsql volatile
set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  for attempt in 1..20 loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.study_rooms where code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception '방 코드를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.';
end $$;

create or replace function public.create_study_room(
  p_name text, p_subjects text[], p_goal int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception '방 이름을 지어 주세요.'; end if;
  if length(btrim(p_name)) > 20 then raise exception '방 이름은 20자까지예요.'; end if;
  -- 한 사람이 방을 무한히 만들지 못하게 막는다. 버려진 방이 쌓이면 코드
  -- 공간만 갉아먹는다
  if (select count(*) from public.study_rooms where owner = v_uid) >= 5 then
    raise exception '만들 수 있는 방은 5개까지예요. 쓰지 않는 방을 정리해 주세요.';
  end if;

  v_code := public.new_room_code();
  insert into public.study_rooms (code, name, owner, subjects, goal)
  values (v_code, btrim(p_name), v_uid, coalesce(p_subjects, '{}'),
          greatest(1, least(coalesce(p_goal, 10), 100)));
  insert into public.room_members (code, user_id) values (v_code, v_uid);
  return v_code;
end $$;
grant execute on function public.create_study_room(text, text[], int) to authenticated;

create or replace function public.join_study_room(p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_max int;
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  select max_size into v_max from public.study_rooms where code = v_code;
  if v_max is null then raise exception '그런 코드의 방이 없어요.'; end if;
  if exists (select 1 from public.room_members where code = v_code and user_id = v_uid) then
    return v_code;  -- 이미 들어와 있으면 조용히 통과시킨다
  end if;
  if (select count(*) from public.room_members where code = v_code) >= v_max then
    raise exception '이 방은 자리가 다 찼어요.';
  end if;
  insert into public.room_members (code, user_id) values (v_code, v_uid);
  return v_code;
end $$;
grant execute on function public.join_study_room(text) to authenticated;

create or replace function public.leave_study_room(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  delete from public.room_members
   where code = upper(btrim(p_code)) and user_id = v_uid;
  -- 아무도 남지 않은 방은 지운다. 빈 방을 남겨 두면 코드가 영영 묶인다
  delete from public.study_rooms r
   where r.code = upper(btrim(p_code))
     and not exists (select 1 from public.room_members m where m.code = r.code);
end $$;
grant execute on function public.leave_study_room(text) to authenticated;

-- ── 방 순위표 ───────────────────────────────────────────────────────────────
-- 내려가는 것은 **집계와 닉네임뿐**이다. 무엇을 맞고 틀렸는지, 어떤 개념을
-- 봤는지는 나가지 않는다. 학습량을 견주는 일과 남의 오답을 들여다보는 일은
-- 다른 일이고, 뒤쪽까지 열면 방에 들어가는 것 자체가 부담이 된다.
--
-- 오늘은 한국 시간 기준이다. 서버 시계(UTC)로 자르면 밤 9시부터 다음 날로
-- 넘어가 저녁에 공부한 몫이 내일 것으로 세어진다.
create or replace function public.study_room_board(p_code text)
returns table (
  user_id     uuid,
  nickname    text,
  today_count int,
  week_days   int,
  concepts    int,
  best_score  int
)
language plpgsql security definer set search_path = public as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not exists (
    select 1 from public.room_members
     where code = v_code and user_id = auth.uid()
  ) then
    raise exception '이 방의 구성원이 아니에요.';
  end if;

  return query
  select
    m.user_id,
    coalesce(nullif(btrim(p.nickname), ''), '이름 없음')::text,
    (select count(*)::int from public.attempts a
      where a.user_id = m.user_id
        and (a.created_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date),
    (select count(distinct (a.created_at at time zone 'Asia/Seoul')::date)::int
       from public.attempts a
      where a.user_id = m.user_id
        and a.created_at >= now() - interval '7 days'),
    (select count(*)::int from public.study_states s where s.user_id = m.user_id),
    coalesce((select x.best_score from public.arcade_scores x where x.user_id = m.user_id), 0)
  from public.room_members m
  left join public.profiles p on p.id = m.user_id
  where m.code = v_code;
end $$;
grant execute on function public.study_room_board(text) to authenticated;

-- PostgREST 스키마 캐시 갱신 — 이걸 빠뜨리면 함수가 있어도 앱은 못 찾는다
notify pgrst, 'reload schema';
