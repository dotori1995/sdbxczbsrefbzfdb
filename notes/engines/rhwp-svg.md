# rhwp SVG 메모

README의 출력, SVG Export, `renderPageSvg`만 봤다. 클론과 빌드는 하지 않았다.

1. 페이지 단위 그림. `renderPageSvg(0)`와 `export-svg -p`는 페이지 한 장을 그린다.
2. 좌표가 있는 글자 요소. debug overlay는 `s{section}:pi={index} y={coord}`로 문단 위치를 보여 준다.
3. 선택 레이어 분리. 본문과 debug overlay가 나뉘고, replay 순서는 배경, 글 뒤, 본문, 글 앞이다.

D01에 반영한 것: 페이지 `<svg>` 하나, 문단 `<text>`의 `x`와 `y`.
D05로 남긴 것: 페이지 높이, 줄 나눔, `data-line`, 본문과 분리된 선택 `<rect>`.
