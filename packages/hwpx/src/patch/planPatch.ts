import { strToU8, unzipSync, zipSync } from 'fflate'

export type HwpxPackage = {
  entries: Record<string, Uint8Array>
}

export type PatchEntry = {
  path: string
  bytes: Uint8Array
}

export type PatchPlan = {
  changed: PatchEntry[]
  kept: PatchEntry[]
}

export type PatchCommand = {
  targetNodeId: string
  replacementText: string
}

export type PlanPatchResult =
  | { ok: true; plan: PatchPlan; zip: Uint8Array }
  | { ok: false; code: 'MIXED_RUNS'; message: string }

type Tag = {
  start: number
  end: number
  local: string
  closing: boolean
  selfClosing: boolean
}

export function readPackage(bytes: Uint8Array): HwpxPackage {
  return { entries: unzipSync(bytes) }
}

export function planPatch(doc: HwpxPackage, command: PatchCommand): PlanPatchResult {
  const target = /^section(\d+)_p(\d+)$/.exec(command.targetNodeId)
  if (!target) return mixed('대상 문단이 없습니다')
  const path = `Contents/section${target[1]}.xml`
  const source = doc.entries[path]
  if (!source) return mixed('대상 문단이 없습니다')

  const xml = new TextDecoder().decode(source)
  const replaced = replaceSingleText(xml, Number(target[2]), command.replacementText)
  if (!replaced.ok) return replaced

  const changedBytes = strToU8(replaced.xml)
  const changed: PatchEntry[] = [{ path, bytes: changedBytes }]
  const kept: PatchEntry[] = Object.keys(doc.entries)
    .filter((entry) => entry !== path)
    .map((entry) => ({ path: entry, bytes: doc.entries[entry] }))
  const entries: Record<string, Uint8Array> = {}
  for (const entry of kept) entries[entry.path] = entry.bytes
  entries[path] = changedBytes
  return { ok: true, plan: { changed, kept }, zip: zipPackage(entries) }
}

function replaceSingleText(
  xml: string,
  paragraphIndex: number,
  replacementText: string,
): { ok: true; xml: string } | { ok: false; code: 'MIXED_RUNS'; message: string } {
  const all = tags(xml)
  const secIndex = all.findIndex((tag) => !tag.closing && tag.local === 'sec')
  if (secIndex < 0) return mixed('대상 문단이 없습니다')
  const secClose = matchingClose(all, secIndex)
  const paragraphs = directElements(all, secIndex + 1, secClose).filter((item) => all[item.openIndex].local === 'p')
  const paragraph = paragraphs[paragraphIndex]
  if (!paragraph) return mixed('대상 문단이 없습니다')

  const runs = directElements(all, paragraph.openIndex + 1, paragraph.closeIndex).filter((item) => all[item.openIndex].local === 'run')
  const textRuns = runs.filter((run) =>
    directElements(all, run.openIndex + 1, run.closeIndex).some((item) => all[item.openIndex].local === 't'),
  )
  if (textRuns.length !== 1) return mixed('글자 런이 하나가 아니라 적용하지 않습니다')

  const texts = directElements(all, textRuns[0].openIndex + 1, textRuns[0].closeIndex).filter(
    (item) => all[item.openIndex].local === 't',
  )
  if (texts.length !== 1 || texts[0].openIndex === texts[0].closeIndex) return mixed('글자 런 안에 다른 요소가 있어 적용하지 않습니다')
  const open = all[texts[0].openIndex]
  const close = all[texts[0].closeIndex]
  const inner = xml.slice(open.end, close.start)
  if (inner.includes('<')) return mixed('글자 런 안에 다른 요소가 있어 적용하지 않습니다')

  return { ok: true, xml: `${xml.slice(0, open.end)}${escapeXmlText(replacementText)}${xml.slice(close.start)}` }
}

function zipPackage(entries: Record<string, Uint8Array>): Uint8Array {
  const paths = Object.keys(entries)
  const ordered = paths.includes('mimetype') ? ['mimetype', ...paths.filter((path) => path !== 'mimetype')] : paths
  const input: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}
  for (const path of ordered) {
    input[path] = path === 'mimetype' ? [entries[path], { level: 0 }] : entries[path]
  }
  return zipSync(input)
}

function mixed(message: string): { ok: false; code: 'MIXED_RUNS'; message: string } {
  return { ok: false, code: 'MIXED_RUNS', message }
}

function directElements(all: Tag[], start: number, end: number): { openIndex: number; closeIndex: number }[] {
  const found: { openIndex: number; closeIndex: number }[] = []
  let index = start
  while (index < end) {
    const tag = all[index]
    if (tag.closing) {
      index += 1
      continue
    }
    if (tag.selfClosing) {
      found.push({ openIndex: index, closeIndex: index })
      index += 1
      continue
    }
    const closeIndex = matchingClose(all, index)
    found.push({ openIndex: index, closeIndex })
    index = closeIndex + 1
  }
  return found
}

function matchingClose(all: Tag[], openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < all.length; index += 1) {
    const tag = all[index]
    if (!tag.closing && !tag.selfClosing) depth += 1
    else if (tag.closing) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return openIndex
}

function tags(xml: string): Tag[] {
  const found: Tag[] = []
  let index = 0
  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start < 0) break
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
    const end = tagEnd(xml, start + 1)
    if (end < 0) break
    const raw = xml.slice(start + 1, end)
    const closing = raw.startsWith('/')
    const body = closing ? raw.slice(1) : raw
    const selfClosing = !closing && /\/\s*$/.test(body)
    const name = (selfClosing ? body.replace(/\/\s*$/, '') : body).trim().split(/\s+/)[0] ?? ''
    const local = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name
    found.push({ start, end: end + 1, local, closing, selfClosing })
    index = end + 1
  }
  return found
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

function escapeXmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
