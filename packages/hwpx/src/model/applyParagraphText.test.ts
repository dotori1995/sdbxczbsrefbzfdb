import { describe, expect, it } from 'vitest'
import { buildT01Fixture, buildT02Fixture, sectionXml, T01_FIRST, T01_SECOND, T02_BOLD, T02_PLAIN } from '../fixture.ts'
import { applyParagraphText } from './applyParagraphText.ts'
import { readParagraphs, type Paragraph } from '../index.ts'

const REPLACEMENT = '수정한 문단이다'

describe('applyParagraphText', () => {
  it('T01에서는 고른 문단의 글자만 새 모델에 담긴다', () => {
    const paragraphs = readParagraphs(buildT01Fixture())
    const first = paragraphs[0]
    const result = applyParagraphText(paragraphs, 'section0_p1', REPLACEMENT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paragraphs[0]).toBe(first)
    expect(result.paragraphs[1]).toEqual({
      nodeId: 'section0_p1',
      text: REPLACEMENT,
      paraPrIDRef: '0',
      runs: [{ charPrIDRef: '0', text: REPLACEMENT }],
    })
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([T01_FIRST, T01_SECOND])
  })

  it('T02는 글자와 런 개수를 바꾸지 않고 MIXED_RUNS를 반환한다', () => {
    const paragraphs = readParagraphs(buildT02Fixture())
    expect(paragraphs).toEqual([
      {
        nodeId: 'section0_p0',
        text: `${T02_BOLD}${T02_PLAIN}`,
        paraPrIDRef: '0',
        runs: [
          { charPrIDRef: '1', text: T02_BOLD },
          { charPrIDRef: '0', text: T02_PLAIN },
        ],
      },
    ])

    const result = applyParagraphText(paragraphs, 'section0_p0', REPLACEMENT)
    expect(result).toMatchObject({ ok: false, code: 'MIXED_RUNS' })
    expect(result.paragraphs.map(snapshot)).toEqual(paragraphs.map(snapshot))
    expect(paragraphs[0].runs).toHaveLength(2)
  })

  it('입력 배열과 문단 객체를 제자리 수정하지 않는다', () => {
    const paragraphs = readParagraphs(buildT01Fixture())
    const frozen = paragraphs.map((paragraph) => Object.freeze({ ...paragraph, runs: Object.freeze(paragraph.runs.map((run) => Object.freeze({ ...run }))) }))
    const frozenList = Object.freeze(frozen)
    const result = applyParagraphText(frozenList, 'section0_p1', REPLACEMENT)

    expect(result.ok).toBe(true)
    expect(frozenList[1].text).toBe(T01_SECOND)
    expect(frozenList[1].runs[0].text).toBe(T01_SECOND)
  })

  it('secPr만 있는 런은 글자 런 개수에 넣지 않는다', () => {
    const xml = sectionXml(
      'http://www.hancom.co.kr/hwpml/2011/section',
      'http://www.hancom.co.kr/hwpml/2011/paragraph',
      `  <hp:p id="1" paraPrIDRef="2">
    <hp:run charPrIDRef="9"><hp:secPr/></hp:run>
    <hp:run charPrIDRef="4"><hp:t>본문</hp:t></hp:run>
  </hp:p>`,
    )
    const paragraphs = readParagraphs(buildT01Fixture(xml))
    const result = applyParagraphText(paragraphs, 'section0_p0', '고친본문')

    expect(paragraphs[0].runs).toEqual([{ charPrIDRef: '4', text: '본문' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paragraphs[0]).toEqual({
      nodeId: 'section0_p0',
      text: '고친본문',
      paraPrIDRef: '2',
      runs: [{ charPrIDRef: '4', text: '고친본문' }],
    })
  })
})

function snapshot(paragraph: Paragraph) {
  return { text: paragraph.text, runs: paragraph.runs.map((run) => ({ ...run })) }
}
