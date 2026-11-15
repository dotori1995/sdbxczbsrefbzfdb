# HWPX 포맷

이 문서는 HWPX만 다룬다. 바이너리 HWP, HWPML, DOCX는 대상이 아니다.

2026-11-16에 공개 자료로 정리했다. KS X 6101 판매본 410쪽 전체를 여기서 다시 판독하지는 않았다. 표준 조항은 한컴테크가 그 표준의 표 번호와 스키마를 인용한 부분만 적는다. 구현 라이브러리 문서에만 있는 사실은 따로 표시한다.

## 출처

| 등급 | 자료 | 여기서 가져온 것 |
|---|---|---|
| 규범 | [KS X 6101](https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSX6101) 개방형 워드프로세서 마크업 언어(OWPML) 문서 구조. 2024-10-30 개정 | 한컴테크 인용을 통해 본문 구조, `head`, `refList`, `p`/`run` |
| 한컴 | [HWP·OWPML 형식 공개](https://download.hancom.com/support/downloadCenter/hwpOwpml) | `.hwpx`는 한글 2010부터, `.owpml`은 2018부터 |
| 한컴 | [패키지 구조](https://tech.hancom.com/hwpxformat/) | 엔트리 역할. 구성은 문서마다 달라질 수 있다 |
| 한컴 | [파싱 1](https://tech.hancom.com/python-hwpx-parsing-1/), [파싱 2](https://tech.hancom.com/python-hwpx-parsing-2/) | 저장 예시, 네임스페이스를 파일에서 읽어야 하는 이유, 서식 참조 |
| 한컴 | [개발자 포럼](https://forum.developer.hancom.com/t/hwp-hwpx-mime-type-whitelist/1641/2) | `mimetype` 값 `application/hwp+zip` |
| 한컴 | [개발자 포럼, 줄 나눔](https://forum.developer.hancom.com/t/hwpx-linesegarray-lineseg-textpos/1677) | 문단 나눔은 `p`, 줄 나눔은 `lineBreak`. `linesegarray`는 OWPML 밖 레이아웃 |
| 구현 | [python-hwpx OPC 재패킹](https://airmang.github.io/python-hwpx/internals/opc-packaging.html) | `mimetype`을 첫 엔트리·무압축으로 쓰는 규칙, `tagetApplication`, 네임스페이스 연도 |
| 구현 | [python-hwpx 스키마 개요](https://airmang.github.io/python-hwpx/schema-overview.html), [줄 캐시](https://airmang.github.io/python-hwpx/internals/lineseg.html), [단위](https://airmang.github.io/python-hwpx/internals/units.html) | 바탕쪽·이력 스키마, `linesegarray` 처리, HWPUNIT |
| 구현 | [rhwp lineseg 토론](https://github.com/edwardkim/rhwp/discussions/188), [이슈 177](https://github.com/edwardkim/rhwp/issues/177) | 한컴이 `lineseg`를 다시 계산한다는 관찰과, 저장된 값을 그대로 쓴다는 관찰 |
| 구현 | [web-hwp-editor HWP_PARSING.md](https://github.com/yongmmin/web-hwp-editor/blob/main/docs/HWP_PARSING.md) | 셀 요소 이름, 텍스트만 교체하는 저장 |
| 계획 | [개발 계획서](HWPX_AI_Editor_Development_Plan.md) 4장 | 고정 파일 목록을 가정하지 않고, 미변경 엔트리는 원본 바이트로 둔다 |

## 패키지

HWPX는 ZIP이다. 루트 파일 `mimetype`의 내용은 `application/hwp+zip`이다. 한컴은 이 값으로 HWPX를 구분한다고 적었다.

python-hwpx는 한컴이 파일을 인식하려면 `mimetype`이 ZIP의 첫 엔트리이고 압축하지 않은(STORED) 상태여야 한다고 적는다. 이 문장은 표준 본문에서 직접 확인한 것이 아니라 그 라이브러리의 재패킹 규칙이다. 값을 한컴 포럼이 확인하고, 위치와 압축 방식은 구현 문서가 확인한다.

한컴 구조 글이 적은 구성이다. 변경 추적, 문서 이력, 이미지, 스크립트가 없으면 해당 파트는 없다.

```text
mimetype
version.xml
settings.xml
META-INF/
  container.xml
  container.rdf
  manifest.xml
Contents/
  content.hpf
  header.xml
  section0.xml
  section1.xml
BinData/
Preview/
  PrvImage.png
  PrvText.txt
Scripts/
```

| 파트 | 역할 | 근거 |
|---|---|---|
| `mimetype` | 형식 식별. 값 `application/hwp+zip` | 한컴 |
| `version.xml` | OWPML 버전과 저장 환경 | 한컴. 속성 `tagetApplication`은 python-hwpx가 한컴 저장본의 철자로 보존한다고 적은 것 |
| `settings.xml` | 저장 시점 커서. `CaretPosition`의 `listIDRef`, `paraIDRef`, `pos` | 한컴 파싱 1의 저장 예시 |
| `META-INF/container.xml` | 패키지 루트 파일 선언 | 한컴. rootfile 미디어 타입 `application/hwpml-package+xml`은 python-hwpx |
| `META-INF/container.rdf` | 컨테이너 관계 | 한컴 |
| `META-INF/manifest.xml` | 암호 문서일 때 파트별 암호화 정보 | 한컴 |
| `Contents/content.hpf` | OPF 매니페스트. 파트 목록과 읽는 순서 | 한컴 |
| `Contents/header.xml` | 글꼴, 글자 모양, 문단 모양, 구역 개수 | 한컴, KS 인용 |
| `Contents/sectionN.xml` | 구역 본문. N은 0부터 | 한컴, KS 인용 |
| 바탕쪽 파트 | 머리말·꼬리말·바탕쪽. 루트는 `masterPage`. 구현체는 `Contents/masterpageN.xml`을 읽는다 | python-hwpx 스키마, rhwp의 manifest 분류 |
| 이력 파트 | 없을 수 있다. 루트는 `history`, 항목은 `historyEntry` | 한컴 구조 글, python-hwpx 스키마 |
| `BinData/` | 이미지, OLE 등 바이너리 | 한컴 |
| `Preview/` | 탐색기 미리보기. 암호 문서는 저장하지 않음 | 한컴 |
| `Scripts/` | `headerScripts`, `sourceScripts` | 한컴 |

`content.hpf`는 `metadata`, `manifest`, `spine`으로 나뉜다. `metadata`는 제목, 작성자, 날짜다. `manifest`의 순서는 중요하지 않다. `spine`에 나열된 순서로 문서를 읽는다.

한컴 파싱 1이 보인 manifest 항목이다.

```xml
<opf:manifest>
  <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
  <opf:item id="image1" href="BinData/image1.PNG" media-type="image/png" isEmbeded="1"/>
  <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
</opf:manifest>
```

`isEmbeded`는 공개 예시의 철자다. 이미지는 manifest의 `id`/`href`, `BinData` 바이트, 본문의 그림 참조가 셋으로 연결된다. 그림 요소의 스키마 이름은 `pic`다.

## 본문

KS X 6101 10.2를 한컴테크가 인용한 구조다.

본문의 논리 구조는 본문, 구역, 문단이다. 본문 파일은 따로 없다. 구역은 `Contents/sectionN.xml`이다. 구역은 하나 이상이고, 구역 안 문단도 하나 이상이다. 표와 글상자는 문단 안에 다시 문단 목록을 둔다. 문단에는 글자 외에 표, 그림, 그리기 개체가 들어간다.

구역 수는 `header.xml` 루트 `head`의 `secCnt`다. `head`에는 `version`도 있다. 한컴은 `section0.xml`부터 `secCnt`개까지 읽고, 각 파일의 `sec` 아래 `p`를 문단으로 읽는다.

`head` 아래로 표준 표가 적은 요소는 `beginNum`, `refList`, `forbiddenWordList`, `compatibleDocument`, `trackchangeConfig`, `docOption`, `metaTag`다.

`beginNum` 속성은 `page`, `footnote`, `endnote`, `pic`, `tbl`, `equation`이다. 각각 쪽, 각주, 미주, 그림, 표, 수식의 시작 번호다.

`refList`는 본문이 가리키는 매핑 표다. 표준 표에 이름이 있는 것은 `fontfaces`, `charProperties`, `paraProperties`다. 한컴 파싱 1의 저장 예시에는 그 사이에 `borderFills`, `tabProperties`, `numberings`, `styles`도 있다.

본문 스키마의 포함 관계다. 한컴테크가 스키마를 줄여 인용했다.

```text
sec
  p+                         id, paraPrIDRef, styleIDRef, pageBreak, columnBreak, merged
    run+                     charPrIDRef
      secPr                  구역 설정. 문단 아래에 하나만
      ctrl                   문단 제어. 다단(colPr) 등
      t                      텍스트
      tbl                    표
      pic                    그림
```

한컴이 보인 저장 예시다. 첫 `run`은 글자 없이 `secPr`와 `ctrl`만 있고, 같은 모양의 글자만 한 `run`에 모인다.

```xml
<hs:sec>
  <hp:p paraPrIDRef="20">
    <hp:run charPrIDRef="7">
      <hp:secPr/>
      <hp:ctrl/>
    </hp:run>
    <hp:run charPrIDRef="7"><hp:t>한글</hp:t></hp:run>
    <hp:run charPrIDRef="0"><hp:t>과</hp:t></hp:run>
    <hp:run charPrIDRef="8"><hp:t>컴퓨터</hp:t></hp:run>
  </hp:p>
</hs:sec>
```

`paraPrIDRef="20"`은 `header.xml`의 `paraPr id="20"`이다. 예시에서는 `align horizontal="CENTER"`였다. `charPrIDRef="7"`은 `charPr id="7"`이다. 예시에서는 `textColor`와 `fontRef hangul`이 있었다. `fontRef hangul`은 `fontface lang="HANGUL"` 안의 `font id`다. 글꼴 정의는 본문에 없고 헤더에 있다.

`p/@id`는 표준 스키마에서 필수다. 개발 계획의 `node_id`와 같은 값으로 쓰지 않는다. `node_id`는 이 앱의 식별자고, 구역 번호와 문단 위치에서 만든다. 파일 안의 `p/@id`는 원본 속성으로 유지한다.

표 칸의 요소 이름은 표준 인용에서 여기까지 확인하지 못했다. web-hwp-editor는 칸을 `hp:tc`로 읽고, 칸 안에 `hp:subList`가 있으며, 한컴이 표를 그리려면 `cellAddr`, `cellSpan`, `cellSz`, `cellMargin`, `subList`가 필요하다고 적는다. 이 이름은 구현 문서의 관찰이다. 표 텍스트를 바꿀 때도 이 요소를 지우면 안 된다.

`t`는 문자만 담지 않는다. python-hwpx는 `t` 안에 형광펜, 제목 표시, 탭, 변경 추적 표식이 섞일 수 있다고 적는다. 한컴 개발자 포럼은 한 문단 안의 줄 나눔을 `lineBreak`로 적는다고 답했다. 문단을 나누는 태그는 `p`다. 글자를 바꿀 때 `lineBreak`와 그 표식을 일반 문자로 지우지 않는다.

`secPr`에는 쪽 설정과 바탕쪽 연결이 있다. 바탕쪽 파일의 문단 목록은 본문 `sectionN.xml`과 같은 문단 구조다. 본문 글자만 바꿀 때 바탕쪽 파트는 열지 않는다.

## 줄 위치 캐시

문단 안에는 `linesegarray`가 있고, 그 자식 `lineseg`가 줄마다 세로 위치, 높이, 베이스라인, 글자 시작 위치 `textpos`를 담는다. 한컴 개발자 포럼은 이 정보를 문단 위치 정보로 부르며, OWPML 표준에는 없고 한글의 HWPX가 정의하는 레이아웃이라고 답했다. 답글은 “레이아웃 정”에서 잘려 있다.

글자 길이를 바꾸면 예전 `textpos`는 새 문자열과 맞지 않게 된다. 그다음 처리에 대해 구현이 갈린다.

- python-hwpx는 고친 문단의 `linesegarray`만 지운다. 남기면 한컴이 새 글자를 옛 줄 칸에 넣어 겹친다고, 자기 렌더 확인으로 적는다. 고치지 않은 문단의 캐시는 원본 바이트로 둔다.
- rhwp 이슈 177은 한컴이 저장된 `lineseg`를 다시 계산하지 않고 그대로 써서, 값이 틀리면 줄이 겹친다고 적는다.
- rhwp 토론 188은 일부 한컴 버전이 부정확한 `lineseg`를 저장하고, 한컴은 열 때 그 값을 무시하고 글자 런으로 다시 조판한다고 적는다.

표준 조항으로 둘 중 하나를 고르지 않는다. 글자 교체 뒤 그 문단의 `linesegarray`를 지울지는 한컴에서 같은 파일을 열어 보고 정한다. 다른 문단의 `linesegarray`는 유지한다. 없는 캐시를 계산해 새로 넣지 않는다.

좌표가 적힌 값의 단위는 python-hwpx가 HWPUNIT으로 설명한다. 1인치는 7200, 1pt는 100이다. 글자 높이 10pt는 `height="1000"`으로 저장된다고 적는다. 줄 간격은 이 단위가 아니라 퍼센트다. 이 환산은 구현 문서의 설명이다.

## 다른 저장소

`jungwoonson/hwpx-editor`와 `shinkangteam/hwp-parser`의 공개 설명에서는 위 표에 없는 패키지 규칙을 확인하지 못했다. rhwp README의 파싱 목록에는 바탕쪽, 머리말, 꼬리말, 각주, 미주, 수식, 차트가 있다. 그 요소의 XML 이름은 이 문서에서 rhwp 소스까지 펼치지 않았다.

## 네임스페이스

한컴 파싱 1은 문서 버전에 따라 네임스페이스가 달라지므로, 파일의 선언을 읽어 그 문서에 쓰라고 적는다. 접두사를 코드에 고정하지 않는다.

한컴테크가 인용한 KS 스키마는 `http://www.owpml.org/owpml/2021/paragraph`, `.../2021/section`, `.../2021/core`를 쓴다. 같은 글의 다른 스키마 조각은 section 네임스페이스를 `.../2024/section`으로 적는다. `settings.xml` 예시는 `http://www.owpml.org/owpml/2023/app`다.

같은 연재의 `header.xml` 저장 예시는 한컴 도메인을 쓴다.

| 접두사 | 저장 예시의 URI |
|---|---|
| `ha` | `http://www.hancom.co.kr/hwpml/2011/app` |
| `hp` | `http://www.hancom.co.kr/hwpml/2011/paragraph` |
| `hp10` | `http://www.hancom.co.kr/hwpml/2016/paragraph` |
| `hs` | `http://www.hancom.co.kr/hwpml/2011/section` |
| `hc` | `http://www.hancom.co.kr/hwpml/2011/core` |
| `hh` | `http://www.hancom.co.kr/hwpml/2011/head` |
| `hhs` | `http://www.hancom.co.kr/hwpml/2011/history` |
| `hm` | `http://www.hancom.co.kr/hwpml/2011/master-page` |
| `hpf` | `http://www.hancom.co.kr/schema/2011/hpf` |
| `opf` | `http://www.idpf.org/2007/opf/` |
| `dc` | `http://purl.org/dc/elements/1.1/` |

python-hwpx는 2011, 2016, 2024 URI를 모두 열고, 파싱할 때만 2016을 2011로 바꿔 찾는다. 고치지 않은 파트는 원래 URI 바이트를 그대로 다시 쓴다. 표준 URI와 한컴 저장 URI를 하나로 덮어쓰지 않는다.

요소를 찾을 때는 로컬 이름과 그 파일의 네임스페이스를 같이 쓴다. `t`라는 로컬 이름만으로 문단 텍스트를 확정하지 않는다. 문단은 `p`, 글자 묶음은 `run`, 글자는 그 `run` 안의 `t`다.

## 텍스트를 바꿀 때 남는 것

개발 계획 4.2와 이 구조를 같이 보면, 문단 글자 교체는 `t`의 문자 데이터만 바꾸는 일이다.

- 바꾸지 않은 ZIP 엔트리는 원본 바이트로 복사한다.
- `header.xml`의 `charPr`, `paraPr`, `font`는 본문 글자만 바꿀 때 수정하지 않는다. 참조 ID를 본문에 남겨 둔다.
- 런이 둘 이상이면 글자를 한 노드로 합치지 않는다. 합치면 `charPrIDRef`가 사라진다. 한 명령이 여러 런을 고쳐도 각 수정은 그 런의 `t` 문자만 바꾸고, `charPrIDRef`는 그 런에 남긴다.
- 첫 런의 `secPr`, `ctrl`은 글자가 없어도 남긴다.
- 글자 길이가 바뀐 문단의 `linesegarray`는 옛 줄 위치다. 그 문단 것만 지울지 남길지는 한컴 확인 전에 정하지 않는다. 다른 문단의 캐시는 유지한다.
- `BinData`는 재인코딩하지 않는다. manifest의 `id`와 본문 그림 참조를 유지한다.
- `content.hpf`와 `META-INF`는 파트 구성이 바뀔 때만 수정한다.
- 알 수 없는 요소와 속성은 파서가 버려도 저장 결과에는 남긴다. 지원하지 않는 요소의 보존을 확인하기 전에는 그 문서를 저장하지 않는다.
- 패키지를 다시 쓸 때 `mimetype`은 첫 엔트리, 무압축, `application/hwp+zip`으로 둔다.

`p/@id`와 헤더 참조를 유지한 채 `t`만 바꾸는 방식이, web-hwp-editor가 HWPX 원본을 다시 저장할 때 쓴 방법이기도 하다.
