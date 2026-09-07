"use client";

/**
 * 학교 목록 — 빌드 때 만들어 둔 정적 파일을 읽는다.
 *
 * NEIS 를 브라우저에서 직접 부르지 않는다. **인증키 없이는 시도당 5건만 오기
 * 때문이다** — pIndex 를 올려도 같은 5건이 돌아온다(강원 중학교 160개 중 5개만
 * 나오는 것을 확인했다). 키가 있어야 하는데, 키를 브라우저에 내보내면 아무나 그
 * 할당량을 쓰게 된다. 그래서 목록은 `app/scripts/build_schools.py` 가 빌드하는
 * 사람의 컴퓨터에서 한 번 만들어 `public/schools/<시도코드>.json` 에 둔다.
 *
 * 학교 목록은 거의 바뀌지 않으므로 이 편이 빠르기도 하다.
 */

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
  code: string;
  name: string;
  kind: string;
  sigungu: string;
  sido: string;
  address: string;
}

/** 목록 파일이 아직 없을 때 던진다 — 화면은 직접 입력으로 물러난다 */
export class SchoolListMissing extends Error {
  constructor(readonly sidoCode: string) {
    super(`학교 목록 파일이 없어요 (${sidoCode})`);
    this.name = "SchoolListMissing";
  }
}

const cache = new Map<string, School[]>();

export async function loadSchools(
  sidoCode: string,
  signal?: AbortSignal,
): Promise<School[]> {
  const hit = cache.get(sidoCode);
  if (hit) return hit;
  const res = await fetch(`/schools/${sidoCode}.json`, { signal });
  if (res.status === 404) throw new SchoolListMissing(sidoCode);
  if (!res.ok) throw new Error(`학교 목록을 불러오지 못했어요 (${res.status})`);
  const list = (await res.json()) as School[];
  cache.set(sidoCode, list);
  return list;
}

/** 목록에서 시군구만 추려 가나다순으로 — 소분류 선택지 */
export function sigunguList(schools: School[]): string[] {
  return Array.from(new Set(schools.map((s) => s.sigungu).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "ko"),
  );
}
