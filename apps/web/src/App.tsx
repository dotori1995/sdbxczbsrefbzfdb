import { useLayoutEffect, useRef, useState } from 'react'
import { draftReplaceText, previewDecision, validateCommand, type CommandValidation, type PreviewState, type TextNode } from '@hwpx/commands'
import { applyParagraphText, readParagraphs, type Paragraph } from '@hwpx/hwpx'
import { layoutPages, PAGE_HEIGHT, PAGE_WIDTH, paragraphSelection } from './svg/layoutParagraphs.ts'

type Highlight = {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export function App() {
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null)
  const [cause, setCause] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replacement, setReplacement] = useState('')
  const [commandDirty, setCommandDirty] = useState(false)
  const [commandText, setCommandText] = useState('')
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [preview, setPreview] = useState<PreviewState>({ status: 'draft', command: null })
  const [applyNote, setApplyNote] = useState<string | null>(null)
  const stageRef = useRef<HTMLElement>(null)
  const originalBytes = useRef<Uint8Array>(new Uint8Array())
  const pages = paragraphs ? layoutPages(paragraphs) : null

  const selected = paragraphs?.find((paragraph) => paragraph.nodeId === selectedId) ?? null
  const selection = selected ? paragraphSelection({ nodeId: selected.nodeId, text: selected.text }) : null
  const draft = selection ? draftReplaceText({ node_id: selection.node_id, text: selection.text }, replacement) : null
  const shownCommand = commandDirty ? commandText : draft ? JSON.stringify(draft, null, 2) : ''
  const validation = selection ? validateShown(shownCommand, paragraphs ?? []) : null

  useLayoutEffect(() => {
    if (!selectedId) {
      setHighlights([])
      return
    }
    const next: Highlight[] = []
    for (const svg of stageRef.current?.querySelectorAll('svg') ?? []) {
      const elements = [...svg.querySelectorAll<SVGTextElement>(`text[data-node-id="${selectedId}"]`)]
      if (elements.length === 0) continue
      const boxes = elements.map((element) => element.getBBox())
      const x = Math.min(...boxes.map((box) => box.x)) - 6
      const y = Math.min(...boxes.map((box) => box.y)) - 3
      const right = Math.max(...boxes.map((box) => box.x + box.width)) + 6
      const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 3
      next.push({ page: Number(svg.getAttribute('data-page')), x, y, width: right - x, height: bottom - y })
    }
    setHighlights(next)
  }, [selectedId, paragraphs])

  async function openFile(file: File) {
    setFileName(file.name)
    setParagraphs(null)
    setCause(null)
    setSelectedId(null)
    setReplacement('')
    setCommandDirty(false)
    setCommandText('')
    setPreview({ status: 'draft', command: null })
    setApplyNote(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      originalBytes.current = bytes
      setParagraphs(readParagraphs(bytes))
    } catch (error) {
      setParagraphs(null)
      setCause(error instanceof Error ? error.message : '알 수 없는 오류')
    }
  }

  function choose(nodeId: string) {
    setSelectedId(nodeId)
    setReplacement('')
    setCommandDirty(false)
    setPreview({ status: 'draft', command: null })
    setApplyNote(null)
  }

  function approve() {
    if (!paragraphs || preview.status !== 'valid' || preview.command === null) return
    const applied = applyParagraphText(paragraphs, preview.command.target_node_id, preview.command.replacement_text)
    if (!applied.ok) {
      setApplyNote(`${applied.code} ${applied.message}`)
      return
    }
    const approved = previewDecision(preview, { type: 'approve' }, textNodes(paragraphs), originalBytes.current)
    setParagraphs(applied.paragraphs)
    setPreview(approved)
    setApplyNote('화면만 바뀌었습니다. 받은 파일은 그대로입니다')
  }

  function applyEdit(validation: CommandValidation, nextParagraphs: Paragraph[]) {
    setPreview((state) => previewDecision(state, { type: 'edit', validation }, textNodes(nextParagraphs), originalBytes.current))
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="mark">HWPX</p>
          <h1>올린 글</h1>
        </div>
        <label className="picker">
          <span>HWPX 올리기</span>
          <input
            type="file"
            accept=".hwpx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void openFile(file)
            }}
          />
        </label>
      </header>
      <div className="workspace">
        <section className="stage" aria-label="문서" ref={stageRef}>
          {cause ? (
            <div className="error" role="alert">
              <p>파일을 열 수 없습니다</p>
              <p>{cause}</p>
            </div>
          ) : pages ? (
            pages.map((page) => {
              const highlight = highlights.find((item) => item.page === page.page) ?? null
              return (
                <svg key={page.page} data-page={page.page} width={PAGE_WIDTH} height={PAGE_HEIGHT} viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}>
                  <rect width={PAGE_WIDTH} height={PAGE_HEIGHT} fill="#fffef9" />
                  <g data-layer="body">
                    {page.lines.map((line) => (
                      <text
                        key={`${line.nodeId}-${line.line}`}
                        data-node-id={line.nodeId}
                        data-line={line.line}
                        data-selected={line.nodeId === selectedId ? 'true' : 'false'}
                        x={line.x}
                        y={line.y}
                        onClick={() => choose(line.nodeId)}
                      >
                        {line.text}
                      </text>
                    ))}
                  </g>
                  <g data-layer="selection" pointerEvents="none">
                    {highlight ? (
                      <rect
                        data-selection={selectedId ?? ''}
                        x={highlight.x}
                        y={highlight.y}
                        width={highlight.width}
                        height={highlight.height}
                        fill="#f0c14d"
                        opacity="0.45"
                      />
                    ) : null}
                  </g>
                </svg>
              )
            })
          ) : (
            <p className="waiting">{fileName ? '읽는 중입니다' : 'HWPX를 올리면 문단이 이 페이지에 보입니다.'}</p>
          )}
        </section>
        <aside>
          <h2>선택</h2>
          {selection && validation ? (
            <>
              <dl className="facts">
                <div>
                  <dt>node_id</dt>
                  <dd>{selection.node_id}</dd>
                </div>
                <div>
                  <dt>엔트리</dt>
                  <dd>{selection.entry}</dd>
                </div>
                <div>
                  <dt>원문</dt>
                  <dd>{selection.text}</dd>
                </div>
              </dl>
              <pre>{JSON.stringify({ node_id: selection.node_id, entry: selection.entry, text: selection.text }, null, 2)}</pre>
              <label className="field">
                <span>바꿀 문장</span>
                <input
                  value={replacement}
                  onChange={(event) => {
                    const value = event.target.value
                    setReplacement(value)
                    setCommandDirty(false)
                    setApplyNote(null)
                    if (!paragraphs) return
                    if (value === '') {
                      setPreview({ status: 'draft', command: null })
                      return
                    }
                    const command = draftReplaceText(
                      { node_id: selection.node_id, text: selection.text },
                      value,
                    )
                    applyEdit(validateCommand(command, textNodes(paragraphs)), paragraphs)
                  }}
                />
              </label>
              <h2>명령</h2>
              <textarea
                aria-label="명령 JSON"
                value={shownCommand}
                spellCheck={false}
                onChange={(event) => {
                  const value = event.target.value
                  setCommandDirty(true)
                  setCommandText(value)
                  setApplyNote(null)
                  if (!paragraphs) return
                  applyEdit(validateShown(value, paragraphs), paragraphs)
                }}
              />
              <p className="validation" data-validation={validation.ok ? 'pass' : validation.code}>
                {validation.ok ? '통과' : `${validation.code} ${validation.message}`}
              </p>
              <p className="preview-status" data-preview={preview.status}>
                {preview.status}
              </p>
              {(preview.status === 'valid' || preview.status === 'approved') && preview.command ? (
                <div className="compare">
                  <div>
                    <h3>현재 문장</h3>
                    <p>{preview.command.expected_original_text}</p>
                  </div>
                  <div>
                    <h3>바꿀 문장</h3>
                    <p>{preview.command.replacement_text}</p>
                  </div>
                </div>
              ) : null}
              {preview.status === 'valid' ? (
                <div className="actions">
                  <button type="button" onClick={approve}>
                    승인
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreview((state) =>
                        previewDecision(state, { type: 'reject' }, textNodes(paragraphs ?? []), originalBytes.current),
                      )
                    }
                  >
                    거절
                  </button>
                </div>
              ) : null}
              {applyNote ? (
                <p className="kept" data-apply={preview.status === 'approved' ? 'screen' : 'refused'}>
                  {applyNote}
                </p>
              ) : null}
            </>
          ) : (
            <p className="aside-note">문단을 클릭하면 선택과 명령 초안이 여기 나옵니다.</p>
          )}
          <p className="aside-note">다운로드는 없습니다.</p>
        </aside>
      </div>
    </div>
  )
}

function textNodes(paragraphs: Paragraph[]): TextNode[] {
  return paragraphs.map((paragraph) => ({ nodeId: paragraph.nodeId, text: paragraph.text, runCount: paragraph.runs.length }))
}

function validateShown(commandText: string, paragraphs: Paragraph[]): CommandValidation {
  try {
    return validateCommand(
      JSON.parse(commandText) as unknown,
      paragraphs.map((paragraph) => ({ nodeId: paragraph.nodeId, text: paragraph.text, runCount: paragraph.runs.length })),
    )
  } catch {
    return { ok: false, code: 'INVALID_COMMAND', message: '명령 JSON이 올바르지 않습니다' }
  }
}
