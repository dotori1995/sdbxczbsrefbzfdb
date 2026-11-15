import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'

export type ZipEntryInfo = {
  path: string
  method: string
  compressedSize: number
  uncompressedSize: number
  sha256: string
}

const METHOD_NAME: Record<number, string> = {
  0: 'stored',
  8: 'deflate',
}

export function inventoryZip(bytes: Uint8Array): ZipEntryInfo[] {
  const entries = unzipSync(bytes)
  return centralDirectory(bytes).map((entry) => {
    const content = entries[entry.path]
    if (!content) throw new Error(`${entry.path} 내용을 풀 수 없습니다`)
    return {
      path: entry.path,
      method: METHOD_NAME[entry.method] ?? `method ${entry.method}`,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      sha256: createHash('sha256').update(content).digest('hex'),
    }
  })
}

export function formatInventory(rows: ZipEntryInfo[]): string {
  const header = 'path\tmethod\tcompressed\tuncompressed\tsha256'
  const body = rows.map((row) =>
    [row.path, row.method, String(row.compressedSize), String(row.uncompressedSize), row.sha256].join('\t'),
  )
  return [header, ...body].join('\n')
}

type CentralEntry = {
  path: string
  method: number
  compressedSize: number
  uncompressedSize: number
}

function centralDirectory(bytes: Uint8Array): CentralEntry[] {
  const eocd = findEocd(bytes)
  const count = u16(bytes, eocd + 10)
  const offset = u32(bytes, eocd + 16)
  if (offset === 0xffffffff) throw new Error('ZIP64는 아직 읽지 않습니다')

  const entries: CentralEntry[] = []
  let cursor = offset
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리 항목이 올바르지 않습니다')
    const method = u16(bytes, cursor + 10)
    const compressedSize = u32(bytes, cursor + 20)
    const uncompressedSize = u32(bytes, cursor + 24)
    const nameLength = u16(bytes, cursor + 28)
    const extraLength = u16(bytes, cursor + 30)
    const commentLength = u16(bytes, cursor + 32)
    const path = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    entries.push({ path, method, compressedSize, uncompressedSize })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 22 - 0xffff)
  for (let index = bytes.length - 22; index >= start; index -= 1) {
    if (u32(bytes, index) !== 0x06054b50) continue
    const commentLength = u16(bytes, index + 20)
    if (index + 22 + commentLength === bytes.length) return index
  }
  throw new Error('ZIP 중앙 디렉터리가 없습니다')
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('tools/corpus/inventory.ts')) {
  const { readFileSync } = await import('node:fs')
  const file = process.argv[2]
  if (!file) {
    console.error('사용법: tsx tools/corpus/inventory.ts <file.hwpx>')
    process.exit(1)
  }
  process.stdout.write(`${formatInventory(inventoryZip(new Uint8Array(readFileSync(file))))}\n`)
}
