"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import HubTabs from "@/components/HubTabs";
import {
  Badge,
  Chip,
  ChipRow,
  CheckList,
  DarkHero,
  HubAppBar,
  HubHeading,
  ListCard,
  SearchField,
  SectionHead,
} from "@/components/hub";
import { Card, Screen } from "@/components/ui";
import { poolBySubject } from "@/lib/arcade";
import {
  createRoom,
  joinRoom,
  myRooms,
  normalizeCode,
  roomNameProblem,
  type Room,
} from "@/lib/rooms";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 스터디룸 — 내 방 목록 · 코드로 참여 · 방 만들기.
 *
 * 로그인이 **필요한** 첫 부가 기능이다. 개념 카드도 데일리도 로그인 없이
 * 돌지만(D5), 서로의 학습량을 보는 일은 서로가 누구인지 서버가 알아야
 * 가능하다. 그래서 여기서만 로그인을 요구하고, 요구하는 이유를 화면에 적는다.
 */
/** 이 화면에서 지금 하는 일 — 셋 중 하나다 */
type RoomsView = "mine" | "join" | "create";

export default function RoomsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [view, setView] = useState<RoomsView>("mine");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const sb = supabase();
    let alive = true;
    const read = async (id: string | null) => {
      if (!alive) return;
      setUid(id);
      const mine = id ? await myRooms() : [];
      setRooms(mine);
      // 들어간 방이 없으면 '내 방'을 펼쳐 봐야 빈 카드뿐이다. 처음 온 학생이
      // 실제로 할 일은 코드를 넣는 쪽이므로 거기서 시작한다
      if (id && mine.length === 0) setView("join");
      if (alive) setReady(true);
    };
    void sb.auth.getSession().then(({ data }) => read(data.session?.user.id ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) =>
      void read(session?.user.id ?? null),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => setRooms(await myRooms());

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Card>
          <p className="text-[15px] font-bold">아직 서버와 연결되지 않았어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            스터디룸은 친구들의 기록을 서로 보여 주는 기능이라 서버가 필요해요. 개념
            카드와 오늘의 문항, 개념 야구는 연결 없이도 그대로 쓸 수 있어요.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell>
        <p className="text-[14px] text-ink-faint">불러오는 중…</p>
      </Shell>
    );
  }

  if (!uid) {
    return (
      <Shell>
        <DarkHero
          eyebrow="LOGIN"
          title="같이 하려면 먼저 로그인이 필요해요"
          meta="누가 누구인지 서버가 알아야 서로의 학습량이 보여요"
          cta="로그인하러 가기"
          href="/me"
        />
        <SectionHead title="방에서 보이는 것" />
        <Card>
          <CheckList
            items={[
              "닉네임과 오늘 푼 문항 수",
              "최근 7일 중 학습한 날 수",
              "익힌 개념 수와 개념 야구 점수",
            ]}
          />
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-faint">
            무엇을 맞고 틀렸는지, 어떤 개념을 봤는지는 서로에게 보이지 않아요.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* ── 이 화면이 필요로 하는 선택 ────────────────────────────────────
          예전에는 참여 칸·내 방 목록·만들기 폼이 한 화면에 전부 쌓여 있었다.
          셋은 **동시에 하는 일이 아니다** — 들어갈 방을 찾거나, 코드를 넣거나,
          새로 만들거나 셋 중 하나다. 한 번에 하나만 보여 주면 화면이 짧아지고
          지금 무엇을 하는 중인지도 또렷해진다. */}
      <ChipRow>
        <Chip on={view === "mine"} onClick={() => setView("mine")}>
          내 방
          <span className="ml-1.5 font-semibold opacity-60">{rooms.length}</span>
        </Chip>
        <Chip on={view === "join"} onClick={() => setView("join")}>
          코드로 참여
        </Chip>
        <Chip on={view === "create"} onClick={() => setView("create")}>
          새로 만들기
        </Chip>
      </ChipRow>

      {view === "mine" &&
        (rooms.length > 0 ? (
          <div className="flex flex-col gap-2">
            {rooms.map((r) => (
              <ListCard
                key={r.code}
                href={`/map/rooms/${r.code}`}
                meta={[`코드 ${r.code}`, `하루 ${r.goal}문항`]}
                title={r.name}
                foot={r.subjects.length > 0 ? r.subjects.join(" · ") : "과목 범위 없음"}
                right={<span className="text-[16px] text-ink-faint">›</span>}
              />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-[15px] font-bold">아직 들어간 방이 없어요</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
              친구에게 코드를 받았다면 <b className="text-ink">코드로 참여</b>를, 내가 방을
              열려면 <b className="text-ink">새로 만들기</b>를 눌러 주세요.
            </p>
          </Card>
        ))}

      {view === "join" && <JoinBox onJoined={() => { void refresh(); setView("mine"); }} />}

      {view === "create" && <CreateBox onCreated={refresh} />}

      <p className="mt-8 px-1 text-[12px] leading-relaxed text-ink-faint">
        방 안에서는 서로의 <b className="text-ink-sub">닉네임 · 오늘 푼 문항 수 · 최근 7일
        학습일 · 익힌 개념 수 · 개념 야구 점수</b>가 보여요. 무엇을 틀렸는지, 어떤
        개념을 봤는지는 보이지 않아요.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubAppBar title="스터디룸" right={<Badge tone="primary">함께 학습</Badge>} />
      <HubTabs />
      <Screen>
        <HubHeading overline="코드 하나로 모여요">
          오늘 얼마나 했는지,
          <br />
          서로 보면서 해요.
        </HubHeading>
        {children}
      </Screen>
    </>
  );
}

/* ────────────────────────────── 참여 ────────────────────────────── */

function JoinBox({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    if (code.length < 4 || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await joinRoom(code);
    setBusy(false);
    if (r.ok) {
      setCode("");
      onJoined();
    } else {
      setMsg(r.reason);
    }
  }

  return (
    <>
      <SearchField
        value={code}
        onChange={(v) => setCode(normalizeCode(v))}
        onSubmit={go}
        placeholder="친구에게 받은 코드 6자리"
        maxLength={6}
        wide
        action={
          <button
            type="submit"
            disabled={code.length < 4 || busy}
            className="h-12 shrink-0 rounded-full bg-primary-500 px-5 text-[14px] font-bold text-white shadow-chip disabled:opacity-40"
          >
            {busy ? "확인 중" : "참여"}
          </button>
        }
      />
      {msg && <p className="mt-2 px-1 text-[13px] text-danger">{msg}</p>}
    </>
  );
}

/* ────────────────────────────── 만들기 ────────────────────────────── */

function CreateBox({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(10);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const pool = useMemo(() => poolBySubject().filter((p) => p.count > 0), []);

  async function go() {
    const problem = roomNameProblem(name);
    if (problem) {
      setMsg(problem);
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await createRoom(name, subjects, goal);
    setBusy(false);
    if (r.ok) {
      setMade(r.value);
      setName("");
      setSubjects([]);
      onCreated();
    } else {
      setMsg(r.reason);
    }
  }

  if (made) {
    return (
      <>
        <SectionHead title="방을 만들었어요" />
        <div className="rounded-[24px] bg-ink p-5 text-white shadow-[0_6px_20px_rgba(32,36,43,0.24)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">
            ROOM CODE
          </p>
          {/* 코드는 말로 불러 주는 물건이다. 자간을 벌려 한 글자씩 읽히게 한다 */}
          <p className="my-3 text-center text-[34px] font-extrabold tracking-[0.28em]">
            {made}
          </p>
          <p className="text-center text-[12px] text-white/60">
            친구에게 이 여섯 글자를 알려 주세요
          </p>
          <Link
            href={`/map/rooms/${made}`}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-white text-[15px] font-bold text-ink"
          >
            방으로 들어가기
          </Link>
        </div>
        <button
          onClick={() => setMade(null)}
          className="mt-3 w-full text-center text-[13px] font-semibold text-ink-faint"
        >
          방 하나 더 만들기
        </button>
      </>
    );
  }

  // 펼치고 접는 버튼은 없다 — 위의 칩이 그 일을 한다. 같은 일을 두 곳에서
  // 하게 두면 칩으로 연 폼을 안쪽 버튼으로 닫는 어긋난 상태가 생긴다
  return (
    <Card className="!p-4">
        <label className="block">
          <span className="mb-1.5 block px-1 text-[13px] font-bold text-ink-sub">방 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 3반 화학 스터디"
            maxLength={20}
            className="h-12 w-full rounded-full bg-bg-subtle px-4 text-[16px] outline-none focus:ring-2 focus:ring-primary-300"
          />
          <span className="mt-1.5 block px-1 text-[11px] text-ink-faint">
            2~20자. 실명은 넣지 마세요 — 방에 들어온 모두에게 보여요.
          </span>
        </label>

        <div className="mt-4">
          <ChipRow label="하루 목표">
            {[5, 10, 20, 30].map((n) => (
              <Chip key={n} on={goal === n} onClick={() => setGoal(n)}>
                {n}문항
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="함께 볼 과목 (선택)">
            {pool.map(({ subject }) => (
              <Chip
                key={subject}
                on={subjects.includes(subject)}
                onClick={() =>
                  setSubjects((s) =>
                    s.includes(subject) ? s.filter((x) => x !== subject) : [...s, subject],
                  )
                }
              >
                {subject}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {msg && <p className="mb-3 px-1 text-[13px] text-danger">{msg}</p>}

        <button
          onClick={() => void go()}
          disabled={busy}
          className="h-14 w-full rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-cta disabled:opacity-40"
        >
          {busy ? "만드는 중…" : "만들기"}
        </button>
    </Card>
  );
}
