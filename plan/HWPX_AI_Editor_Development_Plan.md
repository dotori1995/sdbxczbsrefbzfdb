# HWPX AI 자동 편집기 개발 계획서

- 버전: 0.1
- 작성일: 2026-11-16
- 제품 방향: AI-native HWPX Viewer & Editor
- 최우선 요구사항: 결과 HWPX가 한컴 한글에서 정상적으로 열리고, 편집·저장·재개방 가능해야 한다.

## 1. 프로젝트 개요

### 1.1 목표

기존 워드프로세서처럼 사용자가 직접 글자와 서식을 편집하는 제품이 아니다. 사용자는 HWPX를 뷰어에서 열고, 텍스트·문단·표 셀·객체 또는 화면 영역을 선택한 뒤 자연어로 수정 의도를 전달한다. AI는 수정안을 만들고, 사용자가 승인하면 문서 엔진이 원본 HWPX 구조에 변경을 적용한다.

### 1.2 제품 원칙

1. **HWPX가 원본 데이터다.** 자체 포맷을 최종 저장 포맷으로 삼지 않는다.
2. **SVG는 표시 수단이다.** SVG를 다시 HWPX로 역변환하지 않는다.
3. **AI는 편집 명령을 생성한다.** LLM이 ZIP/XML 전체를 직접 재작성하게 하지 않는다.
4. **결정론적 문서 엔진이 수정한다.** 검증된 명령만 XML에 적용한다.
5. **한컴 한글 호환성이 완료 조건이다.** 우리 뷰어에서 보이는 것만으로 성공 판정하지 않는다.
6. **원본을 보존한다.** 원본, 변경 이력, 되돌리기를 지원한다.

### 1.3 MVP 범위

- HWPX 열기 및 구조 분석
- 페이지 단위 SVG 뷰어
- 텍스트 드래그, 문단 선택, 표 셀 선택
- 선택 영역에 대한 AI 수정 요청
- 수정안 미리보기 및 승인/거부
- 제한적 HWPX 패치 및 새 파일 저장
- 한컴 한글 열기/저장/재열기 호환성 테스트

초기에는 HWP 바이너리, DOCX, 완전한 수동 편집기, 모든 HWPX 객체 생성·수정을 제외한다.

## 2. 사용자 경험

### 2.1 기본 흐름

1. 사용자가 `.hwpx`를 업로드한다.
2. 파서가 ZIP 패키지와 XML을 읽고 문서 모델을 구성한다.
3. 렌더러가 페이지별 SVG를 표시한다.
4. 사용자가 텍스트·문단·표 셀·객체를 선택한다.
5. 선택 영역을 원본 XML 요소와 문자 범위에 연결한다.
6. 사용자가 자연어 수정 지시를 입력한다.
7. AI가 문맥을 참고해 구조화된 편집 명령을 반환한다.
8. 명령 검증기가 대상과 전제조건을 확인한다.
9. 편집 엔진이 변경을 적용하고 결과를 재렌더링한다.
10. 사용자가 원본/수정본을 비교하고 승인한다.
11. 새 HWPX를 저장하고 한컴 한글 호환성 검증을 수행한다.

### 2.2 선택 방식

| 방식 | MVP | 설명 |
|---|---:|---|
| 텍스트 드래그 | 필수 | 문자 범위 선택 |
| 문단 선택 | 필수 | 문단 전체 선택 |
| 표 셀 선택 | 필수 | 셀 단위 대상 지정 |
| 표 전체 선택 | 권장 | 표 내용 및 구조 작업 |
| 객체 클릭 | 권장 | 이미지·도형 등의 대상 식별 |
| 사각형 영역 표시 | 후속 | 겹치는 객체를 탐색해 후보 제시 |
| 주석/메모 | 후속 | 특정 노드에 지시 연결 |
| 문서 전체 지시 | 필수 | 전체 교정·문체 통일 등 |

화면 좌표만 AI에 전달하면 안 된다. 좌표는 대상 탐색의 보조 정보이며 실제 수정 대상은 내부 노드 ID와 원본 XML 경로로 식별한다.

### 2.3 선택 데이터 예시

