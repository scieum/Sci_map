"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, ListCard, MetaTable, SectionHead, StatTiles } from "@/components/hub";
import {
  applyAtBat,
  averageKpm,
  creditConcept,
  drawPitches,
  finalScore,
  HIT_LABEL,
  INNING_CHOICES,
  isHit,
  judge,
  LEVELS,
  loadRecord,
  newGame,
  saveResult,
  scoreBreakdown,
  submitScore,
  type GameState,
  type Innings,
  type LevelKey,
  type Pitch,
  type Play,
} from "@/lib/arcade";
import { keystrokes } from "@/lib/keystrokes";
import { loadUi } from "@/lib/ui-state";

/**
 * 개념 야구 — 경기 화면.
 *
 * 집중 모드다. 탭 바를 숨기고(TabBar.tsx) 화면에는 경기만 둔다 — 한 타석은
 * 길어야 24초이고, 그 안에 정의를 읽고 표제어를 쳐야 한다.
 *
 * ★ 한글 입력(IME)을 조심해서 다룬다. 한글은 조합 중에도 input 값이 바뀌므로,
 *   Enter 를 조합 확정으로 누른 것인지 제출로 누른 것인지 `isComposing` 으로
 *   갈라야 한다. 그러지 않으면 "산화"의 '화'를 확정하는 Enter 가 그대로 제출로
 *   넘어가 "산호" 같은 미완성 글자가 오답 처리된다.
 *
 * ★ 타속은 **첫 타건부터** 잰다. 정의를 읽는 시간을 넣으면 지문이 긴 개념이
 *   붙은 학생이 늘 느려 보인다 (lib/keystrokes.ts).
 */
export default function ArcadePlayPage() {
  const [level, setLevel] = useState<LevelKey>("amateur");
  const [innings, setInnings] = useState<Innings>(3);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [pitches, setPitches] = useState<Pitch[] | null>(null);
  /** "한 판 더" 를 누르면 올라간다. Field 의 key 라서 경기가 통째로 새로 선다 */
  const [round, setRound] = useState(0);

  // 설정은 로비(/map/arcade)가 적어 둔 것을 읽는다. 주소줄에 싣지 않는다
  useEffect(() => {
    const saved = loadUi().arcade;
    const lv = saved?.level && saved.level in LEVELS ? (saved.level as LevelKey) : "amateur";
    const inn = (INNING_CHOICES as readonly number[]).includes(saved?.innings ?? 0)
      ? (saved!.innings as Innings)
      : 3;
    const subs = saved?.subjects ?? [];
    setLevel(lv);
    setInnings(inn);
    setSubjects(subs);
    setPitches(drawPitches(subs));
  }, []);

  if (!pitches) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-[14px] text-ink-faint">
        경기장을 고르는 중…
      </main>
    );
  }
  if (pitches.length === 0) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-20 text-center">
        <p className="text-[15px] leading-relaxed text-ink-sub">
          아직 경기에 쓸 개념이 없어요. 카드가 승인되면 여기서 던져 줄게요.
        </p>
        <Link href="/map/arcade" className="mt-5 inline-block font-bold text-primary-600">
          로비로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <Field
      key={round}
      level={level}
      innings={innings}
      pitches={pitches}
      onAgain={() => {
        // 투구를 다시 뽑는다 — 같은 순서로 두 판을 치면 두 번째는 외운 순서를
        // 치는 일이 된다
        setPitches(drawPitches(subjects));
        setRound((r) => r + 1);
      }}
    />
  );
}

/* ────────────────────────────── 경기장 ────────────────────────────── */

