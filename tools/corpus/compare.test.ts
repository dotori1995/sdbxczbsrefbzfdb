import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildT01Fixture } from '../../packages/hwpx/src/fixture.ts'
import { planPatch, readPackage } from '../../packages/hwpx/src/patch/planPatch.ts'
import { inventoryZip } from './inventory.ts'
import { unexpectedChanges } from './compare.ts'

describe('unexpectedChanges', () => {
  it('허용한 섹션 외의 해시가 같으면 빈 목록이고 아니면 그 경로를 반환한다', () => {
    const before = buildT01Fixture()
    const patched = planPatch(readPackage(before), { targetNodeId: 'section0_p1', replacementText: '수정한 문단이다' })
    expect(patched.ok).toBe(true)
    if (!patched.ok) return
    const beforeRows = inventoryZip(before)
    const afterRows = inventoryZip(patched.zip)
    expect(unexpectedChanges(beforeRows, afterRows, ['Contents/section0.xml'])).toEqual([])
    expect(unexpectedChanges(beforeRows, afterRows, [])).toEqual(['Contents/section0.xml'])
    expect(unzipSync(patched.zip).mimetype).toEqual(unzipSync(before).mimetype)
  })
})
