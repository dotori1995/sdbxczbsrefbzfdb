# python-hwpx

저장소: https://github.com/airmang/python-hwpx

라이선스: Apache-2.0. 본문은 저장소의 `LICENSE`에 있다. 앱 의존성에 넣지 않았다.

확인한 버전은 6.12.0이다. `tmp/pyhwpx`에만 설치했다.

읽기 API는 `HwpxDocument.open(경로)`로 패키지를 열고, `document.paragraphs`로 문단을 돈다. 문단 글자는 `paragraph.text()`다. `TextExtractor`는 주석 표시를 고른 추출용이다. 저장 메서드는 `save_to_path`, `save_to_stream`, `to_bytes`다.

한글 T01을 열었을 때 문단 수는 2이고, 글자는 D01 `readParagraphs`와 같았다.

코드 fixture는 `META-INF/container.xml`이 없어서 이 라이브러리가 열지 못했다. 우리 읽기는 그 파일 없이도 문단 둘을 반환한다.
