# Sci_Map 인수인계 — 다음에 할 일

> 작성 2026-09-05. 이 문서는 **다른 컴퓨터에서 이어서 작업**하기 위한 것이다.
> 설계서(`Sci_Map_에이전트_설계서.md`)가 원본이고, 이 문서는 진행 상황과 다음 순서만 적는다.

---

## 0. 새 컴퓨터에서 먼저 할 일

```bash
# 1) 파이썬 가상환경 — 리포가 OneDrive 동기화 폴더 안이라 밖에 만든다
python3 -m venv ~/.venvs/scimap
~/.venvs/scimap/bin/pip install -r requirements.txt

# 2) 앱 의존성 — node_modules 도 동기화 폴더 밖에 둔다 (아래 §5 참조)
mkdir -p ~/.node-stores/scimap-app
cd app && ln -s ~/.node-stores/scimap-app node_modules && npm install

# 3) C0 가 그대로 도는지 확인 (전부 통과해야 한다)
cd ..
V=~/.venvs/scimap/bin/python
$V .claude/skills/textbook-parser/scripts/check_licenses.py
$V .claude/skills/textbook-parser/scripts/split_unit.py mate-1
$V .claude/skills/textbook-parser/scripts/extract_text.py mate-1
```

기대값: 금지 임포트 0건 / 단원 경계 확정 / `36쪽 · 27,111자 · 블록 1,076 · 그림 후보 143`

### ⚠️ 이 맥에서 막힌 것 — 새 컴퓨터에서는 확인부터

부팅 디스크가 가득 차 Bash 가 `ENOSPC` 로 멎었다. 값이 모순적이었다:
`228Gi 전체 / 18Gi 사용 / 46Mi 남음 / 100%`. OneDrive 폴더는 368MB 뿐이라 **범인이 아니다.**
APFS 로컬 스냅샷·다른 볼륨·purgeable 공간을 의심한다. 새 컴퓨터에서는 `df -h /` 부터 본다.

---

## 1. 지금까지 끝난 것

### C0 교과서 전처리 — **완주**

| 항목 | 결과 |
|---|---|
| 텍스트 레이어 | 있음. 추출률 **95.8%** (기준 95%) → OCR 불필요 |
| 단원 경계 | `mate-1`~`mate-4` **전부 본문 대조 확정**. 인쇄쪽수 == PDF쪽수 |
| 원문 추출 | `output/source/mate-1/{text.jsonl, layout.json, figures.json}` |

`.claude/skills/textbook-parser/` — SKILL.md + `_common.py` `check_licenses.py`
`detect_layer.py` `split_unit.py` `extract_text.py` `ocr.py`

### 0차 공용 자산 — **절반**

| 자산 | 상태 |
|---|---|
| `.claude/skills/curriculum-mapper/` | ✅ SKILL.md + `extract_standards.py` + `validate_tags.py` |
| └ `references/standards.yaml` | ✅ 성취기준 **14건**(12물에 전체), 교차 대조 11건 일치 |
| `.claude/skills/typeability-check/` | ✅ SKILL.md + `normalize.py` `hangul.py` `check_typeable.py` |
| `docs/homonyms.yaml` | ✅ 금지쌍 6개 (주기·핵·전위·일·계·상) |
| `docs/unit_backlog.yaml` | ✅ 4대단원 / 8중단원 / 21소단원 |
| `docs/naming_policy.md` | ❌ **미작성** |
| `docs/concept_registry.yaml` | ❌ **미작성** |
| `.claude/skills/term-lexicon/` | ❌ **미작성** |
| Supabase `students`·`study_states` | ❌ **미작성** |

---

## 2. 다음에 할 일 — 순서대로

### ■ 0차 마무리 (남은 4건)

**① `docs/naming_policy.md`** — 표기 정책 (R6·R7·R8)
- 현행 표기를 표제어로 고정, 구표기는 `aliases` 로 **검색만** 허용 (오답도 정답도 아니고 안내만)
- 소듐○/나트륨✕, 뷰테인○/부탄✕ 류의 신구 표기 대응 규칙
- ⚠️ **낱말 목록을 내 기억으로 쓰지 말 것.** 최종 근거는 **대한화학회 화학술어집**이다.
  정책(규칙)만 문서에 적고, 실제 대조는 `term-lexicon` 이 하게 한다
- `hanja` 가 없는 음차어(이온·에너지·엔트로피)는 `null` 이 아니라 `"해당 없음"` + `hanja_note` 에 사유

**② `docs/concept_registry.yaml`** — 개념 키 사전
- ★ **빈 상태로 시작하는 것이 맞다.** 키는 G3 사람 게이트를 거쳐서만 등록된다 (CLAUDE.md §9-3)
- 파일에는 스키마·등록 규칙·예시(주석)만 넣고 `concepts: {}` 로 둔다
- `concept:vapor-pressure` 꼴. 학년·과목이 달라도 같은 개념이면 같은 키 — 이것이 `same` 링크의 씨앗

