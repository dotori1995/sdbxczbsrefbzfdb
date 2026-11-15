import { inflateSync, strToU8, unzipSync } from 'fflate'
import type { HwpxPackage } from '../patch/planPatch.ts'
import { attr, setAttr } from './markup.ts'
import { tags, matchingClose, directElements } from './markup.ts'
import { repackZip } from './repackZip.ts'

export type PageMargins = {
  left: number
  right: number
  top: number
  bottom: number
  header: number
  footer: number
  gutter: number
}

export type SectionFormat = {
  pageWidth: number
  pageHeight: number
  margins: PageMargins | null
}

export type DocumentFormat = {
  charPr: Record<string, { height: number; textColor: string }>
  paraPr: Record<string, { align: string }>
  sections: SectionFormat[]
}

export type FormatCommand =
  | { type: 'character'; scope: 'sentence' | 'paragraph' | 'document'; nodeId: string; height?: number; textColor?: string }
  | { type: 'paragraph'; scope: 'paragraph' | 'document'; nodeId: string; align: string }
  | { type: 'section'; scope: 'section' | 'document'; nodeId: string; margins: Partial<PageMargins> }

export type FormatResult = { ok: true; bytes: Uint8Array; format: DocumentFormat } | { ok: false; message: string }

const MARGIN_NAMES = ['left', 'right', 'top', 'bottom', 'header', 'footer', 'gutter'] as const
const SECTION_ENTRY = /^Contents\/section\d+\.xml$/

type RawTag = {
  start: number
  end: number
  local: string
  closing: boolean
  selfClosing: boolean
  attrs: string
}

type RefHit = {
  section: string
  id: string
  start: number
  end: number
}

export function readFormat(bytes: Uint8Array): DocumentFormat {
  // 그림은 서식과 무관하다. 머리글과 구역 XML만 푼다.
  return readFormatFromPackage({
    entries: unzipSync(bytes, {
      filter: (file) => file.name === 'Contents/header.xml' || SECTION_ENTRY.test(file.name),
    }),
  })
}

export function applyFormat(bytes: Uint8Array, command: FormatCommand): FormatResult {
  const catalog = readNames(bytes)
  const headerName = 'Contents/header.xml'
  if (!catalog.has(headerName)) return { ok: false, message: 'Contents/header.xml이 없습니다' }
  const sections = [...catalog.keys()].filter((name) => SECTION_ENTRY.test(name)).sort((left, right) => sectionNumber(left) - sectionNumber(right))
  const changed: Record<string, Uint8Array> = {}

  if (command.type === 'section') {
    const indexes = command.scope === 'document' ? sections.map((_name, index) => index) : [sectionIndex(command.nodeId)]
    for (const index of indexes) {
      const name = sections[index]
      if (!name) return { ok: false, message: '대상 구역이 없습니다' }
      const xml = inflateNamed(bytes, name)
      const next = setMargins(xml, command.margins)
      if (!next.ok) return next
      if (next.xml !== xml) changed[name] = strToU8(next.xml)
    }
  } else if (command.type === 'character') {
    const applied = applyCharacter(bytes, sections, command)
    if (!applied.ok) return applied
    Object.assign(changed, applied.changed)
  } else {
    const applied = applyParagraph(bytes, sections, command)
    if (!applied.ok) return applied
    Object.assign(changed, applied.changed)
  }

  const packed = repackZip(bytes, changed)
  return { ok: true, bytes: packed, format: readFormat(packed) }
}