function Field({
  level,
  innings,
  pitches,
  onAgain,
}: {
  level: LevelKey;
  innings: Innings;
  pitches: Pitch[];
  onAgain: () => void;
}) {
  const lv = LEVELS[level];
  const [game, setGame] = useState<GameState>(() => newGame(innings));
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  /** 이 타석이 끝났으면 그 결과. null 이면 아직 치는 중 */
  const [last, setLast] = useState<Play | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const pitch = pitches[idx % pitches.length];
  /**
   * 이 타석이 시작된 시각. ref 가 아니라 state 다 — 렌더 중에 읽는 값이기
   * 때문이다(제한 시간 막대가 이 값에서 나온다). 렌더 중 ref 를 읽으면 React 가
   * 화면을 다시 그릴 때 무엇이 보일지 보장하지 않는다.
   */
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const typingFrom = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * 시간이 다했을 때 "그때까지 친 것"을 아웃 기록에 남기려면 타이머가 최신
   * 입력을 알아야 한다. 상태로 읽으면 글자마다 타이머를 새로 걸어야 하므로
   * 값만 따로 적어 둔다.
   */
  const typed = useRef("");
  /** 같은 타석을 두 번 처리하지 않도록 — 타이머와 제출이 겹칠 수 있다 */
  const settled = useRef(false);

  const deadline = startedAt + lv.seconds * 1000;
  const leftMs = Math.max(0, deadline - now);

  /** 한 타석을 끝낸다. correct=false 면 아웃 */
  const settle = useCallback(
    (given: string, correct: boolean) => {
      if (settled.current) return;
      settled.current = true;
      const typingMs = correct && typingFrom.current ? Date.now() - typingFrom.current : 0;
      const next = applyAtBat(
        game,
        {
          conceptId: pitch.conceptId,
          term: pitch.answer,
          given,
          correct,
          typingMs,
          strokes: keystrokes(pitch.answer),
        },
        lv,
      );
      if (correct) creditConcept(pitch.conceptId);
      setGame(next);
      setLast(next.plays[next.plays.length - 1] ?? null);
    },
    [game, pitch, lv],
  );

  // ── 타이머 ─────────────────────────────────────────────────────────────
  // 100ms 마다 시계를 읽어 남은 시간 막대를 민다. 시간이 다하면 그 자리에서
  // 아웃 처리한다 — 학생이 아무것도 누르지 않아도 경기는 흘러야 한다.
  useEffect(() => {
    if (last || game.over) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) settle(typed.current, false);
    }, 100);
    return () => clearInterval(t);
  }, [last, game.over, deadline, settle]);

  /** 다음 타석 */
  function nextBatter() {
    if (game.over) return;
    settled.current = false;
    typingFrom.current = null;
    typed.current = "";
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setInput("");
    setLast(null);
    setIdx((i) => i + 1);
    // 시트가 닫히면 곧바로 다시 칠 수 있어야 한다. 모바일 키보드가 내려갔다
    // 올라오는 사이에 첫 글자를 놓치는 일을 막는다
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /**
   * 안타는 스스로 넘어가고, 아웃은 학생이 눌러야 넘어간다.
   *
   * 맞혔을 때 확인 버튼을 하나 더 누르게 하면 콤보를 이어 가는 리듬이 끊긴다.
   * 반대로 놓쳤을 때 스스로 넘어가면 정답 표제어를 읽을 틈이 없다 —
   * 놓친 개념을 보여 주는 그 0.9초가 이 게임이 학습인 이유다.
   */
  useEffect(() => {
    if (!last || last.hit === "out" || game.over) return;
    const t = setTimeout(nextBatter, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, game.over]);

  function submit() {
    if (settled.current || !input.trim()) return;
    settle(input, isHit(input, pitch));
  }

  if (game.over) {
    return <Result game={game} level={level} innings={innings} onAgain={onAgain} />;
  }

  const ratio = leftMs / (lv.seconds * 1000);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-6 pt-4">
      <Scoreboard game={game} />

      {/* 남은 시간 — 색이 아니라 길이로도 읽히게 (D4) */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
              ratio > 0.35 ? "bg-primary-500" : "bg-danger"
            }`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <span
          className={`w-9 shrink-0 text-right text-[13px] font-extrabold tabular-nums ${
            ratio > 0.35 ? "text-ink-sub" : "text-danger"
          }`}
        >
          {(leftMs / 1000).toFixed(1)}
        </span>
      </div>

      {/* 투구 — 개념의 정의 */}
      <section className="mt-4 rounded-[24px] bg-surface p-6 shadow-[0_2px_14px_rgba(23,58,94,0.06)]">
        <p className="mb-2 flex items-center gap-2 text-[12px] font-bold text-ink-faint">
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-primary-600">
            {pitch.unit.split(" > ").pop()}
          </span>
          {game.combo > 0 && (
            <span className="rounded-full bg-warning-bg px-2.5 py-1 text-warning">
              {game.combo}연속 · 다음 {HIT_LABEL[judge(game.combo, 0, lv)]}
            </span>
          )}
        </p>
        <p className="text-[17px] font-semibold leading-relaxed">{pitch.prompt}</p>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-4"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            // 첫 타건에 시계를 켠다 — 여기부터가 타속을 재는 구간이다
            if (typingFrom.current === null && e.target.value) typingFrom.current = Date.now();
            typed.current = e.target.value;
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            // 한글 조합을 확정하는 Enter 를 제출로 읽지 않는다
            if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
          }}
          disabled={!!last}
          placeholder="표제어를 쳐 주세요"
          // 16px 미만이면 iOS 가 포커스 때 화면을 확대한다
          className="h-14 w-full rounded-full bg-surface px-5 text-center text-[18px] font-bold shadow-[0_2px_14px_rgba(23,58,94,0.06)] outline-none focus:ring-2 focus:ring-primary-300"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
        <button
          type="submit"
          disabled={!!last || !input.trim()}
          className="mt-3 h-14 w-full rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta disabled:opacity-40"
        >
          스윙!
        </button>
      </form>

      {/* 화면 맨 아래로 민다. 입력창 바로 밑에 두면 스윙을 노리던 엄지가
          그만두기를 누른다 — 한 판이 통째로 날아가는 실수다 */}
      <Link
        href="/map/arcade"
        className="mx-auto mt-auto pb-2 pt-10 text-[13px] font-semibold text-ink-faint underline underline-offset-4"
      >
        경기 그만두기
      </Link>

      {/* 타격 결과 — 안타는 스쳐 지나가고, 아웃은 정답을 보여 주고 멈춘다 */}
      {last && <HitSheet play={last} onNext={nextBatter} />}
    </main>
  );
}

/* ────────────────────────────── 전광판 ────────────────────────────── */

function Scoreboard({ game }: { game: GameState }) {
  return (
    <section className="flex items-center gap-4 rounded-[24px] bg-primary-500 px-5 py-4 text-white shadow-hero">
      <div>
        <p className="text-[11px] font-semibold text-white/75">득점</p>
        <p className="text-[32px] font-extrabold leading-none">{game.score}</p>
      </div>
      <Diamond bases={game.bases} />
      <div className="ml-auto text-right">
        <p className="text-[11px] font-semibold text-white/75">
          {game.inning}/{game.innings}회
        </p>
        <p className="mt-1 flex items-center justify-end gap-1" aria-label={`아웃 ${game.outs}개`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${
                i < game.outs ? "bg-white" : "bg-white/30"
              }`}
            />
          ))}
          <span className="ml-1 text-[11px] font-bold text-white/75">OUT</span>
        </p>
      </div>
    </section>
  );
}

