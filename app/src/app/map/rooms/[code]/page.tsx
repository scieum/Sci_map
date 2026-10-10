"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Badge, DarkHero, HubAppBar, MetaTable, SectionHead } from "@/components/hub";
import { Card, ProgressBar, Screen } from "@/components/ui";
import { accentOfSubject } from "@/lib/brand";
import { leaveRoom, roomBoard, roomInfo, type BoardRow, type Room } from "@/lib/rooms";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 스터디룸 하나 — 오늘 누가 얼마나 했는지.
 *
 * 순위는 **오늘 푼 문항 수**로 매긴다. 누적으로 매기면 일찍 시작한 사람이 학기
 * 내내 1등이라 나중에 들어온 학생은 따라잡을 길이 없다. 매일 0에서 다시 시작해야
 * 오늘 앉는 일에 값이 생긴다.
 *
 * 방의 하루 목표는 등수보다 앞에 둔다 — 서로를 이기는 것보다 각자 제 몫을 채우는
 * 것이 먼저다.
 */
export default function RoomPage({ params }: PageProps<"/map/rooms/[code]"> ) {
  const { code } = use(params);
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** 서버가 답하지 못한 사유 — "참여하지 않은 방" 과 구분해 보여 준다 */
  const [problem, setProblem] = useState<string | null>(null);
  /** 한 바퀴 다 돌기 전에는 아무 결론도 내지 않는다 — 중간 상태를 화면으로
      삼으면 "들어갈 수 없어요" 가 잠깐 스친다 (/me 의 동의 화면과 같은 실수) */
  const [ready, setReady] = useState(false);
  /** 순위를 받아 온 시각 — "HH:MM 기준" 으로 보여 준다 */
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const { data } = await supabase().auth.getSession();
    const uid = data.session?.user.id ?? null;
    setMe(uid);
    if (!uid) {
      setReady(true);
      return;
    }
    const info = await roomInfo(code);
    if (!info.ok) {
      setProblem(info.reason);
      setReady(true);
      return;
    }
    if (!info.value) {
      // 구성원이 아니면 RLS 가 방 자체를 감춘다 — 없는 방과 구분하지 않는다.
      // 구분해 주면 코드를 하나씩 넣어 보며 방이 있는지 알아낼 수 있다
      setDenied(true);
      setReady(true);
      return;
    }
    setRoom(info.value);
    const b = await roomBoard(code);
    if (b.ok) {
      setBoard(b.value);
      setLoadedAt(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    } else setProblem(b.reason);
    setReady(true);
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return (
      <Shell code={code}>
        <p className="text-[14px] text-ink-faint">불러오는 중…</p>
      </Shell>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <Shell code={code}>
        <Card>
          <p className="text-[15px] font-bold">아직 서버와 연결되지 않았어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            스터디룸은 서로의 기록을 보여 주는 기능이라 서버가 필요해요.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!me) {
    return (
      <Shell code={code}>
        <DarkHero
          eyebrow="LOGIN"
          title="이 방에 들어가려면 로그인이 필요해요"
          meta="로그인한 뒤 이 주소로 다시 오면 바로 들어갈 수 있어요"
          cta="로그인하러 가기"
          href="/me"
        />
      </Shell>
    );
  }

  if (problem) {
    return (
      <Shell code={code}>
        <Card>
          <p className="text-[15px] font-bold text-danger">방을 열지 못했어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">{problem}</p>
          <Link
            href="/map/rooms"
            className="mt-4 inline-block rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            스터디룸으로
          </Link>
        </Card>
      </Shell>
    );
  }

  if (denied) {
    return (
      <Shell code={code}>
        <Card>
          <p className="text-[15px] font-bold">이 방에 들어갈 수 없어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-sub">
            코드가 맞지 않거나, 아직 참여하지 않은 방이에요. 스터디룸 화면에서 코드를
            넣어 참여해 주세요.
          </p>
          <Link
            href="/map/rooms"
            className="mt-4 inline-block rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            스터디룸으로
          </Link>
        </Card>
      </Shell>
    );
  }

  if (!room || !board) {
    return (
      <Shell code={code}>
        <p className="text-[14px] text-ink-faint">불러오는 중…</p>
      </Shell>
    );
  }

  // 오늘 많이 푼 순. 같으면 최근 7일 학습일이 많은 쪽이 앞이다 —
  // 하루 몰아서 한 사람보다 매일 앉은 사람을 앞에 둔다
  const ranked = [...board].sort(
    (a, b) => b.today_count - a.today_count || b.week_days - a.week_days,
  );
  const myIdx = ranked.findIndex((r) => r.user_id === me);
  const mine = myIdx >= 0 ? ranked[myIdx] : undefined;
  const done = ranked.filter((r) => r.today_count >= room.goal).length;
  const started = ranked.filter((r) => r.today_count > 0).length;
  const left = mine ? Math.max(0, room.goal - mine.today_count) : room.goal;
  // 바로 위 순위까지의 거리 — 1위이면 셀 대상이 없다
  const above = myIdx > 0 ? ranked[myIdx - 1] : undefined;
  const gap = above && mine ? above.today_count - mine.today_count : null;

  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <Shell code={code}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="dark">코드 {room.code}</Badge>
        <Badge tone="neutral">{ranked.length}명</Badge>
        <Badge tone="primary">하루 {room.goal}문항</Badge>
      </div>
      <h1 className="text-[24px] font-extrabold leading-snug tracking-[-0.01em] text-ink">
        {room.name}
      </h1>
      {room.subjects.length > 0 && (
        <div className="mb-4 mt-2.5 flex flex-wrap gap-1.5">
          {room.subjects.map((s) => {
            const accent = accentOfSubject(s);
            return (
              <span
                key={s}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${accent.tint} ${accent.text}`}
              >
                {s}
              </span>
            );
          })}
        </div>
      )}

      {/* 오늘 방이 어디까지 왔나 — 등수보다 먼저.
          시안은 "방 전체 합계 / 방 목표" 를 그렸지만, 이 방의 목표는 **한 사람의
          하루 몫**(room.goal)이다. 합계 목표를 지어내지 않고 "몫을 채운 사람 수"
          로 막대를 채운다 */}
      <Card className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-bold text-ink">오늘 방 목표</p>
          <p className="text-[15px] font-bold text-primary-700">
            {done} / {ranked.length}명 달성
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={ranked.length ? done / ranked.length : 0}
            label="오늘 목표를 채운 사람"
          />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-sub">
          한 사람 하루 {room.goal}문항 · {ranked.length}명 중 {started}명이 시작했어요 · 매일
          0시에 다시 시작
        </p>
      </Card>

      {mine && (
        <section className="mt-3 flex items-center gap-4 rounded-[24px] bg-primary-50 px-5 py-4">
          <p className="shrink-0 text-[26px] font-extrabold leading-none text-primary-700">
            {myIdx + 1}위
          </p>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink">나 · {mine.nickname}</p>
            <p className="mt-0.5 text-[13px] text-ink-sub">
              오늘 {mine.today_count}문항
              {gap !== null &&
                (gap > 0 ? ` · ${myIdx}위까지 ${gap}문항` : ` · ${myIdx}위와 같은 문항 수`)}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              {left === 0 ? "✓ 오늘 몫 달성" : `오늘 몫까지 ${left}문항`} · 최근 7일{" "}
              {mine.week_days}일 · 익힌 개념 {mine.concepts}개
            </p>
          </div>
        </section>
      )}

      <div className="mb-3 mt-7 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-ink">오늘의 순위</h2>
        <button
          onClick={() => void load()}
          aria-label="순위 새로고침"
          className="inline-flex items-center gap-1 text-[12px] text-ink-faint"
        >
          {loadedAt && `${loadedAt} 기준`}
          <span aria-hidden className="text-[14px] leading-none">
            ↻
          </span>
        </button>
      </div>

      {/* 시상대 — 2위 · 1위 · 3위 순으로 세운다. 세 명이 안 되면 빈 자리는 비워 둔다 */}
      <div className="grid grid-cols-3 items-end gap-2">
        {[1, 0, 2].map((pos) => {
          const r = podium[pos];
          if (!r) return <span key={pos} aria-hidden />;
          return (
            <PodiumSpot
              key={r.user_id}
              row={r}
              rank={(pos + 1) as 1 | 2 | 3}
              isMe={r.user_id === me}
              goal={room.goal}
            />
          );
        })}
      </div>

      {rest.length > 0 && (
        <Card className="mt-4 px-0! py-2!">
          <ul>
            {rest.map((r, i) => {
              const isMe = r.user_id === me;
              const hit = r.today_count >= room.goal;
              return (
                <li
                  key={r.user_id}
                  className={`flex items-center gap-3 px-5 py-3 ${isMe ? "bg-primary-50" : ""}`}
                >
                  <span className="w-5 shrink-0 text-[15px] font-extrabold text-primary-700">
                    {i + 4}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-[13px] font-bold text-ink-sub"
                  >
                    {initial(r.nickname)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">
                      {r.nickname}
                    </span>
                    {isMe && <Badge tone="primary">나</Badge>}
                    {/* 달성은 색만으로 알리지 않는다 (D4) */}
                    {hit && <Badge tone="success">✓ 달성</Badge>}
                  </span>
                  {r.today_count > 0 ? (
                    <span className="shrink-0 text-[13px] font-semibold text-ink-sub">
                      {r.today_count}문항
                    </span>
                  ) : (
                    <span className="shrink-0 text-[13px] text-ink-faint">아직 시작 전</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <SectionHead title="이 방은 이렇게 봐요" />
      <MetaTable
        rows={[
          { k: "순위 기준", v: "오늘 푼 문항 수 (같으면 최근 7일 학습일)" },
          { k: "하루 목표", v: `${room.goal}문항 — 방이 함께 세운 기준` },
          { k: "보이는 것", v: "닉네임 · 학습량 집계 · 야구 점수" },
          { k: "안 보이는 것", v: "무엇을 맞고 틀렸는지, 어떤 개념을 봤는지" },
        ]}
      />

      {/* 시안의 "초대 코드 공유하기" CTA 는 두지 않는다 — 공유 기능이 아직 없고,
          방 코드는 교사의 초대 코드(invite_codes)와 다른 것이라 이름을 섞으면 안 된다.
          방 나가기는 되돌리기 번거로운 일이라 눈에 띄는 버튼이 아니라 글자 버튼으로 둔다 */}
      <div className="mt-6 text-center">
        <button
          onClick={async () => {
            if (!confirm(`'${room.name}' 방에서 나갈까요? 코드를 다시 넣으면 돌아올 수 있어요.`))
              return;
            await leaveRoom(code);
            router.push("/map/rooms");
          }}
          className="px-4 py-2 text-[13px] font-semibold text-ink-faint"
        >
          방 나가기
        </button>
      </div>
    </Shell>
  );
}

/** 닉네임 첫 글자 — 이모지·결합 문자가 반 토막 나지 않게 코드 포인트로 자른다 */
function initial(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

/** 시상대 한 자리. 1위만 크게, 2·3위는 보조 팔레트로 구분한다 — 순위는 글자로도 적는다 */
const PODIUM = {
  1: {
    circle: "h-16 w-16 bg-primary-100 text-[20px] text-primary-700 ring-[3px] ring-primary-500",
    chip: "bg-primary-500 text-white",
  },
  2: {
    circle: "h-12 w-12 bg-green-50 text-[17px] text-green-700 ring-2 ring-green-500",
    chip: "bg-green-50 text-green-700",
  },
  3: {
    circle: "h-12 w-12 bg-orange-50 text-[17px] text-orange-700 ring-2 ring-orange-500",
    chip: "bg-orange-50 text-orange-700",
  },
} as const;

function PodiumSpot({
  row,
  rank,
  isMe,
  goal,
}: {
  row: BoardRow;
  rank: 1 | 2 | 3;
  isMe: boolean;
  goal: number;
}) {
  const look = PODIUM[rank];
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-full font-extrabold ${look.circle}`}
      >
        {initial(row.nickname)}
      </span>
      <span className={`relative -mt-2 rounded-full px-3 py-0.5 text-[12px] font-bold ${look.chip}`}>
        {rank}위
      </span>
      <span className="mt-1.5 flex max-w-full items-center gap-1">
        <span className="truncate text-[14px] font-bold text-ink">{row.nickname}</span>
        {isMe && <Badge tone="primary">나</Badge>}
      </span>
      <span className="mt-0.5 text-[12px] text-ink-faint">
        {row.today_count > 0 ? `오늘 ${row.today_count}문항` : "아직 시작 전"}
      </span>
      {row.today_count >= goal && (
        <span className="mt-0.5 text-[11px] font-bold text-success">✓ 달성</span>
      )}
    </div>
  );
}

function Shell({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <>
      <HubAppBar
        title="스터디룸"
        right={
          <Link href="/map/rooms" className="text-[13px] font-semibold text-ink-faint">
            목록
          </Link>
        }
      />
      <Screen>
        {/* 참고 이미지의 상세 화면처럼 ‹ 로 돌아간다. 세그먼트(HubTabs)는 걷어냈다 —
            방 안은 목록의 한 겹 아래라, 여기서 다시 탭을 보여 주면 어디로 나가는
            문인지 알 수 없다 */}
        <nav className="-mt-1 mb-3">
          <Link
            href="/map/rooms"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-faint"
          >
            <span aria-hidden className="text-[16px] leading-none">
              ‹
            </span>
            {code}
          </Link>
        </nav>
        {children}
      </Screen>
    </>
  );
}