function applyCharacter(
  bytes: Uint8Array,
  sections: string[],
  command: Extract<FormatCommand, { type: 'character' }>,
): { ok: true; changed: Record<string, Uint8Array> } | { ok: false; message: string } {
  const textOnly = command.scope === 'sentence'
  const paragraphIndex = command.scope === 'document' ? null : paragraphRef(command.nodeId)?.paragraph ?? -1
  const sectionName = command.scope === 'document' ? null : sectionNameOf(command.nodeId)
  if (paragraphIndex === -1 || (sectionName && !sections.includes(sectionName))) {
    return { ok: false, message: '대상 글자 조각이 없습니다' }
  }

  const loaded = new Map<string, string>()
  const targets: RefHit[] = []
  const names = command.scope === 'document' ? sections : [sectionName as string]
  for (const name of names) {
    const xml = loadXml(bytes, loaded, name)
    targets.push(...characterTargets(xml, name, paragraphIndex, textOnly))
  }
  if (targets.length === 0) return { ok: false, message: '대상 글자 조각이 없습니다' }

  let header = loadXml(bytes, loaded, 'Contents/header.xml')
  const edits = new Map<string, { start: number; end: number; value: string }[]>()
  for (const id of unique(targets.map((target) => target.id))) {
    const group = targets.filter((target) => target.id === id)
    const outside = countEverywhere(bytes, sections, loaded, 'charPrIDRef', id) > group.length
    if (outside) {
      const cloned = cloneStyle(header, 'charPr', 'charProperties', id, (open) => patchCharacter(open, command))
      header = cloned.header
      rememberEdits(edits, group, cloned.id)
    } else {
      header = patchOpen(header, 'charPr', id, (open) => patchCharacter(open, command))
    }
  }

  return { ok: true, changed: changedEntries(loaded, applyEdits(loaded, edits), header) }
}

function applyParagraph(
  bytes: Uint8Array,
  sections: string[],
  command: Extract<FormatCommand, { type: 'paragraph' }>,
): { ok: true; changed: Record<string, Uint8Array> } | { ok: false; message: string } {
  const paragraphIndex = command.scope === 'document' ? null : paragraphRef(command.nodeId)?.paragraph ?? -1
  const sectionName = command.scope === 'document' ? null : sectionNameOf(command.nodeId)
  if (paragraphIndex === -1 || (sectionName && !sections.includes(sectionName))) {
    return { ok: false, message: '대상 문단이 없습니다' }
  }

  const loaded = new Map<string, string>()
  const targets: RefHit[] = []
  const names = command.scope === 'document' ? sections : [sectionName as string]
  for (const name of names) {
    targets.push(...paragraphTargets(loadXml(bytes, loaded, name), name, paragraphIndex))
  }
  if (targets.length === 0) return { ok: false, message: '대상 문단이 없습니다' }

  let header = loadXml(bytes, loaded, 'Contents/header.xml')
  const edits = new Map<string, { start: number; end: number; value: string }[]>()
  for (const id of unique(targets.map((target) => target.id))) {
    const group = targets.filter((target) => target.id === id)
    const outside = countEverywhere(bytes, sections, loaded, 'paraPrIDRef', id) > group.length
    if (outside) {
      const cloned = cloneStyle(header, 'paraPr', 'paraProperties', id, (open) => open)
      header = patchAlign(cloned.header, cloned.id, command.align)
      rememberEdits(edits, group, cloned.id)
    } else {
      header = patchAlign(header, id, command.align)
    }
  }
  return { ok: true, changed: changedEntries(loaded, applyEdits(loaded, edits), header) }
}

function rememberEdits(edits: Map<string, { start: number; end: number; value: string }[]>, targets: RefHit[], nextId: string) {
  for (const target of targets) {
    if (target.id === nextId) continue
    const list = edits.get(target.section) ?? []
    list.push({ start: target.start, end: target.end, value: nextId })
    edits.set(target.section, list)
  }
}

function applyEdits(sections: Map<string, string>, edits: Map<string, { start: number; end: number; value: string }[]>): Set<string> {
  const dirty = new Set<string>()
  for (const [section, spans] of edits) {
    const xml = sections.get(section)
    if (!xml) continue
    const next = replaceSpans(xml, spans)
    if (next !== xml) {
      sections.set(section, next)
      dirty.add(section)
    }
  }
  return dirty
}