/** 베이스 — 마름모 네 칸. 주자가 선 루는 채워진다 */
function Diamond({ bases }: { bases: [boolean, boolean, boolean] }) {
  const [b1, b2, b3] = bases;
  const on = "fill-white";
  const off = "fill-white/25";
  return (
    <svg
      width="58"
      height="58"
      viewBox="0 0 40 40"
      role="img"
      aria-label={`주자 — 1루 ${b1 ? "있음" : "없음"}, 2루 ${b2 ? "있음" : "없음"}, 3루 ${b3 ? "있음" : "없음"}`}
    >
      {/* 2루(위) · 3루(왼) · 1루(오) · 홈(아래) */}
      <rect x="16" y="4" width="8" height="8" rx="1.5" transform="rotate(45 20 8)" className={b2 ? on : off} />
      <rect x="4" y="16" width="8" height="8" rx="1.5" transform="rotate(45 8 20)" className={b3 ? on : off} />
      <rect x="28" y="16" width="8" height="8" rx="1.5" transform="rotate(45 32 20)" className={b1 ? on : off} />
      <rect x="16" y="28" width="8" height="8" rx="1.5" transform="rotate(45 20 32)" className="fill-white/50" />
    </svg>
  );
}

/* ────────────────────────────── 타격 결과 시트 ────────────────────────────── */