```json
{
  "document_id": "doc_01",
  "target": {
    "kind": "paragraph",
    "node_id": "section0_p103",
    "text_range": {"start": 12, "end": 42},
    "selected_text": "초기 시장 진입 전략을 수립한다."
  },
  "instruction": "사업계획서에 적합한 구체적인 문체로 수정해 줘."
}
```

`node_id`는 애플리케이션 내부 식별자다. HWPX 원본에 존재하는 ID라고 가정하지 않는다. ZIP 엔트리 경로, XML 경로, 문단 인덱스, 원문 해시 등을 조합해 추적한다.

## 3. 기술 아키텍처

```text
HWPX file
   |
   v
ZIP / OPC package reader ---- Original package entry bytes
   |
   v
OWPML XML parser
   |
   v
Document Model -------------------- Selection map
   |                                      |
   v                                      v
SVG renderer --> Viewer UI <------ Interaction layer
                      |
                      v
                AI orchestration
                      |
                      v
              Structured edit plan
                      |
                      v
               Command validator
                      |
                      v
                 Patch engine
                      |
          +-----------+-----------+
          |                       |
     Updated XML parts      Untouched entries
          +-----------+-----------+
                      |
                      v
                 HWPX writer
                      |
                      v
           Structural validation
                      |
                      v
          Hancom compatibility QA
```

### 3.1 기술 후보

| 영역 | 후보 | 평가 포인트 |
|---|---|---|
| Frontend | React + TypeScript | 뷰어 및 상호작용 |
| 렌더링 | SVG DOM | 페이지·객체 표시와 선택 오버레이 |
| ZIP | fflate / JSZip | 브라우저 패키지 처리 |
| XML | fast-xml-parser / DOMParser | 순서·네임스페이스·미지원 요소 보존 |
| 고급 파싱/렌더링 | Rust + WebAssembly | `rhwp` 재사용성 |
| 서버 문서 처리 | Python + lxml | `python-hwpx` 평가 |
| 테스트 | Vitest / Playwright / Python 테스트 | 구조·UI·회귀 테스트 |

기술 스택은 확정안이 아니다. 파서·렌더러 PoC 후 결정한다.

### 3.2 SVG 렌더링 원칙

- 페이지별 SVG 또는 독립 렌더링 트리를 사용한다.
- SVG는 파생된 화면 표현이며 원본 데이터가 아니다.
- 문단·런·표 셀·객체마다 내부 노드 ID를 DOM에 연결한다.
- 문자 단위 선택을 위해 문자 인덱스와 화면 좌표 매핑을 유지한다.
- 글꼴, 크기, 자간, 장평, 줄 간격 등 조판 속성을 모델에 보존한다.
- SVG `<text>`만으로 한글 조판·줄바꿈·문자 선택이 해결된다고 가정하지 않는다.
- 페이지 나눔, 표 분할, 머리말·꼬리말, 각주, 다단은 별도 레이아웃 지원이 필요할 수 있다.
- 선택/주석 레이어는 문서 렌더링 레이어와 분리한다.

## 4. HWPX 호환성 설계

### 4.1 패키지 이해

HWPX는 ZIP 컨테이너 안에 OWPML XML 및 리소스를 담는 형식이다. 대표적으로 `mimetype`, `META-INF/container.xml`, `Contents/content.hpf`, `Contents/header.xml`, `Contents/section*.xml`, `BinData/` 등을 조사한다. 실제 패키지 구성은 문서 종류와 버전에 따라 달라질 수 있으므로 고정된 파일 목록을 가정하지 않는다. 공개 자료로 정리한 구조는 [hwpx-포맷.md](hwpx-포맷.md)다.

### 4.2 원본 보존 전략

권장 방식은 **원본 패키지 보관 + 변경 대상 XML 파트만 제한적으로 수정**하는 것이다.

- ZIP 엔트리 목록과 원본 바이트를 보관한다.
- 알 수 없는 XML 요소·속성·네임스페이스를 파싱 과정에서 버리지 않는다.
- 변경하지 않은 엔트리는 가능한 한 원본 바이트 그대로 복사한다.
- 변경된 XML만 직렬화하되 네임스페이스, 속성, 자식 순서 등 호환성 영향을 테스트한다.
- 매니페스트/관계 파일은 실제 변경이 필요한 경우에만 수정한다.
- 이미지·첨부 리소스는 임의로 재인코딩하거나 제거하지 않는다.
- ZIP 재작성 시 `mimetype` 압축 방식 및 엔트리 배치 요구사항을 확인한다.
- 임시 파일 생성 → 검증 → 원자적 저장 순서를 따른다.