function changedEntries(loaded: Map<string, string>, dirty: Set<string>, header: string): Record<string, Uint8Array> {
  const changed: Record<string, Uint8Array> = {}
  const originalHeader = loaded.get('Contents/header.xml')
  if (header !== originalHeader) changed['Contents/header.xml'] = strToU8(header)
  for (const name of dirty) {
    const xml = loaded.get(name)
    if (xml) changed[name] = strToU8(xml)
  }
  return changed
}

function patchCharacter(open: string, command: Extract<FormatCommand, { type: 'character' }>): string {
  let next = open
  if (command.height !== undefined) next = setAttr(next, 'height', String(command.height))
  if (command.textColor !== undefined) next = setAttr(next, 'textColor', command.textColor)
  return next
}

function patchOpen(xml: string, local: string, id: string, patch: (open: string) => string): string {
  const tag = findOpen(xml, local, id)
  if (!tag) return xml
  const open = patch(xml.slice(tag.start, tag.end))
  return `${xml.slice(0, tag.start)}${open}${xml.slice(tag.end)}`
}

function patchAlign(xml: string, id: string, align: string): string {
  const para = findOpen(xml, 'paraPr', id)
  if (!para || para.selfClosing) return xml
  const alignTag = directChild(xml, para.end, 'align')
  if (!alignTag) return xml
  const open = setAttr(xml.slice(alignTag.start, alignTag.end), 'horizontal', align)
  return `${xml.slice(0, alignTag.start)}${open}${xml.slice(alignTag.end)}`
}

function cloneStyle(
  xml: string,
  local: string,
  parentLocal: string,
  id: string,
  patch: (open: string) => string,
): { header: string; id: string } {
  const element = findElement(xml, local, id)
  if (!element) return { header: xml, id }
  const nextId = String(maxStyleId(xml, local) + 1)
  const body = xml.slice(element.start, element.end)
  const openLen = element.openEnd - element.start
  const cloned = `${patch(setAttr(body.slice(0, openLen), 'id', nextId))}${body.slice(openLen)}`
  let header = `${xml.slice(0, element.end)}${cloned}${xml.slice(element.end)}`
  const parent = findOpen(xml, parentLocal)
  if (parent && parent.end <= element.start) {
    const count = Number(attr(parent.attrs, 'itemCnt'))
    if (Number.isInteger(count) && count > 0) {
      const open = setAttr(header.slice(parent.start, parent.end), 'itemCnt', String(count + 1))
      header = `${header.slice(0, parent.start)}${open}${header.slice(parent.end)}`
    }
  }
  return { header, id: nextId }
}

function replaceSpans(xml: string, spans: { start: number; end: number; value: string }[]): string {
  const ordered = [...spans].sort((left, right) => left.start - right.start)
  let out = ''
  let cursor = 0
  for (const span of ordered) {
    if (span.start < cursor || xml.slice(span.start, span.end) === span.value) continue
    out += xml.slice(cursor, span.start)
    out += span.value
    cursor = span.end
  }
  return out + xml.slice(cursor)
}

function countEverywhere(bytes: Uint8Array, sections: string[], loaded: Map<string, string>, name: string, id: string): number {
  let count = 0
  for (const section of sections) count += countRefs(loadXml(bytes, loaded, section), name, id)
  return count
}

function countRefs(xml: string, name: string, id: string): number {
  return countExact(xml, `${name}="${id}"`) + countExact(xml, `${name}='${id}'`)
}

function countExact(xml: string, needle: string): number {
  let count = 0
  let from = 0
  while (from < xml.length) {
    const found = xml.indexOf(needle, from)
    if (found < 0) return count
    count += 1
    from = found + needle.length
  }
  return count
}

