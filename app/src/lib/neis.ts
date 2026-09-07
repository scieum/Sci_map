"use client";

/**
 * NEIS 학교 기본정보 — 시도(대분류) · 시군구(소분류) · 학교급으로 학교를 고른다.
 *
 * 공공데이터라 키 없이도 저용량 호출이 된다(scieum/polarity-timeattack 에서
 * 같은 방식으로 쓰고 있다). 키가 생기면 NEXT_PUBLIC_NEIS_KEY 에 넣으면 된다.
 *
 * ★ 시군구는 NEIS 에 전용 필드가 없다. 도로명주소(ORG_RDNMA)의 두 번째 토막이
 *   시군구라서 거기서 뽑는다 — "강원특별자치도 속초시 …" → "속초시".
 *   광역시의 구(區)도 같은 자리에 온다 — "서울특별시 종로구 …" → "종로구".
 */

const ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const KEY = process.env.NEXT_PUBLIC_NEIS_KEY ?? "";

/** 학교급 — 중·고만 쓴다 (2026-09-07 교사 결정) */
export const SCHOOL_KINDS = ["중학교", "고등학교"] as const;
export type SchoolKind = (typeof SCHOOL_KINDS)[number];

/** 시도교육청 코드 — NEIS ATPT_OFCDC_SC_CODE */
export const SIDO = [
  { code: "B10", name: "서울" },
  { code: "C10", name: "부산" },
  { code: "D10", name: "대구" },
  { code: "E10", name: "인천" },
  { code: "F10", name: "광주" },
  { code: "G10", name: "대전" },
  { code: "H10", name: "울산" },
  { code: "I10", name: "세종" },
  { code: "J10", name: "경기" },
  { code: "K10", name: "강원" },
  { code: "M10", name: "충북" },
  { code: "N10", name: "충남" },
  { code: "P10", name: "전북" },
  { code: "Q10", name: "전남" },
  { code: "R10", name: "경북" },
  { code: "S10", name: "경남" },
  { code: "T10", name: "제주" },
] as const;

export interface School {
  code: string;      // SD_SCHUL_CODE
  name: string;      // SCHUL_NM
  kind: string;      // SCHUL_KND_SC_NM
  address: string;   // ORG_RDNMA
  sidoName: string;  // LCTN_SC_NM (강원특별자치도)
  sigungu: string;   // 주소에서 뽑은 시군구
}

interface NeisRow {
  SD_SCHUL_CODE?: string;
  SCHUL_NM?: string;
  SCHUL_KND_SC_NM?: string;
  ORG_RDNMA?: string;
  LCTN_SC_NM?: string;
}

/** "강원특별자치도 속초시 청대로 100" → "속초시" */
export function sigunguOf(address: string): string {
  const parts = (address || "").trim().split(/\s+/);
  if (parts.length < 2) return "";
  const second = parts[1];
  // 광역시의 "OO구", 도의 "OO시/OO군" 이 이 자리에 온다. 세종처럼 시군구가
  // 없는 곳은 두 번째 토막이 도로명이라, 시·군·구로 끝날 때만 인정한다
  return /[시군구]$/.test(second) ? second : "";
}

/**
 * 한 시도·학교급의 학교를 모두 가져온다.
 *
 * NEIS 는 한 번에 최대 1000행을 준다. 시도 하나의 중학교·고등학교는 그 안에
 * 들어가지만, 경기처럼 큰 곳은 넘칠 수 있어 다음 쪽을 이어 받는다.
 */
export async function fetchSchools(
  sidoCode: string,
  kind: SchoolKind,
  signal?: AbortSignal,
): Promise<School[]> {
  const out: School[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("Type", "json");
    url.searchParams.set("pIndex", String(page));
    url.searchParams.set("pSize", "1000");
    url.searchParams.set("ATPT_OFCDC_SC_CODE", sidoCode);
    url.searchParams.set("SCHUL_KND_SC_NM", kind);
    if (KEY) url.searchParams.set("KEY", KEY);

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) throw new Error(`학교 목록을 불러오지 못했어요 (${res.status})`);
    const json = (await res.json()) as {
      schoolInfo?: [unknown, { row?: NeisRow[] }];
      RESULT?: { CODE?: string; MESSAGE?: string };
    };

    // 결과가 없을 때 NEIS 는 schoolInfo 대신 RESULT 만 준다 (INFO-200)
    const rows = json.schoolInfo?.[1]?.row;
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const address = r.ORG_RDNMA ?? "";
      out.push({
        code: r.SD_SCHUL_CODE ?? "",
        name: r.SCHUL_NM ?? "",
        kind: r.SCHUL_KND_SC_NM ?? kind,
        address,
        sidoName: r.LCTN_SC_NM ?? "",
        sigungu: sigunguOf(address),
      });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

/** 목록에서 시군구만 추려 가나다순으로 — 소분류 선택지 */
export function sigunguList(schools: School[]): string[] {
  return Array.from(new Set(schools.map((s) => s.sigungu).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "ko"),
  );
}
