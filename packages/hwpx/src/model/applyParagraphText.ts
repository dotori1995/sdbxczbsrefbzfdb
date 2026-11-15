import type { Paragraph } from '../index.ts'

export type ApplyParagraphResult =
  | { ok: true; paragraphs: Paragraph[] }
  | { ok: false; code: 'MIXED_RUNS'; message: string; paragraphs: Paragraph[] }

export function applyParagraphText(
  paragraphs: readonly Paragraph[],
  nodeId: string,
  replacementText: string,
): ApplyParagraphResult {
  const index = paragraphs.findIndex((paragraph) => paragraph.nodeId === nodeId)
  const target = index < 0 ? undefined : paragraphs[index]
  if (!target || target.runs.length !== 1) {
    return {
      ok: false,
      code: 'MIXED_RUNS',
      message: '글자 런이 하나가 아니라 적용하지 않습니다',
      paragraphs: paragraphs as Paragraph[],
    }
  }

  const run = target.runs[0]
  const next = paragraphs.map((paragraph, paragraphIndex) => {
    if (paragraphIndex !== index) return paragraph
    return {
      nodeId: paragraph.nodeId,
      text: replacementText,
      paraPrIDRef: paragraph.paraPrIDRef,
      runs: [{ charPrIDRef: run.charPrIDRef, text: replacementText }],
    }
  })
  return { ok: true, paragraphs: next }
}
