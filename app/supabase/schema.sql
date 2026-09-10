-- Sci_Map — Supabase 스키마 (설계서 §7.5 계약의 계열 공용 부분)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣어 실행한다. 여러 번 실행해도 안전하다.
--
-- 원칙: 학생은 자기 행만 읽고 쓴다(RLS). 카드·문항은 아직 앱 번들(정적 JSON)이
-- 원본이라 여기 두지 않는다 — C9(배포)가 열리면 concepts/quiz_items 가 들어온다.

create extension if not exists pgcrypto;

-- ── 초대 코드 — 수업 참여 학생 확인 (R3). 교사가 만든다 ─────────────────────
create table if not exists public.invite_codes (
  code        text primary key,
  label       text,                          -- 예: "2026 2학기 화학 3반"
  expires_at  timestamptz,                   -- 학기 종료 시 만료
  max_uses    int  default 40,
  uses        int  default 0,
  created_at  timestamptz default now()
);

-- ── 학생 프로필 (= 설계서 students). auth.users 와 1:1 ───────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nickname         text,                     -- 학번 별칭 (R13). 실명을 받지 않는다
  grade            smallint check (grade between 1 and 3),
  semester         smallint check (semester in (1, 2)),
  subjects         text[] default '{}',      -- 과목 코드 ('mate', 'isci1' …)
  invite_code      text references public.invite_codes(code),
  consent_version  text,                     -- 동의한 안내문 버전 (docs/privacy_notice.md)
  consent_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── 개념별 FSRS 기억 상태 (계열 공용) ────────────────────────────────────────
create table if not exists public.study_states (
  user_id     uuid references public.profiles(id) on delete cascade,
  concept_id  text not null,
  state       jsonb not null,                -- ts-fsrs Card 직렬화 (scheduler.ts)
  due         timestamptz not null,          -- 조회용으로 꺼내 둔다
  updated_at  timestamptz default now(),
  primary key (user_id, concept_id)
);
create index if not exists study_states_due on public.study_states (user_id, due);

-- ── 응답 기록 — C10 튜닝 입력 ────────────────────────────────────────────────
create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  concept_id  text not null,
  item_id     text not null,
  kind        text not null check (kind in ('ox', 'short', 'mcq')),
  correct     boolean not null,
  elapsed_ms  int,
  grade       smallint,                      -- FSRS 등급 1~4
  created_at  timestamptz default now()
);
create index if not exists attempts_user_time on public.attempts (user_id, created_at desc);

-- ── 일자별 출제 세트 — 재현·복기용 ───────────────────────────────────────────
create table if not exists public.daily_sets (
  user_id     uuid references public.profiles(id) on delete cascade,
  date_key    text not null,                 -- 'YYYY-MM-DD'
  review      text[] default '{}',           -- 그날의 복습 개념
  fresh       text[] default '{}',           -- 그날의 신규 개념
  created_at  timestamptz default now(),
  primary key (user_id, date_key)
);

-- ── RLS: 자기 행만 ────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.study_states enable row level security;
alter table public.attempts     enable row level security;
alter table public.daily_sets   enable row level security;
alter table public.invite_codes enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own study_states" on public.study_states;
create policy "own study_states" on public.study_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own attempts" on public.attempts;
create policy "own attempts" on public.attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own daily_sets" on public.daily_sets;
create policy "own daily_sets" on public.daily_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 초대 코드는 로그인한 사용자가 "존재·유효 여부"만 확인한다. 목록은 못 본다.
drop policy if exists "check invite code" on public.invite_codes;
create policy "check invite code" on public.invite_codes
  for select using (auth.role() = 'authenticated');

-- ── 초대 코드 사용 — 유효하면 uses 를 올리고 true ─────────────────────────────
create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  update public.invite_codes
     set uses = uses + 1
   where code = p_code
     and (expires_at is null or expires_at > now())
     and uses < max_uses
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists study_states_touch on public.study_states;
create trigger study_states_touch before update on public.study_states
  for each row execute function public.touch_updated_at();

-- ── 아이디·비밀번호 가입 (2026-09-07 교사 결정) ───────────────────────────────
-- 구글·메일 링크를 걷어내고 아이디와 비밀번호로 간다. 학생이 메일함을 열지
-- 않아도 들어올 수 있어야 한다는 것이 이유다 (docs/login_design.md).
--
-- ★ Supabase Auth 의 email 자리에는 아이디로 만든 합성 주소를 넣는다
--   (<아이디>@id.scisherpa.app). 진짜 메일 주소를 넣으면 아이디로 로그인할 때
--   아이디 → 메일 주소를 찾아 주는 통로가 필요한데, 그 통로는 곧 "아이디만 알면
--   그 학생 메일 주소를 알 수 있다"는 뜻이 된다. 합성 주소는 찾을 필요가 없다.
--   진짜 메일 주소는 비밀번호 재설정 용도로만 recovery_email 에 따로 둔다.
alter table public.profiles
  add column if not exists username        text,
  add column if not exists recovery_email  text,
  add column if not exists sido_code       text,   -- NEIS ATPT_OFCDC_SC_CODE (강원 K10)
  add column if not exists sido            text,   -- 대분류 (강원특별자치도)
  add column if not exists sigungu         text,   -- 소분류 (속초시) — 학교 주소에서 뽑는다
  add column if not exists school_kind     text,   -- 중학교 | 고등학교
  add column if not exists school_code     text,   -- NEIS SD_SCHUL_CODE
  add column if not exists school_name     text;

