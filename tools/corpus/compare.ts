import { readFileSync } from 'node:fs'
import { inventoryZip, type ZipEntryInfo } from './inventory.ts'

export function unexpectedChanges(before: ZipEntryInfo[], after: ZipEntryInfo[], allowed: readonly string[]): string[] {
  const beforeHash = new Map(before.map((row) => [row.path, row.sha256]))
  const afterHash = new Map(after.map((row) => [row.path, row.sha256]))
  const paths = [...new Set([...beforeHash.keys(), ...afterHash.keys()])].sort()
  return paths.filter((path) => !allowed.includes(path) && beforeHash.get(path) !== afterHash.get(path))
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('tools/corpus/compare.ts')) {
  const [beforePath, afterPath, ...allowed] = process.argv.slice(2)
  if (!beforePath || !afterPath) {
    console.error('사용법: tsx tools/corpus/compare.ts <before.hwpx> <after.hwpx> [허용 변경 경로...]')
    process.exit(1)
  }
  const unexpected = unexpectedChanges(
    inventoryZip(new Uint8Array(readFileSync(beforePath))),
    inventoryZip(new Uint8Array(readFileSync(afterPath))),
    allowed,
  )
  if (unexpected.length > 0) {
    console.error(unexpected.join('\n'))
    process.exit(1)
  }
}
