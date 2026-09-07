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
