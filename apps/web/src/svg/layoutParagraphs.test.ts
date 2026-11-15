import { describe, expect, it } from 'vitest'
import { layoutPages, layoutParagraphs, PAGE_HEIGHT, PAGE_WIDTH, paragraphSelection } from './layoutParagraphs.ts'

describe('layoutParagraphs', () => {
  it('문단을 40, 28px 간격의 text 좌표로 쌓는다', () => {
    const lines = layoutParagraphs([
      { nodeId: 'section0_p0', text: '첫번째 문단이다.' },
      { nodeId: 'section0_p1', text: '두번째 문단이다.' },
    ])
    expect(lines).toEqual([
      { nodeId: 'section0_p0', line: 0, text: '첫번째 문단이다.', x: 40, y: 28, page: 1 },
      { nodeId: 'section0_p1', line: 0, text: '두번째 문단이다.', x: 40, y: 56, page: 1 },
    ])
    expect(PAGE_WIDTH).toBe(794)
    expect(PAGE_HEIGHT).toBe(1123)
    expect(layoutPages([
      { nodeId: 'section0_p0', text: '첫번째 문단이다.' },
      { nodeId: 'section0_p1', text: '두번째 문단이다.' },
    ])).toEqual([{ page: 1, lines }])
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
    expect(lines[0]).toMatchObject({ line: 0, x: 40, y: 28, page: 1 })
    expect(lines[1]).toMatchObject({ line: 1, y: 56, page: 1 })
    expect(lines.map((line) => line.text).join('')).toBe('가'.repeat(80))
  })

  it('한 페이지 높이를 넘는 줄은 다음 페이지로 넘긴다', () => {
    const lines = layoutParagraphs([{ nodeId: 'section0_p0', text: '가'.repeat(44 * 39) }])
    expect(lines).toHaveLength(39)
    expect(lines[37]).toMatchObject({ page: 1, line: 37, y: 1064 })
    expect(lines[38]).toMatchObject({ page: 2, line: 38, y: 28 })
    expect(layoutPages([{ nodeId: 'section0_p0', text: '가'.repeat(44 * 39) }]).map((page) => page.page)).toEqual([1, 2])
  })
})
