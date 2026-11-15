# T01 엔트리

명령: `pnpm exec tsx tools/corpus/inventory.ts corpus/hancom/T01.hwpx`

본문은 출력하지 않는다. 해시는 엔트리 원본 바이트의 SHA-256이다.

`readParagraphs`는 이 파일에서 문단 둘을 반환했다. 문단 경계는 fixture와 같다.

| 경로 | 압축 | 압축 크기 | 원본 크기 | SHA-256 |
|---|---|---:|---:|---|
| mimetype | stored | 19 | 19 | 5ab5230b5af04f78947736bf8dd1a269aa684e234f7f4a392efb85289d1655c2 |
| version.xml | stored | 310 | 310 | 550d827061afc1396932c7d964ea4aea25b7ffdb49942a6598df6c318a31fd95 |
| Contents/header.xml | deflate | 3734 | 42624 | ddd101ead8d5c1665f902a1f29fb20042941098a805c43842ce2cccb3237b7f1 |
| Contents/section0.xml | deflate | 1347 | 3819 | 68e6136938992013a79aeab092666168286ad5579572c317a820914965a4cd60 |
| Preview/PrvText.txt | deflate | 34 | 50 | 25cf88c29eccbd8ae280b336040247fee49210b2763cfcc623034d1481974451 |
| settings.xml | deflate | 198 | 278 | dd53f18d52c9a9628cd6a40f6a9ada552ad0f8667597af4fe1dec912feac48a2 |
| Preview/PrvImage.png | stored | 5438 | 5438 | 9eb0b1c25b83e25295d207e8b6c40986435ead1694794e1d7f9e78f3b7f52d13 |
| META-INF/container.rdf | deflate | 275 | 867 | 0cfd814c20595c841e48e62fbf7591829f13c177fa92af634c8199f85ecf3a89 |
| Contents/content.hpf | deflate | 687 | 1894 | 2cf549fb69aaca932c3610bcd818b681f52e831a10bab5b5f017efd4d82a0c98 |
| META-INF/container.xml | deflate | 265 | 475 | 5109d3a9249ec1058177fedab574c5d9616058aa92ebefcd33249ebb36a20f61 |
| META-INF/manifest.xml | deflate | 113 | 134 | 2b4b155c1bb6a9ccc212fef113c4831d2f558e67cf1260eb314ce54f26fd32ea |