function HitSheet({ play, onNext }: { play: Play; onNext: () => void }) {
  const out = play.hit === "out";
  return (
    <div
      role="status"
      className={`fixed inset-x-0 bottom-0 z-50 rounded-t-[28px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_30px_rgba(23,58,94,0.16)] ${
        out ? "bg-surface" : "bg-primary-500 text-white"
      }`}
    >
      <div className="mx-auto max-w-xl">
        <p
          className={`text-[26px] font-extrabold leading-tight ${out ? "text-danger" : "text-white"}`}
        >
          {out ? "✕ 아웃" : `${HIT_LABEL[play.hit]}!`}
          {play.runs > 0 && <span className="ml-2 text-[18px]">{play.runs}점</span>}
        </p>
        {out ? (
          <>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-sub">
              정답은 <b className="text-ink">{play.term}</b>
              {play.given.trim() && (
                <span className="text-ink-faint"> · 친 것: {play.given.trim()}</span>
              )}
            </p>
            <Link
              href={`/concepts/${play.conceptId}`}
              className="mt-3 inline-block rounded-full bg-primary-50 px-4 py-2 text-[13px] font-bold text-primary-600"
            >
              {play.term} 카드 열기 →
            </Link>
            <button
              onClick={onNext}
              autoFocus
              className="mt-4 h-14 w-full rounded-full bg-primary-500 text-[17px] font-bold text-white shadow-cta"
            >
              다음 타석
            </button>
          </>
        ) : (
          <p className="mt-1 text-[14px] font-semibold text-white/85">
            {play.term} · {play.kpm}타/분
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── 경기 결과 ────────────────────────────── */

function Result({
  game,
  level,
  innings,
  onAgain,
}: {
  game: GameState;
  level: LevelKey;
  innings: Innings;
  onAgain: () => void;
}) {
  const [best, setBest] = useState<number | null>(null);
  const [sent, setSent] = useState<"idle" | "sending" | "done" | string>("idle");
  const score = finalScore(game);
  const misses = useMemo(() => game.plays.filter((p) => p.hit === "out"), [game]);

  // 기록은 화면이 떠오를 때 딱 한 번 저장한다. 렌더마다 저장하면 한 경기가
  // 여러 판으로 세어진다
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    const prev = loadRecord().bestScore;
    saveResult(game, level);
    setBest(prev);
  }, [game, level]);

  const isRecord = best !== null && score > best;

  async function send() {
    setSent("sending");
    const r = await submitScore(game);
    setSent(r.ok ? "done" : (r.reason ?? "올리지 못했어요."));
  }

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-6">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="dark">{LEVELS[level].label}</Badge>
        <Badge tone="neutral">{innings}이닝</Badge>
        {isRecord && <Badge tone="success">개인 최고</Badge>}
      </div>
      <section className="relative overflow-hidden rounded-[28px] bg-primary-500 p-6 text-center text-white shadow-hero">
        <p className="text-[14px] font-semibold text-white/85">경기 종료</p>
        <p className="mt-1 text-[46px] font-extrabold leading-none">{score}</p>
        <p className="mt-1 text-[13px] font-semibold text-white/75">점</p>
        {isRecord && (
          <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-1.5 text-[13px] font-bold">
            🎉 개인 최고 기록이에요
          </p>
        )}
      </section>

      <div className="mt-4">
        <StatTiles
          items={[
            { label: "타석", value: game.atBats },
            { label: "안타", value: game.hits },
            { label: "평균 타속", value: averageKpm(game), unit: "타/분" },
          ]}
        />
      </div>

      {/* 점수가 어디서 왔는지 — 모르는 숫자는 다음 판을 바꾸지 못한다 */}
      <SectionHead title="점수는 어떻게 나왔나요" />
      <MetaTable
        rows={scoreBreakdown(game).map((b) => ({
          k: b.label,
          v: (
            <span className="flex items-baseline justify-end gap-2">
              <span className="text-[12px] font-normal text-ink-faint">{b.detail}</span>
              <span className="text-primary-600">+{b.value}</span>
            </span>
          ),
        }))}
      />

      {/* 순위표는 누른 사람만 오른다 (arcade.ts submitScore 의 주석) */}
      {sent === "done" ? (
        <p className="mt-6 text-center text-[14px] font-bold text-success">
          순위표에 올렸어요.
        </p>
      ) : (
        <>
          <button
            onClick={() => void send()}
            disabled={sent === "sending"}
            className="mt-6 h-14 w-full rounded-full bg-surface text-[16px] font-bold text-primary-600 shadow-[0_2px_14px_rgba(23,58,94,0.08)] disabled:opacity-40"
          >
            {sent === "sending" ? "올리는 중…" : "순위표에 올리기"}
          </button>
          <p className="mt-2 px-1 text-center text-[12px] leading-relaxed text-ink-faint">
            누르면 <b className="text-ink-sub">닉네임과 점수</b>가 다른 학생에게도 보여요.
            누르지 않으면 이 기기에만 남아요.
          </p>
          {typeof sent === "string" && sent !== "idle" && sent !== "sending" && (
            <p className="mt-2 text-center text-[13px] text-danger">{sent}</p>
          )}
        </>
      )}

      {misses.length > 0 && (
        <>
          <SectionHead title="놓친 개념" action={`${misses.length}개`} />
          <div className="flex flex-col gap-2">
            {misses.map((p, i) => (
              <ListCard
                key={`${p.conceptId}-${i}`}
                href={`/concepts/${p.conceptId}`}
                meta={p.given.trim() ? [`친 것: ${p.given.trim()}`] : ["시간 초과"]}
                title={p.term}
                right={<span className="text-[13px] font-bold text-primary-600">카드 열기 →</span>}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-8 flex gap-2">
        <Link
          href="/map/arcade"
          className="flex h-14 flex-1 items-center justify-center rounded-full bg-surface text-[16px] font-bold text-ink-sub shadow-[0_2px_14px_rgba(23,58,94,0.06)]"
        >
          로비로
        </Link>
        {/* 같은 주소로 다시 들어가면 컴포넌트가 새로 서면서 투구를 다시 뽑는다 */}
        <button
          onClick={onAgain}
          className="h-14 flex-1 rounded-full bg-primary-500 text-[16px] font-bold text-white shadow-cta"
        >
          한 판 더
        </button>
      </div>
    </main>
  );
}
