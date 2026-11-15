import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'
import type { Paragraph, TextRun } from '../index.ts'

export type VisualPicture = {
  kind: 'picture'
  width: number
  height: number
  imageId: string
}

export type VisualCell = {
  col: number
  row: number
  colSpan: number
  rowSpan: number
  width: number
  height: number
  text: string
  charPrIDRef: string
  pictures: VisualPicture[]
  tables: VisualTable[]
}

export type VisualTable = {
  kind: 'table'
  width: number
  height: number
  cols: number
  rows: number
  cells: VisualCell[]
}

export type VisualBlock = VisualPicture | VisualTable

export type VisualImage = {
  mediaType: string
  bytes: Uint8Array
}

export type VisualDocument = {
  paragraphs: Paragraph[]
  blocks: Record<string, VisualBlock[]>
  images: Record<string, VisualImage>
}

export function readVisual(bytes: Uint8Array): VisualDocument {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('ZIP을 읽을 수 없습니다')
  }
  const header = entries['Contents/header.xml']
  if (!header) throw new Error('Contents/header.xml이 없습니다')
  const count = sectionCount(strFromU8(header))
  const paragraphs: Paragraph[] = []
  const blocks: Record<string, VisualBlock[]> = {}
  const imageIds = new Set<string>()
  for (let index = 0; index < count; index += 1) {
    const name = `Contents/section${index}.xml`
    const section = entries[name]
    if (!section) throw new Error(`${name}이 없습니다`)
    const root = parseXml(strFromU8(section), 'section XML이 올바르지 않습니다').documentElement
    if (!root || localName(root) !== 'sec') throw new Error('section XML이 올바르지 않습니다')
    directChildren(root, 'p').forEach((paragraph, paragraphIndex) => {
      const nodeId = `section${index}_p${paragraphIndex}`
      const read = readParagraph(paragraph, imageIds)
      paragraphs.push({
        nodeId,
        text: read.runs.map((run) => run.text).join(''),
        paraPrIDRef: paragraph.getAttribute('paraPrIDRef') ?? '',
        runs: read.runs,
      })
      if (read.blocks.length > 0) blocks[nodeId] = read.blocks
    })
  }
  return { paragraphs, blocks, images: loadImages(strFromU8(entries['Contents/content.hpf'] ?? new Uint8Array()), entries, imageIds) }
}

function readParagraph(paragraph: Element, imageIds: Set<string>): { runs: TextRun[]; blocks: VisualBlock[] } {
  const runs: TextRun[] = []
  const blocks: VisualBlock[] = []
  for (const run of directChildren(paragraph, 'run')) {
    const texts = directChildren(run, 't')
    if (texts.length > 0) {
      runs.push({
        charPrIDRef: run.getAttribute('charPrIDRef') ?? '',
        text: texts.map(characterData).join(''),
      })
    }
    for (const child of directChildren(run)) {
      const name = localName(child)
      if (name === 'pic') {
        const picture = readPicture(child, imageIds)
        if (picture) blocks.push(picture)
      } else if (name === 'tbl') blocks.push(readTable(child, imageIds))
    }
  }
  return { runs, blocks }
}

function readPicture(picture: Element, imageIds: Set<string>): VisualPicture | null {
  const current = directChild(picture, 'curSz')
  const original = directChild(picture, 'orgSz')
  const size = directChild(picture, 'sz')
  const width = num(current, 'width') || num(original, 'width') || num(size, 'width')
  const height = num(current, 'height') || num(original, 'height') || num(size, 'height')
  const imageId = directChild(picture, 'img')?.getAttribute('binaryItemIDRef') ?? ''
  if (width <= 0 || height <= 0) return null
  if (imageId) imageIds.add(imageId)
  return { kind: 'picture', width, height, imageId }
}

function readTable(table: Element, imageIds: Set<string>): VisualTable {
  const size = directChild(table, 'sz')
  const cells = directChildren(table, 'tr').flatMap((row) => directChildren(row, 'tc').map((cell) => readCell(cell, imageIds)))
  const cols = Math.max(num(table, 'colCnt'), ...cells.map((cell) => cell.col + cell.colSpan), 1)
  const rows = Math.max(num(table, 'rowCnt'), ...cells.map((cell) => cell.row + cell.rowSpan), 1)
  return { kind: 'table', width: num(size, 'width'), height: num(size, 'height'), cols, rows, cells }
}

