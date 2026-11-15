import { DOMParser, type Element, type Node } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildHwpx, buildT01Fixture, sectionXml, t01SectionXml, T01_FIRST, T01_HEADER, T01_SECOND } from './fixture.ts'
import { readParagraphs } from './index.ts'

const HANCOM_2011 = 'http://www.hancom.co.kr/hwpml/2011'
const OWPML_2021 = 'http://www.owpml.org/owpml/2021'

const T01_PARAGRAPHS = [
  {
    nodeId: 'section0_p0',
    text: T01_FIRST,
    paraPrIDRef: '0',
    runs: [{ charPrIDRef: '0', text: T01_FIRST }],
  },
  {
    nodeId: 'section0_p1',
    text: T01_SECOND,
    paraPrIDRef: '0',
    runs: [{ charPrIDRef: '0', text: T01_SECOND }],
  },
]

describe('readParagraphs', () => {
  it('T01 fixture에서 문단 둘을 문서 순서로 읽는다', () => {
    expect(readParagraphs(buildT01Fixture())).toEqual(T01_PARAGRAPHS)
  })

  it('T01 ZIP은 mimetype, header, section0을 갖고 p id를 nodeId로 쓰지 않는다', () => {
    const bytes = buildT01Fixture()
    const entries = unzipSync(bytes)
    expect(Object.keys(entries).sort()).toEqual(['Contents/header.xml', 'Contents/section0.xml', 'mimetype'])
    expect(strFromU8(entries.mimetype)).toBe('application/hwp+zip')
    expect(firstZipEntry(bytes)).toEqual({ name: 'mimetype', method: 0 })

    const header = strFromU8(entries['Contents/header.xml'])
    expect(header).toBe(T01_HEADER)
    const head = parseRoot(header)
    expect(localName(head)).toBe('head')
    expect(head.getAttribute('secCnt')).toBe('1')
    expect(descendantLocalNames(head)).toEqual(expect.arrayContaining(['paraPr', 'charPr']))

    const section = parseRoot(strFromU8(entries['Contents/section0.xml']))
    const paragraphs = directChildren(section, 'p')
    expect(paragraphs.map((paragraph) => paragraph.getAttribute('id'))).toEqual(['100', '200'])
    expect(readParagraphs(bytes).map((paragraph) => paragraph.nodeId)).toEqual(['section0_p0', 'section0_p1'])
  })

  it('2011 네임스페이스와 2021 네임스페이스에서 같은 문단 목록이 나온다', () => {
    const hancom = readParagraphs(buildT01Fixture(t01SectionXml(`${HANCOM_2011}/section`, `${HANCOM_2011}/paragraph`)))
    const owpml = readParagraphs(buildT01Fixture(t01SectionXml(`${OWPML_2021}/section`, `${OWPML_2021}/paragraph`)))
    expect(owpml).toEqual(hancom)
    expect(hancom).toEqual(T01_PARAGRAPHS)
  })

  it('문단 밖 글자와 secPr, ctrl, 칸 안 문단은 문단 텍스트에 섞지 않는다', () => {
    const xml = sectionXml(
      `${HANCOM_2011}/section`,
      `${HANCOM_2011}/paragraph`,
      `  <hp:p id="9" paraPrIDRef="3">
    <hp:run charPrIDRef="7">
      <hp:secPr/>
      <hp:ctrl>제어문</hp:ctrl>
    </hp:run>
    <hp:run charPrIDRef="4"><hp:t>본문</hp:t></hp:run>
    <hp:run charPrIDRef="4">
      <hp:tbl>
        <hp:p id="10" paraPrIDRef="3">
          <hp:run charPrIDRef="4"><hp:t>칸안</hp:t></hp:run>
        </hp:p>
      </hp:tbl>
    </hp:run>
  </hp:p>
  <hp:t>바깥</hp:t>`,
    )
    expect(readParagraphs(buildT01Fixture(xml))).toEqual([
      {
        nodeId: 'section0_p0',
        text: '본문',
        paraPrIDRef: '3',
        runs: [{ charPrIDRef: '4', text: '본문' }],
      },
    ])
  })

  it('secCnt가 1이면 section1.xml은 읽지 않는다', () => {
    const bytes = buildHwpx({
      'Contents/header.xml': T01_HEADER,
      'Contents/section0.xml': t01SectionXml(),
      'Contents/section1.xml': sectionXml(
        `${HANCOM_2011}/section`,
        `${HANCOM_2011}/paragraph`,
        '  <hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다른구역</hp:t></hp:run></hp:p>',
      ),
    })
    expect(readParagraphs(bytes).map((paragraph) => paragraph.text)).toEqual([T01_FIRST, T01_SECOND])
  })

  it('손상된 ZIP은 거절한다', () => {
    expect(() => readParagraphs(new Uint8Array([1, 2, 3]))).toThrow(/ZIP을 읽을 수 없습니다/)
  })
})

function firstZipEntry(bytes: Uint8Array): { name: string; method: number } {
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
  const method = bytes[8] | (bytes[9] << 8)
  const nameLength = bytes[26] | (bytes[27] << 8)
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))
  return { name, method }
}

function parseRoot(xml: string): Element {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement
  if (!root) throw new Error('XML 루트가 없습니다')
  return root
}

function localName(element: Element): string {
  return element.localName || element.nodeName.replace(/^.*:/, '')
}

function directChildren(element: Element, name: string): Element[] {
  const found: Element[] = []
  for (let i = 0; i < element.childNodes.length; i += 1) {
    const child = element.childNodes[i]
    if (child.nodeType === 1 && localName(child as Element) === name) found.push(child as Element)
  }
  return found
}

function descendantLocalNames(element: Element): string[] {
  const names: string[] = []
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length; i += 1) {
      const child = node.childNodes[i]
      if (child.nodeType !== 1) continue
      names.push(localName(child as Element))
      walk(child)
    }
  }
  walk(element)
  return names
}
