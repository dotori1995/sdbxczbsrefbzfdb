# WP-03. 서식을 바꾸면 파일과 화면이 바뀐다

- 상태: 시작 전
- 크기: 이틀. 첫날은 글자 모양과 문단 모양, 둘째 날은 쪽 여백과 문서 전체 구역 설정.
- 착수: D07 이후. 패치로 `header.xml`, 본문 참조, `secPr`를 같이 쓸 수 있을 때.
- 디렉터리: `packages/commands`, `packages/hwpx`, `apps/web`

사람과 바깥 모델이 같은 명령을 쓴다. 모델 호출 코드는 넣지 않는다. 승인 전에는 파일을 바꾸지 않는다. 승인한 서식은 SVG에 보여야 한다.

## 오늘 끝나야 보이는 것

글자 모양 명령을 승인하면 고른 범위의 글자 크기나 글자색이 화면에서 바뀌고, 범위 밖의 런은 그대로다. 문단 모양 명령은 그 문단의 정렬이 바뀐다. 쪽 여백 명령을 문서 전체로 승인하면 모든 구역의 본문 여백이 바뀌고, 글자와 글자 모양 번호는 그대로다.

## 명령

`set_character_style`은 `target_node_id`, `run_index`, `properties`, `requires_confirmation`을 가진다. `properties`에 적은 항목만 바꾼다. 예: `height`, `textColor`, `fontRef`.

`set_paragraph_style`은 `target_node_id`, `properties`, `requires_confirmation`을 가진다. 예: `align`.

`set_section_format`은 `scope`, `section_index`, `properties`, `requires_confirmation`을 가진다. `scope`는 `section` 또는 `document`다. 쪽 여백 항목은 위, 아래, 왼쪽, 오른쪽, 머리말, 꼬리말, 제본이다. 이 값의 저장 위치는 그 구역 `secPr`의 쪽 설정이다. 공개 스키마에 없는 항목은 새로 만들지 않는다. `section`은 그 구역만, `document`는 모든 구역의 쪽 설정에 같은 값을 쓴다.

`set_character_style`과 `set_paragraph_style`에도 `scope`를 둔다. `run`과 `paragraph`는 고른 대상만, `document`는 문서의 모든 런 또는 모든 문단이다.

`requires_confirmation`이 true가 아니면 거절한다. 적지 않은 속성과 자식 요소는 남긴다. 줄간격처럼 자식 요소로 있는 값은 그 요소를 지우지 않고, 명령에 적은 속성만 바꾼다.

## WBS

1. 대상 런의 `charPr` 또는 대상 문단의 `paraPr`를 찾는다. 헤더에 그 번호가 없으면 거절한다.
2. 명령 범위 밖의 곳이 그 번호를 쓰면 정의를 복사하고, 쓰이지 않은 새 번호를 붙여, 범위 안의 참조만 새 번호로 바꾼다. 범위 안이 그 번호의 전부이면 그 정의를 고친다.
3. 범위 밖의 `paraPrIDRef`, `charPrIDRef`, 본문 글자는 유지한다.
4. 사용하지 않는 모양 번호를 지우는 코드는 넣지 않는다.
5. 글자 모양 명령은 문단 모양과 `secPr`를 건드리지 않는다. 문단 모양 명령은 글자 모양과 `secPr`를 건드리지 않는다. `set_section_format`은 `secPr`의 쪽 설정만 바꾸고 글자와 모양 번호는 유지한다.
6. 승인한 글자 크기, 글자색, 문단 정렬, 쪽 여백이 SVG에 바뀌어 보인다. 쪽 여백은 본문 글자의 안쪽 여백이다.

## 테스트

- 같은 `charPr`를 쓰는 두 런 중 하나만 크기를 바꾸면, 다른 런의 번호와 원래 정의의 `height`는 같다
- 문서 전체로 글자 크기를 바꾸면 모든 런의 크기가 바뀐다
- 문단 정렬을 바꿔도 `charPrIDRef`와 글자는 같다
- 문서 전체 쪽 여백을 바꾸면 모든 구역의 `secPr` 쪽 설정만 바뀌고, 글자와 `header.xml`의 모양 번호는 같다
- 한 구역만 지정하면 다른 구역의 `secPr`는 같다
- T01 `replace_text`는 `header.xml`과 `secPr`를 바꾸지 않는다
- `requires_confirmation`이 false면 거절한다

## 완료

- [ ] 테스트
- [ ] 승인 후 글자 크기, 정렬, 쪽 여백이 화면에 바뀌어 보인다
- [ ] 모델 호출 코드가 없다

## 기록

- 화면에 보인 것:
- 테스트:
- 넘긴 일:
