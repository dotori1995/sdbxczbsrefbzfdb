import { createHash } from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildHwpx, buildT02Fixture, sectionXml, T01_FIRST, T01_HEADER, T01_SECOND } from '../fixture.ts'
import { readParagraphs } from '../index.ts'
import { planPatch, readPackage } from './planPatch.ts'

const HANCOM = 'http://www.hancom.co.kr/hwpml/2011'
const REPLACEMENT = '수정한 문단이다'

function sectionWithDummy(): string {
  return sectionXml(
    `${HANCOM}/section`,
    `${HANCOM}/paragraph`,
    `  <hp:p id="100" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:secPr/></hp:run>
    <hp:run charPrIDRef="0"><hp:t>${T01_FIRST}</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>
  </hp:p>
  <hp:p id="200" paraPrIDRef="3">
    <hp:run charPrIDRef="9"><hp:t>${T01_SECOND}</hp:t></hp:run>
    <hp:mystery keep="yes" order="1"/>
  </hp:p>`,
  )
}

describe('planPatch', () => {
  it('대상 문단의 글자만 바꾸고 나머지 엔트리 해시는 같다', () => {
    const original = buildHwpx({
      'Contents/header.xml': T01_HEADER,
      'Contents/section0.xml': sectionWithDummy(),
      'settings.xml': '<settings keep="all"/>',
    })
    const doc = readPackage(original)
    const result = planPatch(doc, { targetNodeId: 'section0_p1', replacementText: REPLACEMENT })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.changed.map((entry) => entry.path)).toEqual(['Contents/section0.xml'])
    expect(result.plan.kept.map((entry) => entry.path).sort()).toEqual(['Contents/header.xml', 'mimetype', 'settings.xml'])
    for (const entry of result.plan.kept) {
      expect(entry.bytes).toBe(doc.entries[entry.path])
      expect(sha(entry.bytes)).toBe(sha(doc.entries[entry.path]))
    }

    const patched = unzipSync(result.zip)
    expect(sha(patched.mimetype)).toBe(sha(doc.entries.mimetype))
    expect(sha(patched['Contents/header.xml'])).toBe(sha(doc.entries['Contents/header.xml']))
    expect(sha(patched['settings.xml'])).toBe(sha(doc.entries['settings.xml']))
    const section = strFromU8(patched['Contents/section0.xml'])
    expect(section).toContain(`<hp:t>${REPLACEMENT}</hp:t>`)
    expect(section).toContain(`<hp:t>${T01_FIRST}</hp:t>`)
    expect(section).not.toContain(`<hp:t>${T01_SECOND}</hp:t>`)
    expect(section).toContain('<hp:p id="200" paraPrIDRef="3">')
    expect(section).toContain('<hp:run charPrIDRef="9">')
    expect(section).toContain('<hp:secPr/>')
    expect(section).toContain('<hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>')
    expect(section).toContain('<hp:mystery keep="yes" order="1"/>')
    expect(readParagraphs(result.zip).map((paragraph) => paragraph.text)).toEqual([T01_FIRST, REPLACEMENT])
  })

  it('MIXED_RUNS는 결과 ZIP을 만들지 않는다', () => {
    const result = planPatch(readPackage(buildT02Fixture()), { targetNodeId: 'section0_p0', replacementText: REPLACEMENT })
    expect(result).toEqual({ ok: false, code: 'MIXED_RUNS', message: '글자 런이 하나가 아니라 적용하지 않습니다' })
    expect(result).not.toHaveProperty('zip')
  })
})

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
