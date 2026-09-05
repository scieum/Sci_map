---
name: concept-schema
description: 개념 계열 산출물의 스키마와 결정론적 검증. C1 후보 목록(개수·중복·순환·사전 대조)과 앞으로의 C4 카드 검증을 담당한다. candidates.json 이나 draft.json 을 만든 직후, 다음 단계로 넘기기 전에 쓴다.
---

# concept-schema — 개념 계열 스키마·결정론적 검증

여기서 하는 일은 **형식 판정뿐이다.** 과학적 진위는 사람이 본다 (C8).
스크립트가 형식, LLM이 정성, 사람이 진위 — 이 경계를 넘지 않는다 (설계서 §3.1).

## 무엇이 들어 있나

| 파일 | 대상 | 단계 |
|---|---|---|
| `references/candidates.schema.json` | C1 개념 후보 목록 | C1 |
| `scripts/validate_candidates.py` | 위 스키마 + 성공 기준 검사 | C1 |

`concept.schema.json` 과 C4 검증기(`validate.py`·`refcheck.py`·`cycle.py`·`dedupe.py`)는
**아직 없다.** C2 착수 시 만든다. 없는 파일을 있는 척 참조하지 마라.

## 실행

```bash
python .claude/skills/concept-schema/scripts/validate_candidates.py output/concepts/mate-1.candidates.json
python .claude/skills/concept-schema/scripts/validate_candidates.py output/concepts/mate-1.candidates.json --json
```

종료 코드: `0` pass · `1` fail · `2` 입력 오류.
`--json` 은 `output/validation/<unit-id>.report.json` 에 넣을 수 있는 형태로 나온다.

> 리포가 OneDrive 폴더 안에 있어 가상환경은 리포 밖에 둔다(requirements.txt).
> 현재 기기에는 `~/.venvs/scimap` 이 없어 시스템 파이썬(3.13)으로 돌아간다.
> 필요한 것은 `PyYAML`·`jsonschema` 뿐이다.

## validate_candidates.py 가 보는 것

설계서 §4.3 의 C1 성공 기준을 그대로 옮겼다. 순서는 실패했을 때 원인이 빨리 드러나는 순이다.

| 검사 | 판정 | 근거 |
|---|---|---|
| `schema` | fail | candidates.schema.json |
| `count` | fail | 단원당 개념 10~30 |
| `term_unique_in_unit` / `id_unique` / `concept_key_unique_in_unit` | fail | 단원 내 중복 0 |
| `term_vs_existing_cards` | fail | 기존 카드와 표제어가 겹치면 `same_candidate` 가 있어야 한다 |
| `hierarchy_refs` / `hierarchy_no_self_loop` / `hierarchy_acyclic` | fail | 위계 그래프에 순환 없음 |
| `curriculum_codes_exist` | fail | 코드 환각·오타 차단 |
| `registry_reused_exists` | fail | `reused` 인데 사전에 없는 키 = 거짓 재사용 |
| `homonym_flagged` | fail | 금지쌍 표기인데 플래그가 없음 |
| `evidence_refs` | fail | 원문에 없는 페이지·블록을 가리킴 = 환각 |
| `pages_in_unit` | fail | 단원 페이지 범위 이탈 |
| `hierarchy_isolated` · `registry_new_keys` · `curriculum_crosscheck` · `curriculum_coverage` | warn | 사람이 볼 것 |

### 왜 `evidence` 를 강제하나

C1 은 LLM 단계다. 개념 후보를 **지어내는 것**이 가장 흔한 실패 모드다.
`evidence` 는 그 후보가 교과서 어느 블록에서 나왔는지를 `block_id` 로 가리키게 하고,
스크립트가 그 `block_id` 가 `text.jsonl` 에 실재하는지 대조한다.
없는 블록을 가리키면 fail — 환각이 여기서 걸린다.

`hint` 는 **40자 상한**이다. 원문을 옮겨 적는 통로로 쓰지 마라
(`/output/source/` 는 배포 대상이 아니다 — CLAUDE.md §9.4).

### 왜 `registry_status` 를 강제하나

`reused` 는 "이 키가 `concept_registry.yaml` 에 실재한다"는 주장이다.
주장이 틀리면 `same` 링크가 허공에 걸린다. 그래서 스크립트가 대조한다.
`new` 는 주장이 아니라 제안이다 — **G3 사람 게이트 전까지 링크로 쓰지 않는다.**

## 실패했을 때

설계서 §4.3 C1: **자동 재시도 최대 2회**(사유 첨부) → 초과 시 에스컬레이션.
재시도할 때는 `--json` 결과의 실패 항목만 프롬프트에 넣는다. 전체 재생성이 아니라
**해당 항목만 고치게** 한다.

모든 재시도·스킵·에스컬레이션은 `output/logs/pipeline.jsonl` 에 남긴다 (CLAUDE.md §12).
