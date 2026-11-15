import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildHwpx, buildT01Fixture, sectionXml, T01_HEADER } from '../fixture.ts'
import { applyFormat, readFormat } from './applyFormat.ts'

const HANCOM = 'http://www.hancom.co.kr/hwpml/2011'

function marginSection(text: string): string {
  return sectionXml(
    `${HANCOM}/section`,
    `${HANCOM}/paragraph`,
    `  <hp:p id="1" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:secPr><hp:pagePr landscape="WIDELY" width="59528" height="84188"><hp:margin header="1" footer="2" gutter="3" left="5669" right="5669" top="3543" bottom="3543"/></hp:pagePr></hp:secPr></hp:run>
    <hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run>
  </hp:p>`,
  )
}

describe('applyFormat', () => {
  it('T01 글자 모양과 문단 모양을 읽는다', () => {
    const format = readFormat(buildT01Fixture())
    expect(format.charPr['0']).toEqual({ height: 1000, textColor: '#000000' })
    expect(format.paraPr['0']).toEqual({ align: 'JUSTIFY' })
  })

  it('한 문단만 키우면 다른 문단의 글자 모양 번호와 크기는 남는다', () => {
    const result = applyFormat(buildT01Fixture(), {
      type: 'character',
      scope: 'paragraph',
      nodeId: 'section0_p1',
      height: 1600,
      textColor: '#ff0000',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const section = strFromU8(unzipSync(result.bytes)['Contents/section0.xml'])
    expect(section).toContain('charPrIDRef="0"')
    expect(section).toContain('charPrIDRef="1"')
    expect(result.format.charPr['0']).toEqual({ height: 1000, textColor: '#000000' })
    expect(result.format.charPr['1']).toEqual({ height: 1600, textColor: '#ff0000' })
    expect(section.indexOf('charPrIDRef="1"')).toBeGreaterThan(section.indexOf('charPrIDRef="0"'))
  })

  it('문서 전체 정렬은 문단 모양 정의를 고치고 글자 모양 번호는 남긴다', () => {
    const result = applyFormat(buildT01Fixture(), { type: 'paragraph', scope: 'document', nodeId: 'section0_p0', align: 'CENTER' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.format.paraPr['0'].align).toBe('CENTER')
    const section = strFromU8(unzipSync(result.bytes)['Contents/section0.xml'])
    expect(section).toContain('charPrIDRef="0"')
    expect(section).not.toContain('charPrIDRef="1"')
  })

  it('문서 전체 여백은 모든 구역의 쪽 여백만 바꾼다', () => {
    const header = T01_HEADER.replace('secCnt="1"', 'secCnt="2"')
    const original = buildHwpx({
      'Contents/header.xml': header,
      'Contents/section0.xml': marginSection('가'),
      'Contents/section1.xml': marginSection('나'),
    })
    const result = applyFormat(original, {
      type: 'section',
      scope: 'document',
      nodeId: 'section0_p0',
      margins: { left: 1000, right: 2000 },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.format.sections.map((section) => section.margins)).toEqual([
      { left: 1000, right: 2000, top: 3543, bottom: 3543, header: 1, footer: 2, gutter: 3 },
      { left: 1000, right: 2000, top: 3543, bottom: 3543, header: 1, footer: 2, gutter: 3 },
    ])
    const first = strFromU8(unzipSync(result.bytes)['Contents/section0.xml'])
    expect(first).toContain('<hp:t>가</hp:t>')
    expect(first).toContain('landscape="WIDELY"')
  })

  it('이 문장은 글자 런만 바꾸고 문단 모양과 쪽 여백은 남긴다', () => {
    const original = mixedFixture()
    const frozen = original.slice()
    const result = applyFormat(original, {
      type: 'character',
      scope: 'sentence',
      nodeId: 'section0_p0',
      height: 2000,
      textColor: '#0000ff',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(original).toEqual(frozen)
    const entries = unzipSync(result.bytes)
    const section = strFromU8(entries['Contents/section0.xml'])
    const header = strFromU8(entries['Contents/header.xml'])
    expect(section).toContain('<hp:run charPrIDRef="0"><hp:secPr>')
    expect(section).toContain('<hp:run charPrIDRef="1"><hp:t>가</hp:t>')
    expect(runOpen(section, '나')).toContain('charPrIDRef="2"')
    expect(section).toContain('<hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>')
    expect(section).toContain('<hp:pageBorderFill fill="yes"/>')
    expect(section).toContain('left="5669"')
    expect(header).toContain('<hh:lineSpacing type="PERCENT" value="160"/>')
    expect(header).toContain('vertical="BASELINE"')
    expect(result.format.charPr['0']).toEqual({ height: 1000, textColor: '#000000' })
    expect(result.format.charPr['1']).toEqual({ height: 2000, textColor: '#0000ff' })
    expect(result.format.charPr['2']).toEqual({ height: 2000, textColor: '#0000ff' })
    expect(header).toContain('shadeColor="#222222"')
    expect(header).toContain('<hh:fontRef hangul="0"/>')
    expect(result.format.paraPr['0'].align).toBe('JUSTIFY')
    expect(strFromU8(entries['settings.xml'])).toBe('<settings keep="all"/>')
  })

  it('이 문단 글자 모양은 같은 문단의 구역 런 참조도 바꾸고 다른 문단은 남긴다', () => {
    const result = applyFormat(mixedFixture(), {
      type: 'character',
      scope: 'paragraph',
      nodeId: 'section0_p0',
      height: 1800,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const section = strFromU8(unzipSync(result.bytes)['Contents/section0.xml'])
    expect(section).toContain('<hp:run charPrIDRef="2"><hp:secPr>')
    expect(section).toContain('<hp:t>다</hp:t>')
    expect(section).toContain('charPrIDRef="0"')
    expect(result.format.paraPr['0'].align).toBe('JUSTIFY')
    expect(result.format.sections[0].margins?.left).toBe(5669)
  })

  it('한 문단 정렬은 글자 모양과 줄간격을 남긴다', () => {
    const result = applyFormat(mixedFixture(), {
      type: 'paragraph',
      scope: 'paragraph',
      nodeId: 'section0_p0',
      align: 'CENTER',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entries = unzipSync(result.bytes)
    const section = strFromU8(entries['Contents/section0.xml'])
    const header = strFromU8(entries['Contents/header.xml'])
    expect(section).toContain('paraPrIDRef="1"')
    expect(section).toContain('paraPrIDRef="0"')
    expect(section).toContain('charPrIDRef="1"')
    expect(section).toContain('<hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>')
    expect(header).toContain('<hh:lineSpacing type="PERCENT" value="160"/>')
    expect(header).toContain('vertical="BASELINE"')
    expect(result.format.paraPr['1'].align).toBe('CENTER')
    expect(result.format.paraPr['0'].align).toBe('JUSTIFY')
    expect(result.format.charPr['1'].height).toBe(1100)
  })

  it('여백이 없으면 만들지 않고 거절한다', () => {
    const original = buildHwpx({
      'Contents/header.xml': T01_HEADER,
      'Contents/section0.xml': sectionXml(
        `${HANCOM}/section`,
        `${HANCOM}/paragraph`,
        `  <hp:p id="1" paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="59528" height="84188"/></hp:secPr></hp:run></hp:p>`,
      ),
    })
    const frozen = original.slice()
    const result = applyFormat(original, {
      type: 'section',
      scope: 'section',
      nodeId: 'section0_p0',
      margins: { left: 10 },
    })
    expect(result).toEqual({ ok: false, message: '쪽 여백이 없습니다' })
    expect(original).toEqual(frozen)
  })

  it('문서 여백은 이름 있는 여백 속성만 바꾸고 머리말 글자 모양은 남긴다', () => {
    const original = mixedFixture()
    const result = applyFormat(original, {
      type: 'section',
      scope: 'document',
      nodeId: 'section0_p0',
      margins: { top: 1000, bottom: 2000 },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entries = unzipSync(result.bytes)
    const section = strFromU8(entries['Contents/section0.xml'])
    expect(section).toContain('top="1000"')
    expect(section).toContain('bottom="2000"')
    expect(section).toContain('left="5669"')
    expect(section).toContain('<hp:pageBorderFill fill="yes"/>')
    expect(section).toContain('<hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>')
    expect(strFromU8(entries['Contents/header.xml'])).toBe(mixedHeader())
    expect(result.format.charPr['1'].height).toBe(1100)
  })
})

function mixedHeader(): string {
  return T01_HEADER.replace(
    '<hh:charProperties itemCnt="1">\n      <hh:charPr id="0" height="1000" textColor="#000000">\n        <hh:fontRef hangul="0"/>\n      </hh:charPr>\n    </hh:charProperties>',
    `<hh:charProperties itemCnt="2">
      <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="#111111">
        <hh:fontRef hangul="0"/>
      </hh:charPr>
      <hh:charPr id="1" height="1100" textColor="#00aa00" shadeColor="#222222">
        <hh:fontRef hangul="0"/>
      </hh:charPr>
    </hh:charProperties>`,
  ).replace(
    '<hh:paraPr id="0">\n        <hh:align horizontal="JUSTIFY"/>\n      </hh:paraPr>',
    `<hh:paraPr id="0">
        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
        <hh:lineSpacing type="PERCENT" value="160"/>
      </hh:paraPr>`,
  )
}

function mixedFixture(): Uint8Array {
  return buildHwpx({
    'Contents/header.xml': mixedHeader(),
    'Contents/section0.xml': sectionXml(
      `${HANCOM}/section`,
      `${HANCOM}/paragraph`,
      `  <hp:p id="1" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:secPr><hp:pagePr landscape="WIDELY" width="59528" height="84188"><hp:margin header="1" footer="2" gutter="3" left="5669" right="5669" top="3543" bottom="3543"/><hp:pageBorderFill fill="yes"/></hp:pagePr></hp:secPr></hp:run>
    <hp:run charPrIDRef="1"><hp:t>가</hp:t></hp:run>
    <hp:run charPrIDRef="0"><hp:t>나</hp:t></hp:run>
    <hp:linesegarray><hp:lineseg textpos="0" vertpos="16"/></hp:linesegarray>
  </hp:p>
  <hp:p id="2" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>다</hp:t></hp:run>
  </hp:p>`,
    ),
    'settings.xml': '<settings keep="all"/>',
  })
}

function runOpen(section: string, text: string): string {
  const at = section.indexOf(`<hp:t>${text}</hp:t>`)
  const start = section.lastIndexOf('<hp:run', at)
  return section.slice(start, section.indexOf('>', start) + 1)
}
