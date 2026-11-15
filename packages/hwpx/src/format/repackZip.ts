import { deflateSync } from 'fflate'

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1
  CRC_TABLE[index] = crc >>> 0
}

type ZipEntry = {
  name: string
  nameBytes: Uint8Array
  method: number
  flag: number
  time: number
  date: number
  crc: number
  compSize: number
  uncompSize: number
  localOffset: number
  versionMade: number
  versionNeeded: number
  internalAttr: number
  externalAttr: number
  extra: Uint8Array
  comment: Uint8Array
}

// 유지 엔트리는 원본 압축 바이트를 그대로 옮긴다. 원본 배열에는 쓰지 않는다.
export function repackZip(original: Uint8Array, changed: Record<string, Uint8Array>): Uint8Array {
  const entries = readCatalog(original)
  const chunks: Uint8Array[] = []
  const items: ZipEntry[] = []
  let localOffset = 0

  for (const entry of entries) {
    const next = changed[entry.name]
    if (!next) {
      const end = localRecordEnd(original, entry)
      const chunk = original.subarray(entry.localOffset, end)
      chunks.push(chunk)
      items.push({ ...entry, localOffset })
      localOffset += chunk.length
      continue
    }
    const built = writeStored(entry, next)
    chunks.push(built.local)
    items.push({
      ...entry,
      localOffset,
      method: 8,
      flag: entry.flag & 0x800,
      crc: built.crc,
      compSize: built.compSize,
      uncompSize: next.length,
      extra: new Uint8Array(),
    })
    localOffset += built.local.length
  }

  const central = writeCentral(items, localOffset)
  const out = new Uint8Array(localOffset + central.length)
  let cursor = 0
  for (const chunk of chunks) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  out.set(central, cursor)
  return out
}

function writeStored(entry: ZipEntry, data: Uint8Array): { local: Uint8Array; crc: number; compSize: number } {
  const compressed = deflateSync(data, { level: 1 })
  const crc = crc32(data)
  const name = entry.nameBytes
  const local = new Uint8Array(30 + name.length + compressed.length)
  const view = new DataView(local.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, entry.flag & 0x800, true)
  view.setUint16(8, 8, true)
  view.setUint16(10, entry.time, true)
  view.setUint16(12, entry.date, true)
  view.setUint32(14, crc, true)
  view.setUint32(18, compressed.length, true)
  view.setUint32(22, data.length, true)
  view.setUint16(26, name.length, true)
  view.setUint16(28, 0, true)
  local.set(name, 30)
  local.set(compressed, 30 + name.length)
  return { local, crc, compSize: compressed.length }
}

function writeCentral(items: ZipEntry[], centralOffset: number): Uint8Array {
  let size = 22
  for (const item of items) size += 46 + item.nameBytes.length + item.extra.length + item.comment.length
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let offset = 0
  for (const item of items) {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, item.versionMade, true)
    view.setUint16(offset + 6, item.versionNeeded, true)
    view.setUint16(offset + 8, item.flag, true)
    view.setUint16(offset + 10, item.method, true)
    view.setUint16(offset + 12, item.time, true)
    view.setUint16(offset + 14, item.date, true)
    view.setUint32(offset + 16, item.crc, true)
    view.setUint32(offset + 20, item.compSize, true)
    view.setUint32(offset + 24, item.uncompSize, true)
    view.setUint16(offset + 28, item.nameBytes.length, true)
    view.setUint16(offset + 30, item.extra.length, true)
    view.setUint16(offset + 32, item.comment.length, true)
    view.setUint16(offset + 34, 0, true)
    view.setUint16(offset + 36, item.internalAttr, true)
    view.setUint32(offset + 38, item.externalAttr, true)
    view.setUint32(offset + 42, item.localOffset, true)
    let cursor = offset + 46
    out.set(item.nameBytes, cursor)
    cursor += item.nameBytes.length
    out.set(item.extra, cursor)
    cursor += item.extra.length
    out.set(item.comment, cursor)
    offset = cursor + item.comment.length
  }
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, items.length, true)
  view.setUint16(offset + 10, items.length, true)
  view.setUint32(offset + 12, offset, true)
  view.setUint32(offset + 16, centralOffset, true)
  return out
}

function readCatalog(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = findEocd(zip, view)
  if (eocd < 0) throw new Error('ZIP을 읽을 수 없습니다')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  if (offset === 0xffffffff) throw new Error('ZIP을 읽을 수 없습니다')
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP을 읽을 수 없습니다')
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const nameStart = offset + 46
    const nameBytes = zip.subarray(nameStart, nameStart + nameLen)
    const compSize = view.getUint32(offset + 20, true)
    const uncompSize = view.getUint32(offset + 24, true)
    if (compSize === 0xffffffff || uncompSize === 0xffffffff) throw new Error('ZIP을 읽을 수 없습니다')
    entries.push({
      name: new TextDecoder().decode(nameBytes),
      nameBytes,
      method: view.getUint16(offset + 10, true),
      flag: view.getUint16(offset + 8, true),
      time: view.getUint16(offset + 12, true),
      date: view.getUint16(offset + 14, true),
      crc: view.getUint32(offset + 16, true),
      compSize,
      uncompSize,
      localOffset: view.getUint32(offset + 42, true),
      versionMade: view.getUint16(offset + 4, true),
      versionNeeded: view.getUint16(offset + 6, true),
      internalAttr: view.getUint16(offset + 34, true),
      externalAttr: view.getUint32(offset + 36, true),
      extra: zip.subarray(nameStart + nameLen, nameStart + nameLen + extraLen),
      comment: zip.subarray(nameStart + nameLen + extraLen, nameStart + nameLen + extraLen + commentLen),
    })
    offset = nameStart + nameLen + extraLen + commentLen
  }
  return entries
}

function localRecordEnd(zip: Uint8Array, entry: ZipEntry): number {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const flag = view.getUint16(entry.localOffset + 6, true)
  const nameLen = view.getUint16(entry.localOffset + 26, true)
  const extraLen = view.getUint16(entry.localOffset + 28, true)
  let end = entry.localOffset + 30 + nameLen + extraLen + entry.compSize
  if ((flag & 8) !== 0) {
    const signature = end + 4 <= zip.length ? view.getUint32(end, true) : 0
    end += signature === 0x08074b50 ? 16 : 12
  }
  if (end > zip.length) throw new Error('ZIP을 읽을 수 없습니다')
  return end
}

function findEocd(zip: Uint8Array, view: DataView): number {
  const min = Math.max(0, zip.length - 22 - 65535)
  for (let index = zip.length - 22; index >= min; index -= 1) {
    if (view.getUint32(index, true) !== 0x06054b50) continue
    const commentLen = view.getUint16(index + 20, true)
    if (index + 22 + commentLen === zip.length) return index
  }
  return -1
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
