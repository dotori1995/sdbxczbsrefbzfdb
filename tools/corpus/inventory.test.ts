import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildT01Fixture } from '../../packages/hwpx/src/fixture.ts'
import { formatInventory, inventoryZip } from './inventory.ts'

describe('inventoryZip', () => {
  it('fixture의 엔트리 수와 mimetype 행을 반환하고 본문은 출력하지 않는다', () => {
    const rows = inventoryZip(buildT01Fixture())
    expect(rows.map((row) => row.path)).toEqual(['mimetype', 'Contents/header.xml', 'Contents/section0.xml'])
    expect(rows[0]).toMatchObject({
      path: 'mimetype',
      method: 'stored',
      compressedSize: 'application/hwp+zip'.length,
      uncompressedSize: 'application/hwp+zip'.length,
      sha256: createHash('sha256').update('application/hwp+zip').digest('hex'),
    })
    expect(formatInventory(rows)).not.toContain('첫번째')
    expect(formatInventory(rows)).not.toContain('두번째')
  })
})