function characterTargets(xml: string, section: string, paragraphIndex: number | null, textOnly: boolean): RefHit[] {
  const found: RefHit[] = []
  let depth = 0
  let secDepth = -1
  let pDepth = -1
  let pIndex = -1
  let runDepth = -1
  let runHit: RefHit | null = null
  let runHasText = false
  let wanted = false
  let index = 0

  const finishRun = () => {
    if (runHit && (!textOnly || runHasText)) found.push(runHit)
    runHit = null
    runHasText = false
    runDepth = -1
  }

  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) break
    const tag = next.tag
    index = next.next
    if (tag.closing) {
      if (depth === 0) break
      depth -= 1
      if (runDepth >= 0 && depth === runDepth && tag.local === 'run') finishRun()
      else if (pDepth >= 0 && depth === pDepth && tag.local === 'p') {
        pDepth = -1
        if (paragraphIndex !== null && wanted) break
      }
      continue
    }

    if (secDepth < 0 && tag.local === 'sec') secDepth = depth
    else if (secDepth >= 0 && depth === secDepth + 1 && tag.local === 'p' && pDepth < 0) {
      pIndex += 1
      pDepth = depth
      wanted = paragraphIndex === null || pIndex === paragraphIndex
    } else if (wanted && pDepth >= 0 && depth === pDepth + 1 && tag.local === 'run' && runDepth < 0) {
      const span = valueSpan(xml.slice(tag.start, tag.end), tag.start, 'charPrIDRef')
      runDepth = depth
      runHasText = false
      runHit = span ? { section, id: span.value, start: span.start, end: span.end } : null
    } else if (runDepth >= 0 && depth === runDepth + 1 && tag.local === 't') runHasText = true

    if (tag.selfClosing) {
      if (runDepth >= 0 && depth === runDepth && tag.local === 'run') finishRun()
      else if (pDepth >= 0 && depth === pDepth && tag.local === 'p') {
        pDepth = -1
        if (paragraphIndex !== null && wanted) break
      }
    } else depth += 1
  }
  return found
}

function paragraphTargets(xml: string, section: string, paragraphIndex: number | null): RefHit[] {
  const found: RefHit[] = []
  let depth = 0
  let secDepth = -1
  let pDepth = -1
  let pIndex = -1
  let index = 0
  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) break
    const tag = next.tag
    index = next.next
    if (tag.closing) {
      if (depth === 0) break
      depth -= 1
      if (pDepth >= 0 && depth === pDepth && tag.local === 'p') pDepth = -1
      continue
    }
    if (secDepth < 0 && tag.local === 'sec') secDepth = depth
    else if (secDepth >= 0 && depth === secDepth + 1 && tag.local === 'p' && pDepth < 0) {
      pIndex += 1
      const wanted = paragraphIndex === null || pIndex === paragraphIndex
      if (wanted) {
        const span = valueSpan(xml.slice(tag.start, tag.end), tag.start, 'paraPrIDRef')
        if (span) found.push({ section, id: span.value, start: span.start, end: span.end })
        if (paragraphIndex !== null) break
      }
      pDepth = depth
    }
    if (!tag.selfClosing) depth += 1
    else if (pDepth >= 0 && depth === pDepth && tag.local === 'p') pDepth = -1
  }
  return found
}

function setMargins(xml: string, margins: Partial<PageMargins>): { ok: true; xml: string } | { ok: false; message: string } {
  const page = findOpen(xml, 'pagePr')
  if (!page) return { ok: false, message: '쪽 설정이 없습니다' }
  const margin = directChild(xml, page.end, 'margin')
  if (!margin) return { ok: false, message: '쪽 여백이 없습니다' }
  let open = xml.slice(margin.start, margin.end)
  for (const name of MARGIN_NAMES) {
    if (margins[name] !== undefined) open = setAttr(open, name, String(margins[name]))
  }
  return { ok: true, xml: `${xml.slice(0, margin.start)}${open}${xml.slice(margin.end)}` }
}

function loadXml(bytes: Uint8Array, loaded: Map<string, string>, name: string): string {
  const cached = loaded.get(name)
  if (cached !== undefined) return cached
  const xml = inflateNamed(bytes, name)
  loaded.set(name, xml)
  return xml
}

function inflateNamed(bytes: Uint8Array, name: string): string {
  const data = entryData(bytes, name)
  if (!data) throw new Error(`${name}이 없습니다`)
  return new TextDecoder().decode(data.method === 0 ? data.bytes : inflateSync(data.bytes))
}