-- 아이디 중복 방지 — 대소문자를 구분하지 않는다. Abc 와 abc 는 같은 아이디다
create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- 아이디가 이미 쓰이는지만 돌려준다. 프로필도 메일 주소도 내주지 않는다 —
-- 가입 화면에서 중복을 미리 알려 주려면 이만큼은 열려 있어야 한다
create or replace function public.username_taken(p_username text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles where lower(username) = lower(p_username)
  );
$$;
grant execute on function public.username_taken(text) to anon, authenticated;

-- ── 닉네임도 중복을 막는다 (2026-09-07 교사 결정) ────────────────────────────
-- 아이디는 로그인용이고 닉네임은 학생끼리 서로 부르는 이름이다. 둘이 겹치면
-- 화면에서 누가 누구인지 알 수 없게 되므로 닉네임도 유일해야 한다.
-- 비어 있는 닉네임은 유일성 검사에서 뺀다 — 아직 안 지은 사람이 여럿일 수 있다.
create unique index if not exists profiles_nickname_key
  on public.profiles (lower(nickname))
  where nickname is not null and nickname <> '';

create or replace function public.nickname_taken(p_nickname text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where lower(nickname) = lower(btrim(p_nickname))
       and nickname is not null and nickname <> ''
  );
$$;
grant execute on function public.nickname_taken(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 지도 탭 부가 기능 (2026-09-11 교사 결정) — 개념 야구 순위표 · 스터디룸
--
-- 두 기능 다 **남의 행을 읽어야** 성립한다. 이 스키마의 원칙은 "자기 행만"
-- 이므로(위 RLS 블록), 원칙을 느슨하게 푸는 대신 필요한 만큼만 내주는
-- security definer 함수를 통로로 둔다. 어떤 경우에도 profiles 전체나
-- attempts 원본이 남에게 열리지 않는다 — 내려가는 것은 집계와 닉네임뿐이다.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 개념 야구 순위표 ────────────────────────────────────────────────────────
-- 한 사람에 한 행이다. 경기마다 쌓지 않는다 — 순위표는 최고 기록만 필요하고,
-- 경기 이력은 학생 기기(localStorage)에 남는다. 서버에 다 쌓으면 학생 수 ×
-- 경기 수만큼 행이 늘어나는데, 그 행으로 할 일이 순위표 말고는 없다.
--
-- nickname 을 여기 베껴 두는 이유: 순위표를 그리려면 남의 닉네임이 필요한데
-- profiles 는 자기 행만 열린다. 사본을 두면 profiles 를 열지 않고 순위표가
-- 그려진다. 사본은 점수를 올릴 때마다 최신 닉네임으로 덮인다.
create table if not exists public.arcade_scores (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  nickname    text not null,
  best_score  int  not null default 0,
  best_kpm    int  not null default 0,   -- 최고 타속 (타/분)
  best_combo  int  not null default 0,
  runs        int  not null default 0,   -- 최고 점수를 낸 그 경기의 득점
  plays       int  not null default 0,
  updated_at  timestamptz default now()
);
create index if not exists arcade_scores_rank on public.arcade_scores (best_score desc);

alter table public.arcade_scores enable row level security;

-- 순위표는 로그인한 학생 모두가 읽는다. 여기 오른 것은 본인이 결과 화면에서
-- "순위표에 올리기" 를 눌러 올린 것뿐이다 (src/lib/arcade.ts submitScore).
drop policy if exists "read ranking" on public.arcade_scores;
create policy "read ranking" on public.arcade_scores
  for select using (auth.role() = 'authenticated');

-- 쓰기는 자기 행만. 실제 갱신은 아래 함수를 거친다
drop policy if exists "own arcade score" on public.arcade_scores;
create policy "own arcade score" on public.arcade_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 최고 기록만 갱신한다. 못 친 판이 잘 친 판을 덮지 않도록 항목마다 greatest 다
create or replace function public.arcade_submit(
  p_nickname text, p_score int, p_kpm int, p_combo int, p_runs int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  insert into public.arcade_scores as a
    (user_id, nickname, best_score, best_kpm, best_combo, runs, plays)
  values
    (auth.uid(), p_nickname, greatest(p_score, 0), greatest(p_kpm, 0),
     greatest(p_combo, 0), greatest(p_runs, 0), 1)
  on conflict (user_id) do update set
    nickname   = excluded.nickname,
    -- 점수가 갱신될 때만 그 경기의 득점을 함께 갱신한다. 따로 놓으면
    -- 순위표의 "3점 · 420타/분" 이 한 경기에서 나온 값이 아니게 된다
    runs       = case when excluded.best_score > a.best_score then excluded.runs else a.runs end,
    best_score = greatest(a.best_score, excluded.best_score),
    best_kpm   = greatest(a.best_kpm, excluded.best_kpm),
    best_combo = greatest(a.best_combo, excluded.best_combo),
    plays      = a.plays + 1,
    updated_at = now();
end $$;
grant execute on function public.arcade_submit(text, int, int, int, int) to authenticated;

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