**③ `.claude/skills/term-lexicon/`** — 한자어·영어 대조 (C3)
- `scripts/stdict.py` 표준국어대사전 오픈API — ⚠️ **API 키 발급 필요**(stdict.korean.go.kr). 키 없으면 skip+로그
- `scripts/kcs_term.py` 대한화학회 화학술어 대조
- `scripts/hanja_gloss.py` 한자 훈음 (글자 수 == 훈음 항목 수 검사)
- 외부 조회 실패는 **스킵 + 로그**. 단 **단원 내 스킵률 30% 초과 시 에스컬레이션** (§4.3 C3)

**④ Supabase 스키마** — `students`, `study_states` (§7.5)
- ★계열 공용. 노선 완주가 개념 카드 FSRS 상태에 반영되는 접점이다
- `students`: 초대 코드 가입, **학번 별칭**(실명 금지, R13)
- `study_states`: **개념 카드 단위** FSRS 상태. 적응형 출제는 **py-fsrs(MIT)**
- RLS 필수. `access_grants` 는 `restricted` 자산에만 작용

### ■ 1차 개념 파이프라인 C1~C9 (`mate-1` 한 바퀴)

★ **전 단원 동시 착수 금지.** `mate-1` 이 C9 까지 완주한 뒤 `mate-2` 로 간다.

| 단계 | 담당 | 산출물 | 비고 |
|---|---|---|---|
| **C1** 개념 추출 | `textbook-analyst` 서브에이전트 | `output/concepts/mate-1.candidates.json` | 개념 10~30개, 위계 순환 없음 |
| **C2** 카드 작성 | `concept-writer` | `<concept-id>.draft.json` | 관계 명제마다 `condition`·`scope` **필수** |
| **C3** 용어 대조 | 코드 (`term-lexicon`) | `report.json` notation 절 | fail 0건 |
| **C4** 스키마·원문 유사도 | 코드 | `report.json` form 절 | **연속 12어절 일치 = fail** |
| **C5** 범위 태깅 | `fact-validator` + `curriculum-mapper` | curriculum 절 | 전 카드 성취기준 ≥ 1 |
| **C6** 명제 자기 검증 | `fact-validator` | relation 절 | 진위 판정 아님, **결함 탐지만** |
| **C7** 시각자료·권리 | 코드 + LLM | `output/media/`, `rights/ledger.jsonl` | 단원당 크롭 **≤ 8장** |
| **C8** 검토 패키지 | 코드 + **★사람** | `mate-1.review.md` | **우회 절대 금지** |
| **C9** 배포 | 코드 | `manifest.json` | 실패 시 재시도 금지, 즉시 에스컬레이션 |

C1 을 시작하려면 `.claude/agents/textbook-analyst/AGENT.md` 를 먼저 써야 한다 (아직 없다).
서브에이전트에는 **파일 경로만 전달**한다 — 원문을 프롬프트에 붙여넣지 않는다 (CLAUDE.md §4).

---

## 3. ★ 사람이 결정해야 할 것

### ① 성취기준 3건 확정 — C5 전에 반드시

`references/standards.yaml` 을 만들 때 지도서 두 판본(총론 내용 체계 표 / 각론 평가 자료)을
대조했더니 3건이 갈렸다. **NCIC 원문으로 확정해야 한다.** 확정 전에는 `validate_tags.py` 가
태깅을 막는다.

| 코드 | 총론 (16~19쪽) | 각론 | 판단 |
|---|---|---|---|
| `12물에02-02` | 증기**압** | 증기 **압력** (166쪽) | 실제 판본 차이. 원문 확인 필요 |
| `12물에03-02` | **측**정하기 어려운 | 정하기 어려운 (182쪽) | 각론 쪽 추출 결함으로 보이나 확인 필요 |
| `12물에04-04` | — | 짝 없음 | 미대조 |

확정 후 `standards.yaml` 의 `crosscheck` 를 `일치` 로 바꾸거나, 스크립트를 고쳐 재생성한다.
(이 파일은 **생성물이다.** 손으로 고치지 말고 `extract_standards.py` 를 고치는 쪽이 맞다.)

### ② 착수 순서 이탈 — 이미 합의됨, 기록만

설계서 §9 의 1차는 화학 `물질의 구조와 성질` 이고 물질과 에너지는 6차다. 그러나
inbox 에 화학 교과서가 없고, 1차 선정 사유였던 "관계 명제가 선명한 단원"(증기 압력·분자 간 힘)이
이 교과서 `mate-1`·`mate-2` 에 그대로 있어 **물질과 에너지를 1차 파일럿으로 대체**했다.
6차의 전제였던 성취기준 코드 확정은 지도서에서 충족됐다. 근거는 `docs/unit_backlog.yaml` 머리말에도 적혀 있다.

---

## 4. 이 교과서·판형에서 확인된 것

판형이 다른 교과서를 넣으면 **아래 가정부터 다시 확인한다.**

- **인쇄 쪽수 == PDF 쪽수** (1-base). `split_unit.py` 가 쪽마다 검증한다
- **2단 판형** — 본문 단 옆에 곁주 단이 있다. 글자 좌표만 보고 위→아래로 읽으면
  본문 문장 사이에 곁주가 끼어들어 문장이 끊긴다. pdfminer 레이아웃 분석(`line_margin=1.0`)이
  단을 가르고 읽기 순서까지 잡는다. 1.4 로 올리면 곁주끼리 들러붙고, 0.5 로 내리면 문단이 줄마다 쪼개진다
