import { describe, expect, it } from 'vitest'
import { draftReplaceText, exampleReplaceText, parseCommand, validateCommand, type TextNode } from './index.ts'

describe('parseCommand', () => {
  it('예시 replace_text는 통과한다', () => {
    expect(parseCommand(exampleReplaceText)).toEqual({ ok: true, command: exampleReplaceText })
  })

  it('delete_document는 거절한다', () => {
    const result = parseCommand({ ...exampleReplaceText, command: 'delete_document' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('UNKNOWN_COMMAND')
  })

  it('허용 필드 밖은 거절한다', () => {
    const result = parseCommand({ ...exampleReplaceText, extra: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_COMMAND')
  })
})

const nodes: readonly TextNode[] = [
  { nodeId: 'section0_p0', text: '첫번째 문단이다.' },
  { nodeId: 'section0_p1', text: '두번째 문단이다.' },
]

describe('draftReplaceText', () => {
  it('선택과 바꿀 문장으로 확인이 필요한 replace_text를 만든다', () => {
    const draft = draftReplaceText({ node_id: 'section0_p1', text: '두번째 문단이다.' }, '수정한 문단이다')
    expect(draft).toEqual(exampleReplaceText)
    expect(validateCommand(draft, nodes)).toEqual({ ok: true, command: draft })
  })
})

describe('validateCommand', () => {
  it('빈 대상, 다른 원문, 알 수 없는 명령, 확인 누락은 서로 다른 코드다', () => {
    const draft = draftReplaceText({ node_id: 'section0_p1', text: '두번째 문단이다.' }, '수정한 문단이다')
    expect(codeOf(validateCommand({ ...draft, target_node_id: '' }, nodes))).toBe('MISSING_TARGET')
    expect(codeOf(validateCommand({ ...draft, target_node_id: 'section0_p9' }, nodes))).toBe('MISSING_TARGET')
    expect(codeOf(validateCommand({ ...draft, expected_original_text: '다른 문장' }, nodes))).toBe('STALE_TEXT')
    expect(codeOf(validateCommand({ ...draft, command: 'delete_document' }, nodes))).toBe('UNKNOWN_COMMAND')
    expect(codeOf(validateCommand({ ...draft, requires_confirmation: false }, nodes))).toBe('CONFIRMATION_REQUIRED')
  })

  it('문서 배열을 수정하지 않는다', () => {
    const live = nodes.map((node) => ({ ...node }))
    const frozen = live.map((node) => Object.freeze(node))
    Object.freeze(frozen)
    const before = JSON.stringify(frozen)
    validateCommand(draftReplaceText({ node_id: 'section0_p1', text: '두번째 문단이다.' }, '수정한 문단이다'), frozen)
    validateCommand({ command: 'delete_document' }, frozen)
    expect(JSON.stringify(frozen)).toBe(before)
    expect(frozen[0]).toBe(live[0])
    expect(frozen[1].text).toBe('두번째 문단이다.')
  })
})

function codeOf(result: ReturnType<typeof validateCommand>): string {
  return result.ok ? '' : result.code
}
