"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import {
  Badge,
  DarkHero,
  HubAppBar,
  MetaTable,
  SectionHead,
  StatTiles,
} from "@/components/hub";
import { Card, Screen } from "@/components/ui";
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
  /** 한 바퀴 다 돌기 전에는 아무 결론도 내지 않는다 — 중간 상태를 화면으로
      삼으면 "들어갈 수 없어요" 가 잠깐 스친다 (/me 의 동의 화면과 같은 실수) */
  const [ready, setReady] = useState(false);

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
    const r = await roomInfo(code);
    if (!r) {
      // 구성원이 아니면 RLS 가 방 자체를 감춘다 — 없는 방과 구분하지 않는다.
      // 구분해 주면 코드를 하나씩 넣어 보며 방이 있는지 알아낼 수 있다
      setDenied(true);
      setReady(true);
      return;
    }
    setRoom(r);
    setBoard(await roomBoard(code));
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
  const mine = ranked.find((r) => r.user_id === me);
  const done = ranked.filter((r) => r.today_count >= room.goal).length;
  const left = mine ? Math.max(0, room.goal - mine.today_count) : room.goal;

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

      {/* 오늘 방이 어디까지 왔나 — 등수보다 먼저 */}
      <section className="mt-4 rounded-[24px] bg-primary-500 p-5 text-white shadow-hero">
        <p className="text-[13px] font-semibold text-white/85">오늘 목표를 채운 사람</p>
        <p className="mt-1 text-[40px] font-extrabold leading-none">
          {done}
          <span className="ml-1 text-[18px] font-bold text-white/70">/ {ranked.length}명</span>
        </p>
        {mine && (
          <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-1.5 text-[13px] font-bold">
            나는 오늘 {mine.today_count}문항
            {left === 0 ? " · 목표 달성 🎉" : ` · ${left}문항 남았어요`}
          </p>
        )}
      </section>

      {mine && (
        <>
          <SectionHead title="내 몫" action="한국 시간 기준" />
          <StatTiles
            items={[
              { label: "오늘 푼 문항", value: mine.today_count },
              { label: "최근 7일 학습", value: mine.week_days, unit: "일" },
              { label: "익힌 개념", value: mine.concepts, unit: "개" },
            ]}
          />
        </>
      )}

      <SectionHead title="오늘의 순위" action="오늘 푼 문항 순" />
      <div className="flex flex-col gap-2">
        {ranked.map((r, i) => {
          const isMe = r.user_id === me;
          const hit = r.today_count >= room.goal;
          return (
            <div
              key={r.user_id}
              className={`flex items-center gap-3 rounded-[20px] px-5 py-4 shadow-[0_2px_14px_rgba(23,58,94,0.06)] ${
                isMe ? "bg-primary-50 ring-2 ring-inset ring-primary-300" : "bg-surface"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${
                  i === 0 && r.today_count > 0
                    ? "bg-ink text-white"
                    : "bg-bg-subtle text-ink-faint"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-1 flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold text-ink">{r.nickname}</span>
                  {isMe && <Badge tone="primary">나</Badge>}
                  {/* 달성은 색만으로 알리지 않는다 (D4) */}
                  {hit && <Badge tone="success">✓ 달성</Badge>}
                </span>
                <span className="block text-[12px] text-ink-faint">
                  최근 7일 {r.week_days}일 · 익힌 개념 {r.concepts}개
                  {r.best_score > 0 && ` · 야구 ${r.best_score}점`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[18px] font-extrabold text-primary-600">
                  {r.today_count}
                </span>
                <span className="block text-[11px] text-ink-faint">문항</span>
              </span>
            </div>
          );
        })}
      </div>

      <SectionHead title="이 방은 이렇게 봐요" />
      <MetaTable
        rows={[
          { k: "순위 기준", v: "오늘 푼 문항 수 (같으면 최근 7일 학습일)" },
          { k: "하루 목표", v: `${room.goal}문항 — 방이 함께 세운 기준` },
          { k: "보이는 것", v: "닉네임 · 학습량 집계 · 야구 점수" },
          { k: "안 보이는 것", v: "무엇을 맞고 틀렸는지, 어떤 개념을 봤는지" },
        ]}
      />

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => void load()}
          className="h-12 flex-1 rounded-full bg-surface text-[14px] font-bold text-ink-sub shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          새로고침
        </button>
        <button
          onClick={async () => {
            if (!confirm(`'${room.name}' 방에서 나갈까요? 코드를 다시 넣으면 돌아올 수 있어요.`))
              return;
            await leaveRoom(code);
            router.push("/map/rooms");
          }}
          className="h-12 flex-1 rounded-full bg-surface text-[14px] font-bold text-ink-faint shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          방 나가기
        </button>
      </div>
    </Shell>
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
