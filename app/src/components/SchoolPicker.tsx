"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SCHOOL_KINDS,
  SIDO,
  fetchSchools,
  sigunguList,
  type School,
  type SchoolKind,
} from "@/lib/neis";

/**
 * 학교 고르기 — 시도(대분류) → 시군구(소분류) → 학교급 → 학교.
 * 예: 강원 → 속초시 → 고등학교 → 속초고등학교
 *
 * 시군구 목록을 만들려면 학교 목록이 먼저 있어야 한다(NEIS 에 시군구 필드가
 * 없어 주소에서 뽑는다). 그래서 시도를 고르는 순간 그 시도의 중·고를 한 번에
 * 받아 두고, 그다음 단계는 전부 받아 둔 목록을 걸러 보여 준다 — 단계마다
 * 기다리게 하지 않으려는 것이다. 시도별로 캐시하므로 되돌아가도 다시 받지 않는다.
 */

export interface SchoolValue {
  sido_code: string;
  sido: string;
  sigungu: string;
  school_kind: string;
  school_code: string;
  school_name: string;
}

const cache = new Map<string, School[]>();

export default function SchoolPicker({
  value,
  onChange,
}: {
  value: SchoolValue | null;
  onChange: (v: SchoolValue | null) => void;
}) {
  const [sidoCode, setSidoCode] = useState(value?.sido_code ?? "");
  const [sigungu, setSigungu] = useState(value?.sigungu ?? "");
  const [kind, setKind] = useState<SchoolKind | "">(
    (value?.school_kind as SchoolKind) ?? "",
  );
  const [schools, setSchools] = useState<School[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // 시도가 정해지면 그 시도의 중·고를 한 번에 받아 둔다
  useEffect(() => {
    if (!sidoCode) {
      setSchools([]);
      return;
    }
    const cached = cache.get(sidoCode);
    if (cached) {
      setSchools(cached);
      return;
    }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const lists = await Promise.all(
          SCHOOL_KINDS.map((k) => fetchSchools(sidoCode, k, ac.signal)),
        );
        const all = lists.flat();
        cache.set(sidoCode, all);
        if (!ac.signal.aborted) setSchools(all);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError("학교 목록을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.");
        }
      } finally {
        if (!ac.signal.aborted) setBusy(false);
      }
    })();
    return () => ac.abort();
  }, [sidoCode]);

  const sigungus = useMemo(() => sigunguList(schools), [schools]);
  const matches = useMemo(
    () =>
      schools
        .filter((s) => (sigungu ? s.sigungu === sigungu : false))
        .filter((s) => (kind ? s.kind === kind : true))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [schools, sigungu, kind],
  );

  function pick(s: School) {
    onChange({
      sido_code: sidoCode,
      sido: s.sidoName || SIDO.find((x) => x.code === sidoCode)?.name || "",
      sigungu: s.sigungu,
      school_kind: s.kind,
      school_code: s.code,
      school_name: s.name,
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-[20px] bg-primary-50 px-4 py-3 ring-2 ring-primary-500">
        <span>
          <span className="block text-[15px] font-bold">{value.school_name}</span>
          <span className="block text-[12px] text-ink-sub">
            {value.sido} · {value.sigungu} · {value.school_kind}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-[13px] font-semibold text-primary-600"
        >
          다시 고르기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Step n={1} label="지역">
        <Chips
          items={SIDO.map((s) => ({ key: s.code, label: s.name }))}
          on={sidoCode}
          onPick={(k) => {
            setSidoCode(k);
            setSigungu("");
          }}
        />
      </Step>

      {sidoCode && (
        <Step n={2} label="시·군·구">
          {busy ? (
            <p className="px-1 py-2 text-[13px] text-ink-faint">학교 목록을 불러오는 중…</p>
          ) : error ? (
            <p className="px-1 py-2 text-[13px] text-danger">{error}</p>
          ) : (
            <Chips
              items={sigungus.map((s) => ({ key: s, label: s }))}
              on={sigungu}
              onPick={setSigungu}
            />
          )}
        </Step>
      )}

      {sigungu && (
        <Step n={3} label="학교급">
          <Chips
            items={SCHOOL_KINDS.map((k) => ({ key: k, label: k }))}
            on={kind}
            onPick={(k) => setKind(k as SchoolKind)}
          />
        </Step>
      )}

      {sigungu && kind && (
        <Step n={4} label="학교">
          {matches.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-ink-faint">
              이 조건에 맞는 학교가 없어요. 위 단계를 다시 골라 주세요.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-[16px] bg-bg-subtle p-1">
              {matches.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => pick(s)}
                  className="block w-full rounded-[12px] px-3 py-2.5 text-left active:bg-primary-50"
                >
                  <span className="block text-[14px] font-semibold">{s.name}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{s.address}</span>
                </button>
              ))}
            </div>
          )}
        </Step>
      )}
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[12px] font-bold text-ink-sub">
        <span className="mr-1 text-primary-600">{n}</span>
        {label}
      </p>
      {children}
    </div>
  );
}

function Chips({
  items,
  on,
  onPick,
}: {
  items: { key: string; label: string }[];
  on: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
            on === it.key
              ? "bg-primary-500 text-white"
              : "bg-bg-subtle text-ink-sub active:bg-primary-50"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
