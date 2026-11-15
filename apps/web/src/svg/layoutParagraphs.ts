export type ParagraphView = {
  nodeId: string
  text: string
}

export type SvgTextLine = {
  nodeId: string
  line: number
  text: string
  x: number
  y: number
  page: number
}

export type SvgPage = {
  page: number
  lines: SvgTextLine[]
}

export const PAGE_WIDTH = 794
export const PAGE_HEIGHT = 1123

const LINE_WIDTH = 710
const LINE_HEIGHT = 28
const BOTTOM_MARGIN = 40

export function layoutParagraphs(paragraphs: ParagraphView[]): SvgTextLine[] {
  const lines: SvgTextLine[] = []
  let page = 1
  let y = LINE_HEIGHT
  for (const paragraph of paragraphs) {
    wrapText(paragraph.text).forEach((text, line) => {
      if (y > PAGE_HEIGHT - BOTTOM_MARGIN) {
        page += 1
        y = LINE_HEIGHT
      }
      lines.push({ nodeId: paragraph.nodeId, line, text, x: 40, y, page })
      y += LINE_HEIGHT
    })
  }
  return lines
}

export function layoutPages(paragraphs: ParagraphView[]): SvgPage[] {
  const grouped = new Map<number, SvgTextLine[]>()
  for (const line of layoutParagraphs(paragraphs)) {
    const pageLines = grouped.get(line.page) ?? []
    pageLines.push(line)
    grouped.set(line.page, pageLines)
  }
  if (grouped.size === 0) return [{ page: 1, lines: [] }]
  return [...grouped.keys()].sort((left, right) => left - right).map((page) => ({
    page,
    lines: grouped.get(page) ?? [],
  }))
}

function wrapText(text: string): string[] {
  if (text.trim() === '') return []
  const lines: string[] = []
  let current = ''
  let width = 0
  for (const char of text) {
    const charWidth = char.charCodeAt(0) <= 0xff ? 8 : 16
    if (current !== '' && width + charWidth > LINE_WIDTH) {
      lines.push(current)
      current = char
      width = charWidth
    } else {
      current += char
      width += charWidth
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

export type ParagraphSelection = {
  node_id: string
  entry: string
  text: string
}

export function paragraphSelection(line: { nodeId: string; text: string }): ParagraphSelection {
  const section = /^section(\d+)_p\d+$/.exec(line.nodeId)
  return {
    node_id: line.nodeId,
    entry: section ? `Contents/section${section[1]}.xml` : '',
    text: line.text,
  }
}