function entryData(bytes: Uint8Array, name: string): { method: number; bytes: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(bytes, view)
  if (eocd < 0) throw new Error('ZIP을 읽을 수 없습니다')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  for (let index = 0; index < count; index += 1) {
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const entryName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    if (entryName === name) {
      const method = view.getUint16(offset + 10, true)
      const compSize = view.getUint32(offset + 20, true)
      const localOffset = view.getUint32(offset + 42, true)
      const localName = view.getUint16(localOffset + 26, true)
      const localExtra = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + localName + localExtra
      // 압축 입력은 복사본이다. inflate가 원본 버퍼에 쓰지 않게 한다.
      return { method, bytes: bytes.slice(start, start + compSize) }
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  return null
}

function readNames(bytes: Uint8Array): Map<string, true> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(bytes, view)
  if (eocd < 0) throw new Error('ZIP을 읽을 수 없습니다')
  const names = new Map<string, true>()
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  for (let index = 0; index < count; index += 1) {
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    names.set(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen)), true)
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}

function findEocd(zip: Uint8Array, view: DataView): number {
  const min = Math.max(0, zip.length - 22 - 65535)
  for (let index = zip.length - 22; index >= min; index -= 1) {
    if (view.getUint32(index, true) !== 0x06054b50) continue
    if (index + 22 + view.getUint16(index + 20, true) === zip.length) return index
  }
  return -1
}

function readFormatFromPackage(doc: HwpxPackage): DocumentFormat {
  const header = new TextDecoder().decode(doc.entries['Contents/header.xml'] ?? new Uint8Array())
  // 머리글은 한 번만 훑는다. 문단 모양마다 다시 스캔하지 않는다.
  const all = tags(header)
  const charPr: DocumentFormat['charPr'] = {}
  const paraPr: DocumentFormat['paraPr'] = {}
  for (let index = 0; index < all.length; index += 1) {
    const tag = all[index]
    if (tag.closing) continue
    if (tag.local === 'charPr') {
      const id = attr(tag.attrs, 'id')
      if (id) charPr[id] = { height: numberAttr(tag.attrs, 'height', 1000), textColor: attr(tag.attrs, 'textColor') || '#000000' }
      continue
    }
    if (tag.local !== 'paraPr') continue
    const id = attr(tag.attrs, 'id')
    const close = tag.selfClosing ? index : matchingClose(all, index)
    const alignTag = directElements(all, index + 1, close).map((item) => all[item.openIndex]).find((item) => item.local === 'align')
    if (id) paraPr[id] = { align: attr(alignTag?.attrs ?? '', 'horizontal') || 'JUSTIFY' }
    index = close
  }
  const sections = sectionNames(doc).map((name) => readSection(new TextDecoder().decode(doc.entries[name])))
  return { charPr, paraPr, sections }
}

function readSection(xml: string): SectionFormat {
  const matched = /<([A-Za-z0-9]+:)?pagePr\b/.exec(xml)
  const window = matched ? xml.slice(matched.index, matched.index + 8000) : ''
  const all = tags(window)
  const pageIndex = all.findIndex((tag) => !tag.closing && tag.local === 'pagePr')
  const page = pageIndex < 0 ? undefined : all[pageIndex]
  const margin = pageIndex < 0 ? undefined : directElements(all, pageIndex + 1, matchingClose(all, pageIndex)).map((item) => all[item.openIndex]).find((tag) => tag.local === 'margin')
  return {
    pageWidth: numberAttr(page?.attrs ?? '', 'width', 59528),
    pageHeight: numberAttr(page?.attrs ?? '', 'height', 84188),
    margins: margin
      ? {
          left: numberAttr(margin.attrs, 'left', 0),
          right: numberAttr(margin.attrs, 'right', 0),
          top: numberAttr(margin.attrs, 'top', 0),
          bottom: numberAttr(margin.attrs, 'bottom', 0),
          header: numberAttr(margin.attrs, 'header', 0),
          footer: numberAttr(margin.attrs, 'footer', 0),
          gutter: numberAttr(margin.attrs, 'gutter', 0),
        }
      : null,
  }
}