XML 문자열 치환만으로 모든 수정이 안전한 것은 아니다. 구조적 변경은 스타일 정의, ID, 참조 관계, 패키지 메타데이터까지 함께 검증한다.

### 4.3 Document Model

Document Model은 렌더링과 AI 대상 지정에 필요한 중간 표현이며, 원본 HWPX의 완전한 대체물이 아니다. 노드별로 다음 정보를 유지한다.

- 내부 안정 ID
- 원본 ZIP 엔트리 경로
- 원본 XML 노드 경로/식별 정보
- 요소 종류: paragraph, run, table, cell, image, shape 등
- 원본 XML 노드 참조 또는 원본 조각
- 텍스트 및 문자 범위
- 스타일 참조 ID
- 부모/자식 관계
- 페이지 및 렌더링 좌표
- 원문 해시 또는 버전 정보

### 4.4 AI 편집 명령

AI는 자유 형식 XML이 아니라 제한된 명령 스키마를 반환한다.

초기 명령:

- `replace_text`
- `rewrite_paragraph`
- `insert_paragraph`
- `delete_paragraph`
- `set_character_style`
- `set_paragraph_style`
- `replace_cell_text`

후속 명령:

- `insert_table_row`
- `delete_table_row`
- `replace_image`
- 표 병합/분할 및 객체 조작

```json
{
  "command": "replace_text",
  "target_node_id": "section0_p103",
  "expected_original_text": "기존 문장",
  "replacement_text": "수정된 문장",
  "reason": "문체 개선",
  "requires_confirmation": true
}
```

적용 전 대상 노드 존재 여부, 원문 일치 여부, 문자 범위, 권한을 검사한다. 원문이 바뀌었다면 오래된 명령을 자동 적용하지 않고 충돌을 표시한다.

### 4.5 위험 요소

- 스타일 ID 및 참조 관계 손상
- 문단/런 속성 누락
- 표 병합·셀 크기 손실
- 이미지 BinData 참조 손실
- 각주·미주·주석 관계 손실
- 필드·하이퍼링크·책갈피·개체 앵커 손실
- 수식·차트·OLE·도형 등 미지원 객체 손실
- 네임스페이스/확장 요소 제거
- 페이지 레이아웃 변화
- 한컴 한글 재저장 시 구조 변경

지원하지 않는 요소가 포함된 문서는 무조건 저장하지 않는다. 해당 요소의 보존이 검증되지 않았다면 경고하거나 수정 작업을 차단한다.

## 5. GitHub 오픈소스 조사

아래는 2026-11-16 기준 공개 저장소 README/문서에 대한 1차 조사다. README의 기능 설명은 프로젝트 자체의 주장이지, 우리 제품 요구사항에 대한 독립적인 호환성 인증이 아니다. 도입 전 현재 브랜치·릴리스·테스트·라이선스를 다시 확인한다.

### 5.1 후보 비교

