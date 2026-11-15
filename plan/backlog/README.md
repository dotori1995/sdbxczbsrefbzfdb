# D15 이후

여기 카드는 하루 크기다. D15가 끝난 뒤 [NEXT.md](../../NEXT.md)를 카드 하나로 옮긴다. 한 번에 여러 장을 열 때는 손대는 디렉터리가 겹치지 않는 조합만 고른다.

출시 전에 외부로 바이너리나 소스를 넘기면 [WP-00](WP-00-license.md)을 먼저 닫는다. 화면 개발이 이 카드를 기다리지는 않는다.

| 카드 | 보이는 결과 | 착수 조건 | 디렉터리 |
|---|---|---|---|
| [WP-00 라이선스](WP-00-license.md) | 도입 후보별 사용 가능 여부 | 아무 때나. 출시 전 필수 | `notes/engines` |
| [WP-01 되돌리기](WP-01-undo.md) | 직전 승인 취소 | D07 | `apps/web`, `packages/hwpx` |
| [WP-02 문단 삽입 삭제](WP-02-paragraph-structure.md) | 문단이 늘거나 줄어 보임 | D09 성공 | `packages/hwpx` |
| [WP-03 글자 모양과 문단 모양](WP-03-style.md) | 고른 런이나 문단의 모양만 바뀜 | D07 | `packages/commands`, `packages/hwpx` |
| [WP-04 머리말 보존](WP-04-header.md) | 머리말이 있는 파일의 저장 차단 또는 보존 증명 | D15 | `packages/hwpx` |
| [WP-05 각주 보존](WP-05-footnote.md) | 각주 참조가 남은 채 문단만 수정 | D09 성공 | `packages/hwpx` |
| [WP-06 표 구조](WP-06-table-structure.md) | 행 추가가 한컴에서 열림 | D08, D09 | `packages/hwpx`, `apps/web` |
| [WP-07 큰 문서](WP-07-large-doc.md) | 긴 문서의 첫 페이지가 빨리 보임 | D05 | `apps/web` |

카드를 하루로 쓸 때는 그 파일의 데모, WBS, 테스트, 기록란만 보면 된다.
