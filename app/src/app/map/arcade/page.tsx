"use client";

import { useEffect, useMemo, useState } from "react";
import HubTabs from "@/components/HubTabs";
import {
  Badge,
  Chip,
  ChipRow,
  DarkHero,
  HubAppBar,
  HubHeading,
  ListCard,
  MetaTable,
  SectionHead,
  StatTiles,
  Steps,
} from "@/components/hub";
import { Card, Screen } from "@/components/ui";
import {
  INNING_CHOICES,
  LEVELS,
  LEVEL_ORDER,
  enrolledSubjectNames,
  loadRanking,
  loadRecord,
  poolBySubject,
  type ArcadeRecord,
  type Innings,
  type LevelKey,
  type RankRow,
} from "@/lib/arcade";
import { loadUi, saveUi } from "@/lib/ui-state";

/**
 * 개념 야구 — 로비 겸 대시보드.
 *
 * 화면의 과업은 하나다: **다음 경기를 어떻게 칠지 정하기.** 내 기록도 순위표도
 * 그 결정에 쓰이는 재료다 — 지난번보다 잘 치려면 지난번을 봐야 한다.
 * 과업이 바뀌는 자리(실제 경기)는 /map/arcade/play 로 나간다.
 *
 * 배치는 참고 이미지(components/hub.tsx 주석)를 따랐다. 설정 셋을 카드로 쌓던
 * 것을 칩 세 줄로 줄여, 처음 연 학생도 스크롤 없이 시작 버튼까지 닿는다.
 */
