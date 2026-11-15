export type Tag = {
  start: number
  end: number
  local: string
  closing: boolean
  selfClosing: boolean
  attrs: string
}

export function tags(xml: string): Tag[] {
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
    const content = selfClosing ? body.replace(/\/\s*$/, '') : body
    const name = content.trim().split(/\s+/)[0] ?? ''
    const local = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name
    found.push({ start, end: end + 1, local, closing, selfClosing, attrs: content.slice(name.length) })
    index = end + 1
  }
  return found
}

export function matchingClose(all: Tag[], openIndex: number): number {
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

export function directElements(all: Tag[], start: number, end: number): { openIndex: number; closeIndex: number }[] {
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

export function attr(attrs: string, name: string): string {
  const matched = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(attrs)
  return matched?.[2] ?? ''
}

export function setAttr(openTag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[\\s\\S]*?\\2`)
  if (pattern.test(openTag)) {
    return openTag.replace(pattern, (_full, prefix: string, quote: string) => `${prefix}${quote}${value}${quote}`)
  }
  const close = /\/?\s*>$/.exec(openTag)
  if (!close) return openTag
  return `${openTag.slice(0, close.index)} ${name}="${value}"${openTag.slice(close.index)}`
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
