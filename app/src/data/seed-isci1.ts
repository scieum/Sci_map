import type { Concept } from "@/lib/types";

/**
 * 통합과학1 연계 카드 1장 — **손으로 만든 시드다.** 파이프라인 산출물이 아니다.
 *
 * 남겨 둔 이유: `same` 링크(학년·과목을 넘는 연결)가 이 앱의 존재 이유인데,
 * 통합과학1 단원이 파이프라인을 돌기 전까지는 보여 줄 카드가 없다.
 * 3차 착수(통합과학1 추가)에서 실제 카드로 교체한다.
 */
export const SEED_ISCI1: Concept[] = [
{
    id: "isci1-state-change",
    term: "상태 변화",
    hanja: "狀態變化",
    hanjaGloss: "狀 형상 상 · 態 모습 태 · 變 변할 변 · 化 될 화",
    english: "change of state",
    definition:
      "물질이 고체·액체·기체 사이에서 모습을 바꾸는 현상으로, 분자 배열과 분자 사이 거리가 달라지는 변화",
    relations: [
      {
        id: "rel-sc-01",
        text: "순수한 물질이 상태 변화하는 동안 온도는 일정하게 유지된다",
        condition: "순수한 물질",
        invertible: false,
      },
    ],
    misconceptions: [
      {
        text: "액체가 기화하면 분자 자체의 크기가 커진다",
        whyWrong:
          "달라지는 것은 분자 사이의 거리와 배열이지 분자 자체의 크기가 아니다",
      },
    ],
    links: [
      { type: "same", target: "mate-vapor-pressure", note: "물질과 에너지에서 심화" },
      { type: "same", target: "mate-boiling-point", note: "물질과 에너지에서 심화" },
    ],
    hasRestrictedMedia: false,
    subject: "통합과학1",
    unit: "물질과 규칙성 > 물질의 상태",
  }
,
];
