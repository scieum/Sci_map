# ⚠️ 금지 라이브러리·데이터 소스 (textbook-parser)

`Sci_Map_에이전트_설계서.md` R11 / §6.2, `CLAUDE.md` §8 에서 확정된 목록이다.
코드·문서·주석 어디에도 금지 항목을 등장시키지 않는다.

| 금지 | 이유 | 대체 |
|------|------|------|
| **PyMuPDF (`fitz` / `pymupdf`)** | AGPL/상용 이중 라이선스. 산출물이 서비스로 나가므로 AGPL 전염 위험 | **pypdfium2** (Apache-2.0) + **pdfplumber** (MIT) |
| 유료 PDF·OCR API | R12 무료 운영 원칙 | `ocrmypdf` / Tesseract (로컬) |
| 시중 문제집·해설 | 저작권 | 카드 관계 명제를 인용해 자체 작성 |

## 허용 스택

| 용도 | 라이브러리 | 라이선스 |
|------|-----------|---------|
| 텍스트·레이아웃 박스 추출 | `pdfplumber` | MIT |
| 렌더링·독립 추출 교차검증·크롭 원본 | `pypdfium2` | Apache-2.0 |
| 이미지 처리 | `Pillow` | MIT-CMU |
| OCR 경로 (R10) | `ocrmypdf`, `tesseract` | MPL-2.0 / Apache-2.0 |

## 의존성 설치

프로젝트가 OneDrive 동기화 폴더에 있어 가상환경을 리포 밖에 둔다.

```
python3 -m venv ~/.venvs/scimap
~/.venvs/scimap/bin/pip install -r requirements.txt
```

## 자체 점검

`scripts/check_licenses.py` 가 리포 전체에서 금지 임포트를 찾는다. C0 진입 시 자동 실행된다.
