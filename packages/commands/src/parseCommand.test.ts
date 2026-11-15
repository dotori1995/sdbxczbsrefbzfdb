import { describe, expect, it } from 'vitest'
import { draftReplaceText, exampleReplaceText, parseCommand, previewDecision, textCommandNames, validateCommand, type TextNode } from './index.ts'

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

  it('허용 명령은 replace_text와 rewrite_paragraph이고 혼합 런 재작성은 거절한다', () => {
    expect([...textCommandNames]).toEqual(['replace_text', 'rewrite_paragraph'])
    const rewrite = { ...exampleReplaceText, command: 'rewrite_paragraph' as const }
    const single: TextNode[] = [{ nodeId: 'section0_p1', text: '두번째 문단이다.', runCount: 1 }]
    const mixed: TextNode[] = [{ nodeId: 'section0_p1', text: '두번째 문단이다.', runCount: 2 }]
    expect(validateCommand(rewrite, single)).toEqual({ ok: true, command: rewrite })
    expect(codeOf(validateCommand(rewrite, mixed))).toBe('MIXED_RUNS')
  })
})

function codeOf(result: ReturnType<typeof validateCommand>): string {
  return result.ok ? '' : result.code
}

describe('previewDecision', () => {
  const nodes: TextNode[] = [{ nodeId: 'section0_p1', text: '두번째 문단이다.' }]
  const bytes = new Uint8Array([4, 5, 6])

  it('invalid에서 approve는 상태가 바뀌지 않는다', () => {
    const state = { status: 'invalid' as const, command: null }
    expect(previewDecision(state, { type: 'approve' }, nodes, bytes)).toBe(state)
  })

  it('approve 호출 전후 문단 문자열과 ZIP 바이트가 같다', () => {
    const frozen = nodes.map((node) => Object.freeze({ ...node }))
    Object.freeze(frozen)
    const before = frozen.map((node) => node.text).join('\n')
    const beforeBytes = Array.from(bytes)
    const next = previewDecision({ status: 'valid', command: exampleReplaceText }, { type: 'approve' }, frozen, bytes)
    expect(next).toEqual({ status: 'approved', command: exampleReplaceText })
    expect(frozen.map((node) => node.text).join('\n')).toBe(before)
    expect(Array.from(bytes)).toEqual(beforeBytes)
  })

  it('reject는 비교용 명령을 비운다', () => {
    const next = previewDecision({ status: 'valid', command: exampleReplaceText }, { type: 'reject' }, nodes, bytes)
    expect(next).toEqual({ status: 'rejected', command: null })
  })
})
