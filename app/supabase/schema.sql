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