function readCell(cell: Element, imageIds: Set<string>): VisualCell {
  const paragraphs = directChildren(directChild(cell, 'subList'), 'p').map((paragraph) => readParagraph(paragraph, imageIds))
  const text = paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).filter((item) => item !== '').join('\n')
  const charPrIDRef = paragraphs.flatMap((paragraph) => paragraph.runs).find((run) => run.charPrIDRef)?.charPrIDRef ?? ''
  return {
    col: num(directChild(cell, 'cellAddr'), 'colAddr'),
    row: num(directChild(cell, 'cellAddr'), 'rowAddr'),
    colSpan: Math.max(1, num(directChild(cell, 'cellSpan'), 'colSpan')),
    rowSpan: Math.max(1, num(directChild(cell, 'cellSpan'), 'rowSpan')),
    width: num(directChild(cell, 'cellSz'), 'width'),
    height: num(directChild(cell, 'cellSz'), 'height'),
    text,
    charPrIDRef,
    pictures: paragraphs.flatMap((paragraph) => paragraph.blocks.filter((block): block is VisualPicture => block.kind === 'picture')),
    tables: paragraphs.flatMap((paragraph) => paragraph.blocks.filter((block): block is VisualTable => block.kind === 'table')),
  }
}

function loadImages(manifest: string, entries: Record<string, Uint8Array>, imageIds: Set<string>): Record<string, VisualImage> {
  const items = new Map<string, { href: string; mediaType: string }>()
  for (const tag of manifest.match(/<[^>]*\bitem\b[^>]*>/g) ?? []) {
    const id = quotedAttr(tag, 'id')
    const href = quotedAttr(tag, 'href')
    if (!id || !href) continue
    items.set(id, { href, mediaType: quotedAttr(tag, 'media-type') || mediaType(href) })
  }
  const images: Record<string, VisualImage> = {}
  for (const id of imageIds) {
    const item = items.get(id)
    const bytes = item ? entries[item.href] ?? entries[decodeURIComponent(item.href)] : undefined
    if (!item || !bytes) continue
    images[id] = { mediaType: item.mediaType, bytes }
  }
  return images
}

function sectionCount(xml: string): number {
  const root = parseXml(xml, 'header XML이 올바르지 않습니다').documentElement
  const raw = root?.getAttribute('secCnt')
  const count = Number(raw)
  if (!root || localName(root) !== 'head' || !raw || !Number.isInteger(count) || count < 1) throw new Error('secCnt가 올바르지 않습니다')
  return count
}

function parseXml(xml: string, message: string): Document {
  let failed = false
  let doc: Document
  try {
    doc = new DOMParser({
      onError(level: string) {
        if (level === 'error' || level === 'fatalError') failed = true
      },
    }).parseFromString(xml, 'text/xml')
  } catch {
    throw new Error(message)
  }
  if (failed || !doc.documentElement || localName(doc.documentElement) === 'parsererror') throw new Error(message)
  return doc
}

function directChild(element: Element | undefined, name: string): Element | undefined {
  return element ? directChildren(element, name)[0] : undefined
}

function directChildren(element: Element | undefined, name?: string): Element[] {
  if (!element) return []
  const found: Element[] = []
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes[index]
    if (isElement(child) && (name === undefined || localName(child) === name)) found.push(child)
  }
  return found
}

function characterData(element: Element): string {
  let text = ''
  const walk = (node: Node) => {
    for (let index = 0; index < node.childNodes.length; index += 1) {
      const child = node.childNodes[index]
      if (child.nodeType === 3) text += child.nodeValue ?? ''
      else if (isElement(child)) walk(child)
    }
  }
  walk(element)
  return text
}

function localName(element: Element): string {
  return element.localName || element.nodeName.replace(/^.*:/, '')
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function num(element: Element | undefined, name: string): number {
  if (!element) return 0
  const value = Number(element.getAttribute(name))
  return Number.isFinite(value) ? value : 0
}

function quotedAttr(tag: string, name: string): string {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(tag)?.[2] ?? ''
}

function mediaType(href: string): string {
  const lower = href.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/bmp'
}