| 프로젝트 | 기술/방향 | 확인된 내용 | 우리 프로젝트 활용 |
|---|---|---|---|
| [edwardkim/rhwp](https://github.com/edwardkim/rhwp) | Rust + WASM | HWP/HWPX 파서, 문서 모델, 페이지 레이아웃, SVG/Canvas 렌더링, 편집 명령 계층을 표방 | 가장 먼저 검토할 파서/렌더러 후보 |
| [airmang/python-hwpx](https://github.com/airmang/python-hwpx) | Python + lxml | HWPX 읽기·편집·생성·검증, 문서/섹션/문단/표 모델, 패키지 도구 | 서버 측 파싱·검증·구조 편집 후보 |
| [jungwoonson/hwpx-editor](https://github.com/jungwoonson/hwpx-editor) | React + TypeScript | 브라우저 ZIP/XML 파싱, 텍스트·문단·표 렌더링 | 브라우저 파서와 UI 참고 |
| [yongmmin/web-hwp-editor](https://github.com/yongmmin/web-hwp-editor) | TypeScript | HWPX 패키지 구조와 파싱 흐름 문서 | 패키지 구조 및 XML 처리 학습 |
| [shinkangteam/hwp-parser](https://github.com/shinkangteam/hwp-parser) | Node.js + TypeScript | HWPX 텍스트 추출, HWP 변환, PDF/OCR 폴백 | 텍스트 추출 참고. 완전한 렌더러로 보지 않음 |
| [ratiertm/python-hwpx](https://github.com/ratiertm/python-hwpx) | Python | OWPML 모델, OPC, 검증·추출 도구 설명 | airmang 저장소와의 관계/차이 확인 후 평가 |
| [dhk1349/hwpx](https://github.com/dhk1349/hwpx) | 계획 문서 | HWPX 에디터 조사·개발 계획 | 요구사항 및 계획 비교 |

### 5.2 1순위 PoC: `edwardkim/rhwp`

Repository: https://github.com/edwardkim/rhwp

README 기준 Rust + WebAssembly 기반 HWP/HWPX 파서·렌더러이며 문서 모델, 편집 명령, 페이지네이션, 레이아웃, SVG/Canvas 출력, WASM API 등을 소개한다. SVG Viewer 구상과 직접 맞닿아 있어 우선 검토한다.

검증할 사항:

1. HWPX 입력 지원 범위와 실제 테스트 파일
2. SVG 렌더링 정확도와 폰트 처리
3. 브라우저 로컬 파일 처리 가능 여부
4. HWPX 저장/직렬화 기능과 보존 범위
5. 미지원 요소의 보존 및 경고 방식
6. 라이선스 및 의존성 라이선스
7. 코어 파서/렌더러만 분리해 쓸 수 있는지
8. API 안정성, 릴리스, 이슈/PR 상태

초기 판단: 직접 렌더러를 처음부터 만들기 전에 반드시 PoC를 수행할 후보. README만으로 한컴 호환성을 보장한다고 판단하지 않는다.

### 5.3 서버 후보: `airmang/python-hwpx`

Repository: https://github.com/airmang/python-hwpx

README는 한컴오피스 없이 Python에서 HWPX를 읽고 수정하고 생성하는 라이브러리라고 설명한다. `lxml` 기반이며 문서 모델, OPC 패키지 처리, 텍스트 추출, 객체 탐색, 검증 도구 등을 소개한다.

검증할 사항:

- 기존 HWPX 수정 시 미지원 XML 요소가 보존되는가?
- XML↔데이터클래스 변환에서 알 수 없는 속성·요소가 손실되지 않는가?
- 부분 수정 API가 충분한가?
- ZIP 엔트리와 패키지 메타데이터 보존 범위는 무엇인가?
- 한컴 한글에서 실제 열기/저장 테스트가 있는가?
- 라이선스 및 의존성 라이선스가 상용 제품에 적합한가?

초기 판단: 서버 측 파싱·검증 후보로 평가한다. 실제 편집 엔진 채택 전 보존성 테스트가 필수다.

### 5.4 브라우저 참고: `jungwoonson/hwpx-editor`

Repository: https://github.com/jungwoonson/hwpx-editor

README 기준 React + TypeScript, ZIP 해제, XML 파싱을 사용해 브라우저에서 HWPX를 직접 파싱하고 텍스트·문단·표 등을 표시한다. 파일 업로드, ZIP 처리, XML 파싱, React 렌더링, 표 표시 및 테스트 구조를 참고한다. 전체 HWPX 조판과 한컴 호환 렌더링이 완성됐다고 가정하지 않는다.

### 5.5 파싱 문서 참고: `yongmmin/web-hwp-editor`

Repository: https://github.com/yongmmin/web-hwp-editor

`docs/HWP_PARSING.md`에서 HWPX ZIP 구조, `content.hpf` 참조 수집, BinData 처리, XML 순서 보존 파싱 및 문서 블록 렌더링 흐름을 설명한다. 구현 채택보다 구조 이해와 테스트 설계에 활용한다.

### 5.6 텍스트 추출 참고: `shinkangteam/hwp-parser`

Repository: https://github.com/shinkangteam/hwp-parser

Node.js/TypeScript 기반으로 HWPX 텍스트 추출, HWP 변환, PDF 텍스트 및 OCR 폴백 등을 설명한다. 검색·문서 맥락 추출 참고용이며 레이아웃 렌더링 및 원본 보존 편집 기능과 구분한다.

### 5.7 중복 및 fork 관계 확인

- `ratiertm/python-hwpx`: `airmang/python-hwpx`와 이름 및 구조가 유사하다. fork 관계, 코드 차이, 독립 유지보수 여부를 확인한다.
- `lemonardo1/rhwp`, `focaidon/hwp`: `edwardkim/rhwp`와 유사한 Rust/WASM 아키텍처가 보인다. fork/업스트림 관계를 확인하고 upstream을 기준으로 검토한다.
- `dhk1349/hwpx`: 구현 라이브러리와 구분해 계획 문서로 참고한다.

### 5.8 라이선스 실사

GitHub 공개 저장소라고 해서 상업적 사용·복사·수정·재배포가 모두 자유로운 것은 아니다. 도입 전 각 저장소의 `LICENSE`, 패키지별 라이선스, `Cargo.toml`/`package.json`/`pyproject.toml` 의존성, 폰트와 샘플 파일 라이선스, NOTICE/저작권 고지, copyleft 및 특허 조항을 확인한다. fork라면 upstream과 변경분 라이선스도 확인한다. 별도 법률 검토가 필요하다.

## 6. 권장 구현 전략

| 전략 | 장점 | 단점 | 판단 |
|---|---|---|---|
| 전부 자체 개발 | 완전한 통제 | 기간·호환성 리스크 큼 | 초기 비추천 |
| `rhwp` 중심 + 자체 AI/UI | SVG/WASM 활용 가능 | 저장/보존 범위 검증 필요 | 1순위 PoC |
| `python-hwpx` 중심 서버 엔진 | Python 문서 조작 편리 | 브라우저 렌더링 별도 필요 | 2순위 PoC |
| 브라우저 파서 활용 | 프론트 통합 용이 | 복잡한 조판·저장 범위 확인 필요 | 보조 후보 |
| 복수 엔진 조합 | 기능별 역할 분리 | 모델 변환/동기화 복잡 | PoC 후 결정 |

권장 초기 접근:

1. `rhwp`를 브라우저 렌더링/파싱 후보로 평가한다.
2. `python-hwpx`를 서버 측 패키지 분석/검증/편집 후보로 평가한다.
3. 같은 HWPX 코퍼스로 두 후보를 비교한다.
4. 한컴 한글에서 열고 저장한 결과를 비교한다.
5. 보존성과 렌더링 정확도에 따라 중심 엔진을 선택한다.
6. AI 명령 스키마와 승인 UI는 자체 구현한다.

PoC에서 이점이 입증되기 전에는 두 라이브러리를 운영 환경에 모두 넣지 않는다.

## 7. 단계별 로드맵

### Phase 0 — 오픈소스 실사 및 테스트 코퍼스

목표: 재사용할 파서/렌더러를 선택할 근거 확보.

- 후보 저장소 clone 및 라이선스 확인
- 릴리스/브랜치/이슈/테스트 코드 조사
- 한컴 한글에서 생성한 HWPX 샘플 코퍼스 구축
- 한글 버전 및 테스트 환경 기록
- 파서별 지원 요소 매트릭스 작성

산출물: OSS 검토표, 라이선스 표, HWPX 테스트 코퍼스, 호환성 기준.

### Phase 1 — 읽기 전용 Viewer PoC

- ZIP 패키지 열기
- 컨테이너/매니페스트/섹션 탐색
- 문단·런·표·이미지 구조 파악
- 페이지 렌더링 및 SVG 표시
- 폰트 fallback 및 레이아웃 조사

완료 기준: 샘플 파일이 열리고, 누락/미지원 요소가 식별되며, 페이지별 회귀 테스트가 구축된다.

### Phase 2 — 선택 및 노드 매핑

- 문단/런/셀/객체별 내부 ID
- SVG 요소와 Document Model 매핑
- 문자 단위 좌표/인덱스 맵
- 드래그 및 문단/표 셀 선택
- 선택 내용과 주변 문맥 추출

완료 기준: 선택 영역이 정확한 원본 노드와 연결되고, 중복 문장이나 확대/축소에서도 오선택이 발생하지 않는다.

### Phase 3 — AI 수정안 생성

- 문서 맥락 추출
- 선택 영역 및 주변 문단 전달
- 편집 명령 JSON Schema 정의
- 명령 대상 검증
- 전후 비교 UI 및 승인/거부

완료 기준: AI가 임의 XML을 반환하지 않고 허용된 명령만 생성하며, 승인 전 원본은 변경되지 않는다.

### Phase 4 — 제한적 HWPX 수정/저장

우선 지원: 기존 문단 텍스트 교체, 문단 재작성, 기존 표 셀 텍스트 교체.

서식 변경이 본 작업이다. 글자 모양과 문단 모양은 `set_character_style`, `set_paragraph_style`로 바꾸고, 쪽 여백을 포함한 문서 구역 설정은 `set_section_format`으로 바꾼다. 문서 전체 범위는 모든 구역에 적용한다. 문단 삽입/삭제, 표 행/열 조작, 이미지 교체는 그다음이다.

완료 기준: 미수정 엔트리 보존, 참조 무결성, 패키지 검사, 한컴 한글 열기/편집/저장/재열기, 시각 차이 보고.

### Phase 5 — 호환성 확대 및 제품화

표 병합/분할, 머리말/꼬리말, 각주/미주, 이미지/도형/수식, 다단/쪽 나눔, 버전 관리, 대용량 문서, 보안 정책을 순차적으로 지원한다. 지원 기능별로 완료 기준을 별도 정의한다.

## 8. 테스트 및 품질 기준

### 8.1 테스트 레벨

1. 패키지: ZIP 엔트리, 압축, mimetype, 관계 및 리소스
2. XML: well-formed XML, 네임스페이스, ID/참조 무결성
3. 모델: 문단·표·런·객체 구조 일치
4. 렌더링: 기준 이미지와 페이지별 시각 회귀 비교
5. 편집: 수정 대상 외 요소가 변경되지 않았는지 확인
6. 한컴 호환성: 열기 → 편집 가능 여부 → 저장 → 재열기
7. 회귀: 릴리스마다 동일 코퍼스 재검증

### 8.2 테스트 문서

| ID | 문서 유형 | 테스트 |
|---|---|---|
| T01 | 일반 문단 | 문장 교체 후 한컴 한글 열기 |
| T02 | 서식 혼합 문단 | 굵게/기울임/색상/글꼴 보존 |
| T03 | 표 | 셀 텍스트 교체 및 병합 보존 |
| T04 | 이미지 | BinData 및 배치 보존 |
| T05 | 머리말/꼬리말 | 반복 영역 보존 |
| T06 | 각주/미주 | 참조 관계 보존 |
| T07 | 수식/차트 | 미지원 요소 보존 여부 |
| T08 | 다단 문서 | 레이아웃 및 페이지 흐름 |
| T09 | 복합 문서 | 부분 수정 후 나머지 요소 보존 |
| T10 | 재저장 문서 | 한컴 한글 저장 파일 재파싱 |

### 8.3 릴리스 차단 조건

- HWPX 패키지 손상
- 한컴 한글에서 열리지 않음
- 수정하지 않은 객체가 사라짐
- 표/이미지/각주 참조가 깨짐
- 미지원 XML 요소가 제거됨
- 승인하지 않은 내용이 변경됨
- 원본 복구가 불가능함

## 9. 보안 및 안정성

- 업로드 파일을 신뢰할 수 없는 ZIP/XML로 취급한다.
- ZIP 폭탄, 비정상 압축 크기, 경로 탈출, XML 깊이/노드 수를 제한한다.
- 외부 엔티티 및 외부 리소스 로딩을 차단한다.
- AI에는 필요한 문맥만 전달하고 민감 문서의 저장/로그/모델 전송 정책을 명확히 한다.
- AI 출력은 스키마 검증과 권한 검사를 통과해야 한다.
- 임시 파일에서 수정하고 검증 완료 후 결과 파일을 확정한다.
- 사용자가 명시적으로 요청하지 않는 한 원본을 덮어쓰지 않는다.

## 10. 주요 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 파서 미지원 요소 | 문서 손실/표시 누락 | 실제 코퍼스로 지원 범위 검증 |
| XML 재직렬화 손실 | 한컴 호환성 저하 | 원본 엔트리 보존 및 제한적 패치 |
| SVG 선택 오차 | 잘못된 문단 수정 | 문자 인덱스와 XML 노드 매핑 |
| 글꼴/조판 차이 | 페이지 불일치 | 폰트 메트릭 및 한컴 렌더링 비교 |
| AI 과도한 수정 | 의미 훼손 | 변경 범위 제한, diff, 승인 |
| ID 참조 오류 | 문서 손상 | 참조 그래프 검증 |
| 저장 후 페이지 변화 | 문서 품질 저하 | 재렌더링 비교 및 경고 |

## 11. MVP 성공 지표

- 코퍼스에서 파일 열기 성공률
- 핵심 요소 파싱 커버리지
- 선택 영역과 원본 노드 매핑 정확도
- 텍스트/문단 수정 성공률
- 한컴 한글 열기 및 재저장 성공률
- 미수정 요소 보존율
- 페이지별 렌더링 차이
- AI 수정안 승인율 및 사용자 재수정률

목표 수치는 Phase 0에서 코퍼스를 측정한 뒤 설정한다. 측정 전에 100% 호환성을 약속하지 않는다.

## 12. 즉시 실행할 작업

1. `edwardkim/rhwp`, `airmang/python-hwpx`, `jungwoonson/hwpx-editor` clone
2. LICENSE, 의존성 라이선스, 최근 커밋, 테스트 및 미지원 요소 조사
3. 한컴 한글에서 만든 대표 HWPX 20~30개 확보
4. 각 샘플의 ZIP 엔트리와 XML 구조 기록
5. 후보 파서로 동일 파일을 열어 구조/렌더링 비교
6. 단순 문단 텍스트 교체 후 HWPX 저장
7. 한컴 한글에서 열기 → 저장 → 재열기
8. 원본/결과 ZIP 및 XML 차이 분석
9. 결과를 바탕으로 렌더러와 편집 엔진 채택 결정

우선순위:

- **P0:** 한컴 한글에서 열리고 재저장되는 최소 수정 성공
- **P0:** 원본 구조 보존 전략 확정
- **P1:** SVG Viewer 및 텍스트 선택
- **P1:** AI 편집 명령 및 승인 UI
- **P2:** 표/이미지/스타일 수정
- **P3:** 고급 객체 및 복합 레이아웃

## 13. 참고 저장소

- [edwardkim/rhwp](https://github.com/edwardkim/rhwp) — Rust/WASM HWP/HWPX 파서 및 SVG/Canvas 렌더러
- [airmang/python-hwpx](https://github.com/airmang/python-hwpx) — Python HWPX 읽기/수정/생성/검증
- [jungwoonson/hwpx-editor](https://github.com/jungwoonson/hwpx-editor) — React/TypeScript 브라우저 HWPX 뷰어/에디터
- [yongmmin/web-hwp-editor](https://github.com/yongmmin/web-hwp-editor) — HWPX 파싱 문서 및 웹 에디터
- [shinkangteam/hwp-parser](https://github.com/shinkangteam/hwp-parser) — Node.js/TypeScript 문서 텍스트 추출
- [ratiertm/python-hwpx](https://github.com/ratiertm/python-hwpx) — Python HWPX 모델 및 도구
- [dhk1349/hwpx](https://github.com/dhk1349/hwpx) — HWPX 에디터 조사 및 계획

---

## 최종 결론

이 프로젝트는 새로운 워드프로세서를 만드는 것이 아니다. **한컴 한글과 호환되는 HWPX 문서를 대상으로, 사람이 수정 위치와 의도를 지정하면 AI가 안전한 편집 명령을 수행하는 문서 자동화 시스템**을 만드는 것이다.

가장 먼저 할 일은 기능을 많이 구현하는 것이 아니라, 기존 오픈소스 파서/렌더러를 동일한 HWPX 코퍼스로 검증하고 단순 문단 수정 결과가 한컴 한글에서 정상적으로 열리고 재저장되는지 증명하는 것이다. 이 검증을 통과한 뒤 SVG Viewer, 선택 인터페이스, AI 편집 기능을 순차적으로 구축한다.
