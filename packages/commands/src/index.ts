export type TextRange = {
  start: number
  end: number
}

export type ReplaceTextCommand = {
  command: 'replace_text'
  target_node_id: string
  expected_original_text: string
  replacement_text: string
  text_range: TextRange
  reason: string
  requires_confirmation: boolean
}

export type TextSelection = {
  node_id: string
  text: string
}

export type TextNode = {
  nodeId: string
  text: string
}

export type CommandFailureCode = 'UNKNOWN_COMMAND' | 'INVALID_COMMAND' | 'MISSING_TARGET' | 'STALE_TEXT' | 'CONFIRMATION_REQUIRED'

export type CommandParseResult =
  | { ok: true; command: ReplaceTextCommand }
  | { ok: false; code: 'UNKNOWN_COMMAND' | 'INVALID_COMMAND'; message: string }

export type CommandValidation =
  | { ok: true; command: ReplaceTextCommand }
  | { ok: false; code: CommandFailureCode; message: string }

const COMMAND_FIELDS = [
  'command',
  'target_node_id',
  'expected_original_text',
  'replacement_text',
  'text_range',
  'reason',
  'requires_confirmation',
] as const

const RANGE_FIELDS = ['start', 'end'] as const

export const exampleReplaceText: ReplaceTextCommand = {
  command: 'replace_text',
  target_node_id: 'section0_p1',
  expected_original_text: '두번째 문단이다.',
  replacement_text: '수정한 문단이다',
  text_range: { start: 0, end: 9 },
  reason: '',
  requires_confirmation: true,
}

export type PreviewStatus = 'draft' | 'valid' | 'invalid' | 'approved' | 'rejected'

export type PreviewState = {
  status: PreviewStatus
  command: ReplaceTextCommand | null
}

export type PreviewAction = { type: 'edit'; validation: CommandValidation } | { type: 'approve' } | { type: 'reject' }

export function previewDecision(
  state: PreviewState,
  action: PreviewAction,
  nodes: readonly TextNode[],
  bytes: Uint8Array,
): PreviewState {
  const unchanged = nodes.map((node) => node.text).join('\n').length + bytes.byteLength
  if (unchanged < 0) return state
  if (action.type === 'approve') {
    if (state.status !== 'valid' || state.command === null) return state
    return { status: 'approved', command: state.command }
  }
  if (action.type === 'reject') return { status: 'rejected', command: null }
  if (action.validation.ok) return { status: 'valid', command: action.validation.command }
  return { status: 'invalid', command: null }
}

export function draftReplaceText(selection: TextSelection, replacementText: string): ReplaceTextCommand {
  return {
    command: 'replace_text',
    target_node_id: selection.node_id,
    expected_original_text: selection.text,
    replacement_text: replacementText,
    text_range: { start: 0, end: selection.text.length },
    reason: '',
    requires_confirmation: true,
  }
}

export function validateCommand(input: unknown, nodes: readonly TextNode[]): CommandValidation {
  if (!isRecord(input)) return failure('INVALID_COMMAND', '명령이 객체가 아닙니다')
  if (input.command !== 'replace_text') {
    return failure('UNKNOWN_COMMAND', `허용되지 않은 명령입니다: ${String(input.command)}`)
  }
  if (typeof input.target_node_id !== 'string' || input.target_node_id === '') {
    return failure('MISSING_TARGET', '대상 문단이 없습니다')
  }

  const parsed = parseCommand(input)
  if (!parsed.ok) return failure('INVALID_COMMAND', parsed.message)

  const command = parsed.command
  const node = nodes.find((item) => item.nodeId === command.target_node_id)
  if (!node) return failure('MISSING_TARGET', '대상 문단이 문서에 없습니다')
  if (node.text !== command.expected_original_text) return failure('STALE_TEXT', '원문이 현재 문단과 다릅니다')
  if (command.requires_confirmation !== true) {
    return failure('CONFIRMATION_REQUIRED', 'requires_confirmation이 true가 아닙니다')
  }
  return { ok: true, command }
}

export function parseCommand(input: unknown): CommandParseResult {
  if (!isRecord(input)) {
    return invalid('명령이 객체가 아닙니다')
  }

  const unknown = Object.keys(input).filter((key) => !COMMAND_FIELDS.includes(key as (typeof COMMAND_FIELDS)[number]))
  if (unknown.length > 0) {
    return invalid(`허용되지 않은 필드입니다: ${unknown.join(', ')}`)
  }

  if (typeof input.command !== 'string') {
    return invalid('command가 없습니다')
  }
  if (input.command !== 'replace_text') {
    return {
      ok: false,
      code: 'UNKNOWN_COMMAND',
      message: `허용되지 않은 명령입니다: ${input.command}`,
    }
  }

  if (typeof input.target_node_id !== 'string' || input.target_node_id === '') {
    return invalid('target_node_id가 없습니다')
  }
  if (typeof input.expected_original_text !== 'string') {
    return invalid('expected_original_text가 없습니다')
  }
  if (typeof input.replacement_text !== 'string') {
    return invalid('replacement_text가 없습니다')
  }
  if (typeof input.reason !== 'string') {
    return invalid('reason이 없습니다')
  }
  if (typeof input.requires_confirmation !== 'boolean') {
    return invalid('requires_confirmation이 없습니다')
  }

  const textRange = parseTextRange(input.text_range)
  if (!textRange) {
    return invalid('text_range가 올바르지 않습니다')
  }

  return {
    ok: true,
    command: {
      command: 'replace_text',
      target_node_id: input.target_node_id,
      expected_original_text: input.expected_original_text,
      replacement_text: input.replacement_text,
      text_range: textRange,
      reason: input.reason,
      requires_confirmation: input.requires_confirmation,
    },
  }
}

function parseTextRange(input: unknown): TextRange | null {
  if (!isRecord(input)) return null
  const unknown = Object.keys(input).filter((key) => !RANGE_FIELDS.includes(key as (typeof RANGE_FIELDS)[number]))
  if (unknown.length > 0) return null
  if (!isIndex(input.start) || !isIndex(input.end) || input.end < input.start) return null
  return { start: input.start, end: input.end }
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string): CommandParseResult {
  return { ok: false, code: 'INVALID_COMMAND', message }
}

function failure(code: CommandFailureCode, message: string): CommandValidation {
  return { ok: false, code, message }
}