- **띄어쓰기 자리에 U+00AD(소프트 하이픈)** 를 쓰는 블록이 있다 (mate-1 본문의 6.7%).
  그냥 지우면 낱말이 들러붙는다 → 공백으로 바꾼다
- **줄 끝 공백이 낱말 경계를 알려 준다.** 낱말 경계에서 접힌 줄은 끝에 공백이 남고
  (`'무극성 '` + `'분자로'`), 낱말 도중에 접힌 줄은 남지 않는다 (`'끌어당'` + `'기는'`).
  **줄바꿈 문자만 빼고 이어 붙이면 원문이 그대로 복원된다.** 이 성질이 성립하지 않는 판형이면
  줄바꿈을 보존하고 대조를 `_common.normalize_for_overlap()` 에 맡기는 쪽으로 되돌린다
- **수식은 깨진다.** 전용 수식 글꼴이 사설 인코딩을 써서 `;27!3;`, `¾`(℃) 로 나온다.
  **카드 정의·관계 명제를 수식 글자열에 기대지 마라.** 필요하면 C7 에서 그림으로 붙인다
- **`ocr.py` 는 미검증 경로다.** 이 교과서는 텍스트 레이어가 있어 타지 않았고 `ocrmypdf`·`tesseract` 도
  설치돼 있지 않았다. 스캔본을 처음 넣을 때 눈으로 확인하고 스크립트 머리말의 경고를 지운다

---

## 5. 환경 함정 — 두 번 물렸다

### OneDrive 동기화 폴더

리포가 `~/Library/CloudStorage/OneDrive-.../Sci_Map` 안에 있다.

1. **클라우드 전용 파일** — `ls -ls` 의 블록 수가 `0` 이면 실체가 없다. OneDrive 본체 앱이
   꺼져 있으면 읽기가 `ETIMEDOUT`(errno 60)으로 실패한다.
   `pgrep -f "OneDrive.app/Contents/MacOS/OneDrive"` 로 확인하고 없으면 `open -a OneDrive`
2. **동기화 충돌 개명** — 같은 파일을 빠르게 여러 번 저장하면 OneDrive 가
   `_common.py` → `_common-iMac.py` 로 이름을 바꿔 버린다. **임포트가 조용히 깨진다.**
   증상이 `ModuleNotFoundError` 인데 파일은 있어 보이면 `ls` 로 실제 이름부터 본다
3. **앱 소스 유실** — `package.json`, `src/app/{layout.tsx,page.tsx,globals.css}` 가
   작업 트리에서 사라진 적이 있다. 커밋에는 남아 있어 `git checkout --` 로 복원했다.
   `.git/index.lock` 잔여 파일도 함께 지웠다(0바이트, 실행 중 git 없음)

**그래서 무거운 산출물은 동기화 폴더 밖에 둔다:**

| 대상 | 위치 |
|---|---|
| 파이썬 가상환경 | `~/.venvs/scimap` |
| `app/node_modules` | `~/.node-stores/scimap-app` (심링크로 연결) |

### 금지 라이브러리

**PyMuPDF 금지** — AGPL/상용 이중 라이선스, 산출물이 서비스로 나간다 (R11).
`pypdfium2`(Apache-2.0) + `pdfplumber`(MIT) 만 쓴다.
`check_licenses.py` 가 리포 전체를 훑어 막는다. C0 진입 시 자동 실행된다.

### YAML 함정

키에 `no:` 를 쓰면 YAML 1.1 에서 **불리언 `false`** 로 읽힌다.
`unit_backlog.yaml` 이 `numeral:` 을 쓰는 이유다.
값에 `: ` 가 들어가면 파싱이 깨진다 — YAML 은 손으로 조립하지 말고 `yaml.safe_dump` 로 만든다.

---

## 6. 앱 (`app/`) 현황

Next.js 16.3.4 + React 19.2.8 + Tailwind 4, App Router. **아직 스캐폴드다.**
`src/app/{map,concepts,items,lines}` 는 빈 디렉터리 — 5탭 화면이 없다.

- `node_modules` 는 심링크만 걸려 있고 **`npm install` 이 필요하다**
- UI/UX 는 `Design.md` 를 따른다: 의미 토큰(`--primary-*`)만 사용, 화면당 CTA 하나,
  3단계 인출 모드, `restricted` 자산은 **자산 단위 잠금**(카드 전체를 막지 않는다)
- 앱 작업은 콘텐츠 파이프라인이 C9 까지 한 바퀴 돈 뒤가 순서상 맞다.
  먼저 띄워 보고 싶으면 `npm install && npm run dev` 로 기본 페이지만 확인한다

---

## 7. 한 줄 요약

**0차 남은 4건**(naming_policy · concept_registry · term-lexicon · Supabase 스키마)
**→ 성취기준 3건 사람 확정 → `textbook-analyst` AGENT.md 작성 → C1 착수.**