function findOpen(xml: string, local: string, id?: string): RawTag | null {
  let index = 0
  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) return null
    index = next.next
    const tag = next.tag
    if (tag.closing || tag.local !== local) continue
    if (id === undefined || attr(tag.attrs, 'id') === id) return tag
  }
  return null
}

function findElement(xml: string, local: string, id: string): { start: number; openEnd: number; end: number } | null {
  const tag = findOpen(xml, local, id)
  if (!tag) return null
  return { start: tag.start, openEnd: tag.end, end: tag.selfClosing ? tag.end : elementEnd(xml, tag.end) }
}

function elementEnd(xml: string, openEnd: number): number {
  let depth = 1
  let index = openEnd
  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) return openEnd
    index = next.next
    if (next.tag.selfClosing) continue
    if (next.tag.closing) {
      depth -= 1
      if (depth === 0) return next.tag.end
    } else depth += 1
  }
  return openEnd
}

function directChild(xml: string, openEnd: number, local: string): RawTag | null {
  let depth = 0
  let index = openEnd
  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) return null
    const tag = next.tag
    if (tag.closing) {
      if (depth === 0) return null
      depth -= 1
      index = next.next
      continue
    }
    if (depth === 0 && tag.local === local) return tag
    if (!tag.selfClosing) depth += 1
    index = next.next
  }
  return null
}

function maxStyleId(xml: string, local: string): number {
  let max = -1
  let index = 0
  while (index < xml.length) {
    const next = nextTag(xml, index)
    if (!next) break
    index = next.next
    if (next.tag.closing || next.tag.local !== local) continue
    const value = attr(next.tag.attrs, 'id')
    const number = Number(value)
    if (value !== '' && Number.isInteger(number) && number > max) max = number
  }
  return max
}

function nextTag(xml: string, index: number): { tag: RawTag; next: number } | null {
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
    const closing = raw.startsWith('/')
    const body = closing ? raw.slice(1) : raw
    const selfClosing = !closing && /\/\s*$/.test(body)
    const content = selfClosing ? body.replace(/\/\s*$/, '') : body
    const name = content.trim().split(/\s+/)[0] ?? ''
    const local = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name
    return {
      tag: {
        start,
        end: end + 1,
        local,
        closing,
        selfClosing,
        attrs: content.slice(Math.max(content.indexOf(name), 0) + name.length),
      },
      next: end + 1,
    }
  }
  return null
}

function valueSpan(openTag: string, openStart: number, name: string): { start: number; end: number; value: string } | null {
  const matched = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(openTag)
  if (!matched) return null
  const close = openStart + matched.index + matched[0].length - 1
  return { start: close - matched[2].length, end: close, value: matched[2] }
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

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function sectionNames(doc: HwpxPackage): string[] {
  return Object.keys(doc.entries)
    .filter((name) => SECTION_ENTRY.test(name))
    .sort((left, right) => sectionNumber(left) - sectionNumber(right))
}

function sectionNumber(name: string): number {
  return Number(/^Contents\/section(\d+)\.xml$/.exec(name)?.[1] ?? -1)
}

function sectionIndex(nodeId: string): number {
  return paragraphRef(nodeId)?.section ?? -1
}

function sectionNameOf(nodeId: string): string | null {
  const section = paragraphRef(nodeId)?.section
  return section === undefined ? null : `Contents/section${section}.xml`
}

function paragraphRef(nodeId: string): { section: number; paragraph: number } | null {
  const matched = /^section(\d+)_p(\d+)$/.exec(nodeId)
  if (!matched) return null
  return { section: Number(matched[1]), paragraph: Number(matched[2]) }
}

function numberAttr(attrs: string, name: string, fallback: number): number {
  const value = Number(attr(attrs, name))
  return Number.isFinite(value) && attr(attrs, name) !== '' ? value : fallback
}
