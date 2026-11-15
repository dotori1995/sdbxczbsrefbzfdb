import { describe, expect, it } from 'vitest'
import { layoutParagraphs, pageHeight, paragraphSelection } from './layoutParagraphs.ts'

describe('layoutParagraphs', () => {
  it('문단을 40, 28px 간격의 text 좌표로 쌓는다', () => {
    const lines = layoutParagraphs([
      { nodeId: 'section0_p0', text: '첫번째 문단이다.' },
      { nodeId: 'section0_p1', text: '두번째 문단이다.' },
    ])
    expect(lines).toEqual([
      { nodeId: 'section0_p0', text: '첫번째 문단이다.', x: 40, y: 28 },
      { nodeId: 'section0_p1', text: '두번째 문단이다.', x: 40, y: 56 },
    ])
    expect(pageHeight(lines)).toBeGreaterThan(56)
    expect(paragraphSelection(lines[1])).toEqual({
      node_id: 'section0_p1',
      entry: 'Contents/section0.xml',
      text: '두번째 문단이다.',
    })
  })

  it('빈 문단은 줄을 비우지 않고 긴 문단은 같은 nodeId로 나눈다', () => {
    const lines = layoutParagraphs([
      { nodeId: 'section0_p0', text: '   ' },
      { nodeId: 'section0_p1', text: '가'.repeat(80) },
    ])
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => line.nodeId === 'section0_p1')).toBe(true)
    expect(lines[0]).toMatchObject({ x: 40, y: 28 })
    expect(lines[1].y).toBe(56)
    expect(lines.map((line) => line.text).join('')).toBe('가'.repeat(80))
  })
})
