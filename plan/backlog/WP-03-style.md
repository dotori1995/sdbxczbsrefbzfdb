# WP-03. 글자 모양과 문단 모양을 명령으로 바꾼다

- 상태: 시작 전
- 크기: 하루
- 착수: D07 이후. 패치로 `header.xml`과 본문 참조를 같이 쓸 수 있을 때.
- 디렉터리: `packages/commands`, `packages/hwpx`, `apps/web`

사람과 바깥 모델이 같은 명령을 쓴다. 모델 호출 코드는 넣지 않는다. 승인 전에는 파일을 바꾸지 않는다.

## 오늘 끝나야 보이는 것

글자 모양 명령을 승인하면 고른 런의 크기나 글자색이 바뀌고, 같은 번호를 쓰던 다른 런은 그대로다. 문단 모양 명령은 그 문단의 정렬만 바꾼다. 글자 모양 번호는 그대로다.

## 명령

`set_character_style`은 `target_node_id`, `run_index`, `properties`, `requires_confirmation`을 가진다. `properties`에 적은 항목만 바꾼다. 예: `height`, `textColor`, `fontRef`.

`set_paragraph_style`은 `target_node_id`, `properties`, `requires_confirmation`을 가진다. 예: `align`.

`requires_confirmation`이 true가 아니면 거절한다. 적지 않은 속성과 자식 요소는 복사본에 남긴다. 줄간격처럼 자식 요소로 있는 값은 그 요소를 지우지 않고, 명령에 적은 속성만 바꾼다.

## WBS

1. 대상 런의 `charPr` 또는 대상 문단의 `paraPr`를 찾는다. 헤더에 그 번호가 없으면 거절한다.
2. 그 번호를 대상만 쓰면 그 정의를 고친다. 다른 런이나 문단도 쓰면 정의를 복사하고, 쓰이지 않은 새 번호를 붙여, 대상의 참조만 새 번호로 바꾼다.
3. 다른 문단의 `paraPrIDRef`, 다른 런의 `charPrIDRef`, 본문 글자는 유지한다.
4. 사용하지 않는 모양 번호를 지우는 코드는 넣지 않는다.
5. 글자 모양 명령은 문단 모양을 건드리지 않고, 문단 모양 명령은 글자 모양을 건드리지 않는다.
6. 승인 화면에 바뀌는 속성과 새 번호 또는 유지된 번호를 보인다.

## 테스트

- 같은 `charPr`를 쓰는 두 런 중 하나만 크기를 바꾸면, 다른 런의 번호와 원래 정의의 `height`는 같다
- 문단 정렬을 바꿔도 `charPrIDRef`와 글자는 같다
- T01 `replace_text`는 `header.xml`을 바꾸지 않는다
- `requires_confirmation`이 false면 거절한다

## 완료

- [ ] 테스트
- [ ] 승인 화면에 대상 런만 바뀐 것이 보인다
- [ ] 모델 호출 코드가 없다

## 기록

- 화면에 보인 것:
- 테스트:
- 넘긴 일:
