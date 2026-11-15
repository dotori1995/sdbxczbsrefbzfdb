export type StyledRun = {
  text: string
  fontSize: number
  fill: string
}

export type PageFrame = {
  pageWidthHwp: number
  pageHeightHwp: number
  margins: { left: number; right: number; top: number; bottom: number }
}

export type DrawnPicture = {
  kind: 'picture'
  width: number
  height: number
  imageId: string
}

export type DrawnCell = {
  col: number
  row: number
  colSpan: number
  rowSpan: number
  width: number
  height: number
  text: string
  fontSize: number
  fill: string
  pictures: DrawnPicture[]
}

export type DrawnTable = {
  kind: 'table'
  width: number
  height: number
  cols: number
  rows: number
  cells: DrawnCell[]
}

export type DrawnBlock = DrawnPicture | DrawnTable

export type ParagraphView = {
  nodeId: string
  text: string
  runs?: StyledRun[]
  align?: string
  frame?: PageFrame
  blocks?: DrawnBlock[]
}

export type SvgPicture = {
  imageId: string
  x: number
  y: number
  width: number
  height: number
}

export type SvgTableCell = {
  x: number
  y: number
  width: number
  height: number
  lines: { text: string; x: number; y: number; fontSize: number; fill: string }[]
  pictures: SvgPicture[]
}

export type SvgTable = {
  x: number
  y: number
  width: number
  height: number
  cells: SvgTableCell[]
}

export type DocumentPage = {
  page: number
  lines: SvgTextLine[]
  pictures: SvgPicture[]
  tables: SvgTable[]
}

export type LineSegment = {
  text: string
  fontSize: number
  fill: string
}

export type SvgTextLine = {
  nodeId: string
  line: number
  text: string
  x: number
  y: number
  page: number
  fontSize?: number
  fill?: string
  textAnchor?: 'start' | 'middle' | 'end'
  segments?: LineSegment[]
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
  if (paragraphs.some((paragraph) => paragraph.runs || paragraph.frame || paragraph.align)) return layoutStyled(paragraphs)
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

function layoutStyled(paragraphs: ParagraphView[]): SvgTextLine[] {
  const lines: SvgTextLine[] = []
  let page = 1
  let y = LINE_HEIGHT
  let placed = false
  for (const paragraph of paragraphs) {
    const runs = visibleRuns(paragraph)
    if (runs.length === 0) continue
    const box = contentBox(paragraph.frame)
    const wrapped = wrapRuns(runs, box.width)
    for (const [line, segments] of wrapped.entries()) {
      const fontSize = Math.max(...segments.map((segment) => segment.fontSize))
      const lineHeight = Math.max(LINE_HEIGHT, fontSize * 1.6)
      const baseline = box.top + fontSize
      if (!placed) y = baseline
      if (placed && baseline <= PAGE_HEIGHT - box.bottom && y > PAGE_HEIGHT - box.bottom) {
        page += 1
        y = baseline
      }
      const textAnchor = anchorOf(paragraph.align)
      lines.push({
        nodeId: paragraph.nodeId,
        line,
        text: segments.map((segment) => segment.text).join(''),
        x: textAnchor === 'middle' ? box.left + box.width / 2 : textAnchor === 'end' ? box.left + box.width : box.left,
        y,
        page,
        fontSize: segments[0].fontSize,
        fill: segments[0].fill,
        textAnchor,
        segments,
      })
      y += lineHeight
      placed = true
    }
  }
  return lines
}

function visibleRuns(paragraph: ParagraphView): StyledRun[] {
  if (paragraph.text.trim() === '') return []
  const runs = paragraph.runs?.filter((run) => run.text !== '') ?? []
  if (runs.length > 0) return runs
  return [{ text: paragraph.text, fontSize: 16, fill: '#1c1917' }]
}

function contentBox(frame: PageFrame | undefined): { left: number; width: number; top: number; bottom: number } {
  if (!frame || frame.pageWidthHwp <= 0 || frame.pageHeightHwp <= 0) {
    return { left: 40, width: LINE_WIDTH, top: 0, bottom: BOTTOM_MARGIN }
  }
  const scaleX = PAGE_WIDTH / frame.pageWidthHwp
  const scaleY = PAGE_HEIGHT / frame.pageHeightHwp
  const left = frame.margins.left * scaleX
  const right = frame.margins.right * scaleX
  return {
    left,
    width: Math.max(40, PAGE_WIDTH - left - right),
    top: frame.margins.top * scaleY,
    bottom: frame.margins.bottom * scaleY,
  }
}

function wrapRuns(runs: StyledRun[], maxWidth: number): LineSegment[][] {
  const lines: LineSegment[][] = []
  let current: LineSegment[] = []
  let width = 0
  for (const run of runs) {
    for (const char of run.text) {
      const charWidth = (char.charCodeAt(0) <= 0xff ? 0.5 : 1) * run.fontSize
      if (current.length > 0 && width + charWidth > maxWidth) {
        lines.push(current)
        current = []
        width = 0
      }
      const last = current[current.length - 1]
      if (last && last.fontSize === run.fontSize && last.fill === run.fill) last.text += char
      else current.push({ text: char, fontSize: run.fontSize, fill: run.fill })
      width += charWidth
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function anchorOf(align: string | undefined): 'start' | 'middle' | 'end' {
  if (align === 'CENTER') return 'middle'
  if (align === 'RIGHT') return 'end'
  return 'start'
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

