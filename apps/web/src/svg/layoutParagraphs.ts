export type ParagraphView = {
  nodeId: string
  text: string
}

export type SvgTextLine = {
  nodeId: string
  text: string
  x: number
  y: number
}

const LINE_WIDTH = 710

export function layoutParagraphs(paragraphs: ParagraphView[]): SvgTextLine[] {
  const lines: SvgTextLine[] = []
  let y = 28
  for (const paragraph of paragraphs) {
    for (const text of wrapText(paragraph.text)) {
      lines.push({ nodeId: paragraph.nodeId, text, x: 40, y })
      y += 28
    }
  }
  return lines
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

export function paragraphSelection(line: SvgTextLine): ParagraphSelection {
  const section = /^section(\d+)_p\d+$/.exec(line.nodeId)
  return {
    node_id: line.nodeId,
    entry: section ? `Contents/section${section[1]}.xml` : '',
    text: line.text,
  }
}

export function pageHeight(lines: SvgTextLine[]): number {
  if (lines.length === 0) return 160
  return Math.max(160, lines[lines.length - 1].y + 40)
}
