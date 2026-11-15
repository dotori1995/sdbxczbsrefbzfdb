import { describe, expect, it } from 'vitest'
import { buildHwpx, buildT01Fixture, sectionXml, T01_HEADER } from '../fixture.ts'
import { readParagraphs } from '../index.ts'
import { decodeBmp } from './bmp.ts'
import { readVisual } from './readVisual.ts'

const HANCOM = 'http://www.hancom.co.kr/hwpml/2011'

describe('readVisual', () => {
  it('글자만 있는 문단은 기존 문단 목록과 같다', () => {
    const bytes = buildT01Fixture()
    expect(readVisual(bytes).paragraphs).toEqual(readParagraphs(bytes))
    expect(readVisual(bytes).blocks).toEqual({})
  })

  it('그림과 표 칸을 읽고 칸 글자는 바깥 문단에 섞지 않는다', () => {
    const bmp = bmp32()
    const bytes = buildHwpx({
      'Contents/header.xml': T01_HEADER,
      'Contents/content.hpf': `<?xml version="1.0"?><opf:package><opf:manifest><opf:item id="image1" href="BinData/image1.bmp" media-type="image/bmp"/></opf:manifest></opf:package>`,
      'BinData/image1.bmp': new TextDecoder().decode(bmp),
      'Contents/section0.xml': sectionXml(
        `${HANCOM}/section`,
        `${HANCOM}/paragraph`,
        `  <hp:p id="1" paraPrIDRef="0">
    <hp:run charPrIDRef="0"><hp:t>본문</hp:t></hp:run>
    <hp:run charPrIDRef="0">
      <hp:pic><hp:curSz width="1000" height="500"/><hp:img binaryItemIDRef="image1"/></hp:pic>
      <hp:tbl>
        <hp:sz width="4000" height="2000"/>
        <hp:tr><hp:tc>
          <hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="4"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList>
          <hp:cellAddr colAddr="0" rowAddr="0"/>
          <hp:cellSpan colSpan="1" rowSpan="1"/>
          <hp:cellSz width="4000" height="2000"/>
        </hp:tc></hp:tr>
      </hp:tbl>
    </hp:run>
  </hp:p>`,
      ),
    })
    const visual = readVisual(bytes)
    expect(visual.paragraphs[0].text).toBe('본문')
    expect(visual.blocks.section0_p0).toEqual([
      { kind: 'picture', width: 1000, height: 500, imageId: 'image1' },
      {
        kind: 'table',
        width: 4000,
        height: 2000,
        cols: 1,
        rows: 1,
        cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, width: 4000, height: 2000, text: '칸', charPrIDRef: '4', pictures: [], tables: [] }],
      },
    ])
    expect(decodeBmp(visual.images.image1.bytes)?.width).toBe(1)
  })
})

function bmp32(): Uint8Array {
  const bytes = new Uint8Array(58)
  const view = new DataView(bytes.buffer)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  view.setUint32(2, 58, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, 1, true)
  view.setInt32(22, 1, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 32, true)
  bytes[54] = 1
  bytes[55] = 2
  bytes[56] = 3
  bytes[57] = 0
  return bytes
}
