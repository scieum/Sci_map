# 앱 인터페이스 계약

파이프라인과 앱의 **유일한 접점**이다. 앱은 아래 스키마를 따르는 데이터만 소비하고,
스키마 변경은 버전 발급을 동반한다.

## 1. 스키마

`/.claude/skills/concept-schema/references/` 아래 8종.

| 스키마 | 소비처 |
|---|---|
| `concept.schema.json` | 개념 탭 카드 화면 |
| `link.schema.json` · `graph.schema.json` | 지도 탭 |
| `item.schema.json` | 문제 탭 |
| `quiz.schema.json` | 오늘 탭 |
| `media.schema.json` | 모든 시각자산 (`access_tier` 분기) |
| `report.schema.json` | 검증 리포트 (앱 비소비) |
| `manifest.schema.json` | 배포 기록 (앱 비소비) |

## 2. 테이블

| 테이블 | 역할 | 공개 |
|---|---|---|
| `concepts` | 개념 카드 본문 | 공개 |
| `concept_links` | 개념 링크 | 공개 |
| `media_assets` | 시각자료 메타 | `access_tier` 로 분기 |
| `items` | 기출 문항 | 메타 공개 / **이미지 restricted** |
| `quiz_items` | 데일리 문항 풀 | `quiz_ready` 파생분만 |
| `courses` · `network` · `runs` | 노선 계열 | 공개 |
| `students` | 학생 계정 (초대 코드, 학번 별칭) | 계열 공용 |
| `study_states` | **개념 카드 단위** FSRS 상태 | 계열 공용 |
| `attempts` | 응답 기록 (선택지 분포 포함) | — |
| `daily_sets` | 일자별 출제 세트 | — |
| `access_grants` | 열람 권한·만료일 | `restricted` 자산에만 작용 |

`study_states`가 **개념 카드 단위**인 것이 계열 통합의 실체다. 노선을 완주한 학생이
같은 개념의 카드에서 신규 취급을 받으면 한 앱에 둘 이유가 없다.

## 3. 현재 구현 상태

| 화면 | 구현 | 데이터 출처 |
|---|---|---|
| 개념 탭 — 과목·단원 트리 | **구현됨** | `docs/curriculum/integrated_science.yaml` + `docs/unit_backlog.yaml` |
| 개념 탭 — 카드 화면 | 미구현 | `concepts` (배포된 카드 없음) |
| 지도 · 오늘 · 문제 · 노선 | 빈 상태 화면만 | 각 파이프라인 산출물 없음 |

앱은 아직 Supabase에 붙지 않는다. 단원 트리는 `/docs`를 투영한 정적 JSON
(`app/src/data/curriculum.json`)에서 읽으며, `app/scripts/sync_curriculum.py`가 갱신한다.
이 JSON은 생성물이므로 직접 고치지 않는다.

## 4. 앱이 지켜야 하는 저작권 요건

`restricted` 자산에 한정한다. 카드 본문은 막지 않는다.

| 요건 | 구현 |
|---|---|
| 접근제한 | Auth + 초대 코드 + RLS. 비로그인 접근 0, 검색엔진 색인 차단 |
| 복제방지 | 비공개 버킷 + 단시간 서명 URL. 다운로드·우클릭 저장·인쇄 차단 |
| 경고문구 | 자산 하단 상시 노출 |
| 출처 표기 | `media.rights.source` 자동 렌더 |
| 대상 한정 | `access_grants` 만료일 |

`restricted` 자산이 붙은 카드를 비로그인 사용자가 열면 **본문은 보이고 그림 자리만 잠긴다**.
