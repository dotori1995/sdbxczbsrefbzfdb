import { unzipSync } from 'fflate'

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

export { applyParagraphText, type ApplyParagraphResult } from './model/applyParagraphText.ts'
export { planPatch, readPackage, type HwpxPackage, type PatchPlan, type PlanPatchResult } from './patch/planPatch.ts'
export { applyFormat, readFormat, type DocumentFormat, type FormatCommand, type PageMargins } from './format/applyFormat.ts'
export { decodeBmp } from './visual/bmp.ts'
export { readVisual, type VisualBlock, type VisualCell, type VisualDocument, type VisualImage, type VisualPicture, type VisualTable } from './visual/readVisual.ts'

const SECTION_ENTRY = /^Contents\/section\d+\.xml$/

export function readParagraphs(bytes: Uint8Array): Paragraph[] {
  let entries: Record<string, Uint8Array>
  try {
    // 글자만 연다. 그림 BinData는 압축을 풀지 않는다.
    entries = unzipSync(bytes, {
      filter: (file) => file.name === 'Contents/header.xml' || SECTION_ENTRY.test(file.name),
    })
  } catch {
    throw new Error('ZIP을 읽을 수 없습니다')
  }

  const header = entries['Contents/header.xml']
  if (!header) throw new Error('Contents/header.xml이 없습니다')

  const count = sectionCount(new TextDecoder().decode(header))
  const paragraphs: Paragraph[] = []
  const decoder = new TextDecoder()
  for (let index = 0; index < count; index += 1) {
    const name = `Contents/section${index}.xml`
    const section = entries[name]
    if (!section) throw new Error(`${name}이 없습니다`)
    paragraphs.push(...paragraphsInSection(decoder.decode(section), index))
  }
  return paragraphs
}

function sectionCount(xml: string): number {
  const open = firstOpenTag(xml)
  if (!open || localOf(open.name) !== 'head') throw new Error('header XML이 올바르지 않습니다')
  const raw = attrValue(open.attrs, 'secCnt')
  const count = Number(raw)
  if (!raw || !Number.isInteger(count) || count < 1) throw new Error('secCnt가 올바르지 않습니다')
  return count
}

function paragraphsInSection(xml: string, sectionIndex: number): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let sawSec = false
  let depth = 0
  let secDepth = -1
  let pDepth = -1
  let runDepth = -1
  let tDepth = -1
  let paragraphCount = 0
  let paraPrIDRef = ''
  let charPrIDRef = ''
  let runs: TextRun[] = []
  let texts: string[] = []
  let text = ''
  let index = 0

  const closeT = () => {
    texts.push(xmlValue(text))
    text = ''
    tDepth = -1
  }
  const closeRun = () => {
    if (tDepth >= 0) closeT()
    if (texts.length > 0) runs.push({ charPrIDRef, text: texts.join('') })
    texts = []
    runDepth = -1
  }
  const closeP = () => {
    if (runDepth >= 0) closeRun()
    paragraphs.push({
      nodeId: `section${sectionIndex}_p${paragraphCount}`,
      text: runs.map((run) => run.text).join(''),
      paraPrIDRef,
      runs,
    })
    paragraphCount += 1
    runs = []
    pDepth = -1
  }

  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start < 0) {
      if (tDepth >= 0) text += xml.slice(index)
      break
    }
    if (tDepth >= 0 && start > index) text += xml.slice(index, start)
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4)
      index = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9)
      index = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2)
      index = end < 0 ? xml.length : end + 2
      continue
    }
    if (xml.startsWith('<!', start)) {
      const end = xml.indexOf('>', start + 2)
      index = end < 0 ? xml.length : end + 1
      continue
    }

    const end = tagEnd(xml, start + 1)
    if (end < 0) throw new Error('section XML이 올바르지 않습니다')
    const raw = xml.slice(start + 1, end)
    const closing = raw.startsWith('/')
    const body = closing ? raw.slice(1) : raw
    const selfClosing = !closing && /\/\s*$/.test(body)
    const content = selfClosing ? body.replace(/\/\s*$/, '') : body
    const name = content.trim().split(/\s+/)[0] ?? ''
    const local = localOf(name)
    const attrs = content.slice(Math.max(content.indexOf(name), 0) + name.length)

    if (!closing && !sawSec) {
      if (local !== 'sec') throw new Error('section XML이 올바르지 않습니다')
      sawSec = true
      secDepth = depth
    } else if (!closing && secDepth >= 0 && depth === secDepth + 1 && local === 'p' && pDepth < 0) {
      pDepth = depth
      paraPrIDRef = xmlValue(attrValue(attrs, 'paraPrIDRef'))
      runs = []
    } else if (!closing && pDepth >= 0 && depth === pDepth + 1 && local === 'run' && runDepth < 0) {
      runDepth = depth
      charPrIDRef = xmlValue(attrValue(attrs, 'charPrIDRef'))
      texts = []
    } else if (!closing && runDepth >= 0 && depth === runDepth + 1 && local === 't' && tDepth < 0) {
      tDepth = depth
      text = ''
    }

    if (closing) {
      if (depth === 0) throw new Error('section XML이 올바르지 않습니다')
      depth -= 1
      if (tDepth >= 0 && depth === tDepth && local === 't') closeT()
      else if (runDepth >= 0 && depth === runDepth && local === 'run') closeRun()
      else if (pDepth >= 0 && depth === pDepth && local === 'p') closeP()
    } else if (!selfClosing) {
      depth += 1
    } else if (tDepth >= 0 && depth === tDepth && local === 't') closeT()
    else if (runDepth >= 0 && depth === runDepth && local === 'run') closeRun()
    else if (pDepth >= 0 && depth === pDepth && local === 'p') closeP()

    index = end + 1
  }

  if (!sawSec) throw new Error('section XML이 올바르지 않습니다')
  return paragraphs
}

function firstOpenTag(xml: string): { name: string; attrs: string } | null {
  let index = 0
  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start < 0) return null
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4)
      index = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9)
      index = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2)
      index = end < 0 ? xml.length : end + 2
      continue
    }
    if (xml.startsWith('<!', start)) {
      const end = xml.indexOf('>', start + 2)
      index = end < 0 ? xml.length : end + 1
      continue
    }
    const end = tagEnd(xml, start + 1)
    if (end < 0) return null
    const raw = xml.slice(start + 1, end)
    if (raw.startsWith('/')) {
      index = end + 1
      continue
    }
    const selfClosing = /\/\s*$/.test(raw)
    const content = selfClosing ? raw.replace(/\/\s*$/, '') : raw
    const name = content.trim().split(/\s+/)[0] ?? ''
    return { name, attrs: content.slice(Math.max(content.indexOf(name), 0) + name.length) }
  }
  return null
}

function localOf(name: string): string {
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name
}

function attrValue(attrs: string, name: string): string {
  const matched = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(attrs)
  return matched?.[2] ?? ''
}

function xmlValue(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n')
  if (!normalized.includes('&')) return normalized
  return normalized.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_all, token: string) => {
    if (token === 'amp') return '&'
    if (token === 'lt') return '<'
    if (token === 'gt') return '>'
    if (token === 'quot') return '"'
    if (token === 'apos') return "'"
    const code = token.startsWith('#x') ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10)
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) throw new Error('section XML이 올바르지 않습니다')
    return String.fromCodePoint(code)
  })
}

function tagEnd(xml: string, from: number): number {
  let quote = ''
  for (let index = from; index < xml.length; index += 1) {
    const char = xml[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}