export default function ArcadePage() {
  const [level, setLevel] = useState<LevelKey>("amateur");
  const [innings, setInnings] = useState<Innings>(3);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [record, setRecord] = useState<ArcadeRecord | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const pool = useMemo(() => poolBySubject(), []);

  // localStorage 는 마운트 뒤에야 읽을 수 있다 (SSR 에는 저장소가 없다)
  useEffect(() => {
    const saved = loadUi().arcade;
    if (saved?.level && saved.level in LEVELS) setLevel(saved.level as LevelKey);
    if (saved?.innings && (INNING_CHOICES as readonly number[]).includes(saved.innings)) {
      setInnings(saved.innings as Innings);
    }
    // 범위를 정한 적이 없으면 **내 정보의 수강 과목**을 그대로 쓴다.
    // 매번 과목부터 고르게 하면 경기 한 판까지 손이 세 번 더 간다
    setSubjects(saved?.subjects ?? enrolledSubjectNames());
    setRecord(loadRecord());
  }, []);

  function pick(next: { level?: LevelKey; innings?: Innings; subjects?: string[] }) {
    if (next.level) setLevel(next.level);
    if (next.innings) setInnings(next.innings);
    if (next.subjects) setSubjects(next.subjects);
    saveUi({
      arcade: {
        level: next.level ?? level,
        innings: next.innings ?? innings,
        subjects: next.subjects ?? subjects,
      },
    });
  }

  const toggle = (name: string) =>
    pick({
      subjects: subjects.includes(name)
        ? subjects.filter((s) => s !== name)
        : [...subjects, name],
    });

  const ready = pool.filter((p) => p.count > 0);
  const chosen = ready.filter((p) => subjects.includes(p.subject));
  const inScope = (chosen.length > 0 ? chosen : ready).reduce((n, p) => n + p.count, 0);
  const lv = LEVELS[level];
  const played = record !== null && record.plays > 0;

  return (
    <>
      <HubAppBar title="개념 야구" right={<Badge tone="primary">타자 게임</Badge>} />
      <HubTabs />
      <Screen>
        <HubHeading overline={`개념 ${inScope}장이 준비돼 있어요`}>
          정의를 치면,
          <br />
          타자가 걸어 나가요.
        </HubHeading>

        {/* ── 이 화면이 필요로 하는 선택 ────────────────────────────────────
            설정을 화면 가운데 두었더니 한 판 치기까지 스크롤을 두 번 해야 했다.
            무엇으로 칠지 먼저 고르고 그다음 시작하는 순서가 맞다 —
            아래 히어로의 문구와 CTA 가 여기서 고른 것을 그대로 받는다. */}
        <ChipRow label="난이도">
          {LEVEL_ORDER.map((k) => (
            <Chip key={k} on={level === k} onClick={() => pick({ level: k })}>
              {LEVELS[k].label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="경기 길이">
          {INNING_CHOICES.map((n) => (
            <Chip key={n} on={innings === n} onClick={() => pick({ innings: n })}>
              {n}이닝
            </Chip>
          ))}
        </ChipRow>
        {/* 과목이 일곱이라 줄바꿈하면 세 줄을 먹는다. 가로로 흘린다 */}
        <ChipRow label="출제 범위" scroll>
          {pool.map(({ subject, count }) => (
            <Chip
              key={subject}
              on={subjects.includes(subject)}
              onClick={() => toggle(subject)}
              disabled={count === 0}
            >
              {subject}
              <span className="ml-1.5 font-semibold opacity-60">
                {count > 0 ? count : "준비 중"}
              </span>
            </Chip>
          ))}
        </ChipRow>
        <p className="mb-5 px-1 text-[12px] leading-relaxed text-ink-faint">
          {lv.note} · 한 타석 {lv.seconds}초, {lv.targetKpm}타/분을 넘기면 타구가 한 단계 더
          뻗어요. 범위를 하나도 고르지 않으면 준비된 과목 전부에서 나와요. 고른 것은
          그대로 기억해 둬요.
        </p>

        {/* 고른 것으로 바로 시작 — 이 화면의 CTA 는 이것 하나다 (D2).
            따로 시작 버튼을 하나 더 두면 둘 중 뭐가 다른지 학생이 확인하러
            눌러 보게 된다 */}
        <DarkHero
          eyebrow={played ? "CONTINUE" : "FIRST PITCH"}
          title={played ? `${lv.label} ${innings}이닝, 한 판 더` : "첫 타석에 서 볼까요"}
          meta={
            played
              ? `지금까지 ${record!.plays}판 · 최고 ${record!.bestScore}점`
              : "정의가 날아오면 표제어를 치면 돼요"
          }
          cta={`${lv.label} ${innings}이닝 시작하기`}
          href="/map/arcade/play"
        />

        <SectionHead
          title="내 기록"
          action={played ? `최근 ${record!.recent.length}판` : "아직 없음"}
        />
        <StatTiles
          items={[
            { label: "최고 점수", value: record?.bestScore ?? 0 },
            { label: "최고 타속", value: record?.bestKpm ?? 0, unit: "타/분" },
            { label: "최고 콤보", value: record?.bestCombo ?? 0, unit: "연속" },
          ]}
        />

        {/* 규칙 — 접어 둔다. 두 번째 판부터는 읽을 일이 없다 */}
        <SectionHead
          title="어떻게 하나요?"
          action={
            <button
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="font-semibold text-primary-600"
            >
              {rulesOpen ? "접기" : "펼치기"}
            </button>
          }
        />
        {rulesOpen ? (
          <>
            <Steps
              items={[
                <>
                  개념의 <b className="text-ink">정의</b>가 투구로 날아와요. 제한 시간 안에{" "}
                  <b className="text-ink">표제어</b>를 치면 안타예요.
                </>,
                <>
                  이어 맞힐수록 타구가 뻗어요 — <b className="text-ink">2연속 2루타</b>,{" "}
                  <b className="text-ink">3연속 3루타</b>, <b className="text-ink">4연속 홈런</b>.
                  기준 타속을 넘기면 한 단계 더요.
                </>,
                <>
                  놓치거나 시간이 다하면 아웃이에요. <b className="text-ink">3아웃</b>이면 이닝이
                  넘어가고 주자는 지워져요.
                </>,
                <>
                  놓친 개념은 정답을 보여 주고 멈춰요. 그 자리에서 카드를 열어 볼 수 있어요.
                </>,
              ]}
            />
            <div className="mt-3">
              <MetaTable
                rows={[
                  { k: "점수", v: "득점×100 + 최고 콤보×20 + 평균 타속" },
                  { k: "타속", v: "첫 타건부터 제출까지 (읽는 시간은 빼요)" },
                  { k: "채점", v: "오늘의 단답과 같은 잣대 · 영문명도 정답" },
                  { k: "기록", v: "맞힌 개념만 학습 기록에 올라가요" },
                ]}
              />
            </div>
          </>
        ) : (
          <Card>
            <p className="text-[14px] leading-relaxed text-ink-sub">
              정의를 읽고 표제어를 치면 진루해요. 이어 맞힐수록 타구가 뻗고, 3아웃이면
              이닝이 넘어가요.
            </p>
          </Card>
        )}

        <Ranking />

        {played && record!.recent.length > 0 && (
          <>
            <SectionHead title="최근 경기" action="이 기기에만 남아요" />
            <div className="flex flex-col gap-2">
              {record!.recent.map((r) => (
                <div
                  key={r.at}
                  className="flex items-center gap-3 rounded-[20px] bg-surface px-5 py-3.5 shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-bold text-ink-faint">
                      {LEVELS[r.level]?.label ?? "?"} ·{" "}
                      {new Date(r.at).toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                    <span className="block text-[15px] font-bold text-ink">
                      {r.runs}점 · {r.kpm}타/분
                    </span>
                  </span>
                  <span className="shrink-0 text-[17px] font-extrabold text-primary-600">
                    {r.score}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Screen>
    </>
  );
}

/** 선수 랭킹 — 결과 화면에서 직접 올린 사람만 오른다 (arcade.ts submitScore) */
function Ranking() {
  const [rows, setRows] = useState<RankRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadRanking().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <SectionHead title="선수 랭킹" action={rows && rows.length > 0 ? "최고 점수 순" : undefined} />
      {rows === null ? (
        <p className="px-1 text-[13px] text-ink-faint">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-[14px] leading-relaxed text-ink-sub">
            아직 순위표가 비어 있어요. 경기를 마치고{" "}
            <b className="text-ink">순위표에 올리기</b>를 누르면 여기 이름이 올라요.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
            올라가는 것은 닉네임과 점수뿐이에요. 누르지 않으면 아무것도 올라가지 않아요.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <ListCard
              key={row.user_id}
              title={
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                      i === 0
                        ? "bg-ink text-white"
                        : i < 3
                          ? "bg-primary-50 text-primary-700"
                          : "bg-bg-subtle text-ink-faint"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{row.nickname}</span>
                </span>
              }
              foot={`${row.runs}점 · ${row.best_kpm}타/분 · ${row.best_combo}연속 · ${row.plays}판`}
              right={
                <span className="text-[17px] font-extrabold text-primary-600">
                  {row.best_score}
                </span>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
