import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'

export type TextRun = {
  charPrIDRef: string
  text: string
}

export type Paragraph = {
  nodeId: string
  text: string
  paraPrIDRef: string
  runs: TextRun[]
}

export function readParagraphs(bytes: Uint8Array): Paragraph[] {
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
  for (let index = 0; index < count; index += 1) {
    const name = `Contents/section${index}.xml`
    const section = entries[name]
    if (!section) throw new Error(`${name}이 없습니다`)
    paragraphs.push(...paragraphsInSection(strFromU8(section), index))
  }
  return paragraphs
}

function sectionCount(xml: string): number {
  const root = parseXml(xml, 'header XML이 올바르지 않습니다').documentElement
  if (!root || localName(root) !== 'head') throw new Error('header XML이 올바르지 않습니다')
  const raw = root.getAttribute('secCnt')
  const count = Number(raw)
  if (!raw || !Number.isInteger(count) || count < 1) throw new Error('secCnt가 올바르지 않습니다')
  return count
}

function paragraphsInSection(xml: string, sectionIndex: number): Paragraph[] {
  const root = parseXml(xml, 'section XML이 올바르지 않습니다').documentElement
  if (!root || localName(root) !== 'sec') throw new Error('section XML이 올바르지 않습니다')

  return directChildren(root, 'p').map((paragraph, index) => {
    const runs = textRuns(paragraph)
    return {
      nodeId: `section${sectionIndex}_p${index}`,
      text: runs.map((run) => run.text).join(''),
      paraPrIDRef: paragraph.getAttribute('paraPrIDRef') ?? '',
      runs,
    }
  })
}

function textRuns(paragraph: Element): TextRun[] {
  return directChildren(paragraph, 'run').flatMap((run) => {
    const texts = directChildren(run, 't')
    if (texts.length === 0) return []
    return [
      {
        charPrIDRef: run.getAttribute('charPrIDRef') ?? '',
        text: texts.map(characterData).join(''),
      },
    ]
  })
}

function characterData(element: Element): string {
  let text = ''
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length; i += 1) {
      const child = node.childNodes[i]
      if (child.nodeType === 3) text += child.nodeValue ?? ''
      else if (isElement(child)) walk(child)
    }
  }
  walk(element)
  return text
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

  if (failed || !doc.documentElement || localName(doc.documentElement) === 'parsererror') {
    throw new Error(message)
  }
  return doc
}

function directChildren(element: Element, name: string): Element[] {
  const found: Element[] = []
  for (let i = 0; i < element.childNodes.length; i += 1) {
    const child = element.childNodes[i]
    if (isElement(child) && localName(child) === name) found.push(child)
  }
  return found
}

function localName(element: Element): string {
  return element.localName || element.nodeName.replace(/^.*:/, '')
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}
