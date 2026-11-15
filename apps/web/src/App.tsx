import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { draftReplaceText, previewDecision, validateCommand, type CommandValidation, type PreviewState, type TextNode } from '@hwpx/commands'
import { applyFormat, applyParagraphText, planPatch, readFormat, readPackage, readParagraphs, type DocumentFormat, type PageMargins, type Paragraph, type PatchPlan } from '@hwpx/hwpx'
import { layoutPages, PAGE_HEIGHT, PAGE_WIDTH, paragraphSelection, type ParagraphView } from './svg/layoutParagraphs.ts'

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
  const [patchPlan, setPatchPlan] = useState<PatchPlan | null>(null)
  const [format, setFormat] = useState<DocumentFormat | null>(null)
  const [sizePt, setSizePt] = useState('10')
  const [color, setColor] = useState('#000000')
  const [align, setAlign] = useState('JUSTIFY')
  const [charScope, setCharScope] = useState<'sentence' | 'paragraph' | 'document'>('sentence')
  const [paraScope, setParaScope] = useState<'paragraph' | 'document'>('paragraph')
  const [marginScope, setMarginScope] = useState<'section' | 'document'>('section')
  const [margins, setMargins] = useState<Record<MarginKey, string>>(emptyMargins())
  const stageRef = useRef<HTMLElement>(null)
  const openGeneration = useRef(0)
  const originalBytes = useRef<Uint8Array>(new Uint8Array())
  const workingBytes = useRef<Uint8Array>(new Uint8Array())
  const pages = paragraphs
    ? layoutPages(format ? styledViews(paragraphs, format) : paragraphs.map((paragraph) => ({ nodeId: paragraph.nodeId, text: paragraph.text })))
    : null

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
  }, [selectedId, paragraphs, format])

  useEffect(() => {
    if (!selected || !format) return
    const run = selected.runs.find((item) => item.text !== '') ?? selected.runs[0]
    const char = run ? format.charPr[run.charPrIDRef] : undefined
    if (char) {
      setSizePt(String(char.height / 100))
      setColor(hexColor(char.textColor))
    }
    const para = format.paraPr[selected.paraPrIDRef]
    if (para?.align) setAlign(para.align)
    const section = format.sections[sectionIndex(selected.nodeId)]
    setMargins(section?.margins ? marginsToFields(section.margins) : emptyMargins())
  }, [selectedId, format])

  async function openFile(file: File) {
    const generation = openGeneration.current + 1
    openGeneration.current = generation
    setFileName(file.name)
    setParagraphs(null)
    setCause(null)
    setSelectedId(null)
    setReplacement('')
    setCommandDirty(false)
    setCommandText('')
    setPreview({ status: 'draft', command: null })
    setApplyNote(null)
    setPatchPlan(null)
    setFormat(null)
    let textReady = false
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (openGeneration.current !== generation) return
      originalBytes.current = bytes
      workingBytes.current = bytes
      // 글자를 먼저 올리고 브라우저에 한 번 양보한 뒤에 서식을 읽는다.
      setParagraphs(readParagraphs(bytes))
      textReady = true
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (openGeneration.current !== generation) return
      setFormat(readFormat(bytes))
    } catch (error) {
      if (openGeneration.current !== generation) return
      if (!textReady) {
        setParagraphs(null)
        setFormat(null)
      }
      setCause(error instanceof Error ? error.message : '알 수 없는 오류')
    }
  }

  function choose(nodeId: string) {
    setSelectedId(nodeId)
    setReplacement('')
    setCommandDirty(false)
    setPreview({ status: 'draft', command: null })
    setApplyNote(null)
    setPatchPlan(null)
  }

  function approve() {
    if (!paragraphs || preview.status !== 'valid' || preview.command === null) return
    const planned = planPatch(readPackage(workingBytes.current), {
      targetNodeId: preview.command.target_node_id,
      replacementText: preview.command.replacement_text,
    })
    if (!planned.ok) {
      setPatchPlan(null)
      setApplyNote(`${planned.code} ${planned.message}`)
      return
    }
    const applied = applyParagraphText(paragraphs, preview.command.target_node_id, preview.command.replacement_text)
    if (!applied.ok) {
      setPatchPlan(null)
      setApplyNote(`${applied.code} ${applied.message}`)
      return
    }
    const approved = previewDecision(preview, { type: 'approve' }, textNodes(paragraphs), originalBytes.current)
    workingBytes.current = planned.zip
    setFormat(readFormat(planned.zip))
    setParagraphs(applied.paragraphs)
    setPreview(approved)
    setPatchPlan(planned.plan)
    setApplyNote('화면만 바뀌었습니다. 받은 파일은 그대로입니다')
  }

  function finishFormat(applied: ReturnType<typeof applyFormat>) {
    if (!applied.ok) {
      setApplyNote(applied.message)
      return
    }
    const nextParagraphs = readParagraphs(applied.bytes)
    workingBytes.current = applied.bytes
    setFormat(applied.format)
    setParagraphs(nextParagraphs)
    setPatchPlan(null)
    setApplyNote('화면 서식이 바뀌었습니다. 받은 파일은 그대로입니다')
  }

  // 글자 승인은 글자 명령만 한 번 적용한다. 정렬과 여백은 보내지 않는다.
  function approveCharacter() {
    if (!selected || !format) return
    const height = Math.round(Number(sizePt) * 100)
    if (!Number.isFinite(height) || height <= 0) {
      setApplyNote('글자 크기를 숫자로 입력하세요')
      return
    }
    try {
      finishFormat(applyFormat(workingBytes.current, {
        type: 'character',
        scope: charScope,
        nodeId: selected.nodeId,
        height,
        textColor: hexColor(color),
      }))
    } catch (error) {
      setApplyNote(error instanceof Error ? error.message : '서식을 적용하지 못했습니다')
    }
  }

  function approveParagraph() {
    if (!selected || !format) return
    try {
      finishFormat(applyFormat(workingBytes.current, {
        type: 'paragraph',
        scope: paraScope,
        nodeId: selected.nodeId,
        align,
      }))
    } catch (error) {
      setApplyNote(error instanceof Error ? error.message : '서식을 적용하지 못했습니다')
    }
  }

  function approveMargins() {
    if (!selected || !format) return
    const section = format.sections[sectionIndex(selected.nodeId)]
    if (!section?.margins) {
      setApplyNote('쪽 여백이 없습니다')
      return
    }
    const nextMargins = fieldsToMargins(margins)
    if (!nextMargins) {
      setApplyNote('여백을 숫자로 입력하세요')
      return
    }
    try {
      finishFormat(applyFormat(workingBytes.current, {
        type: 'section',
        scope: marginScope,
        nodeId: selected.nodeId,
        margins: nextMargins,
      }))
    } catch (error) {
      setApplyNote(error instanceof Error ? error.message : '서식을 적용하지 못했습니다')
    }
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
          {cause && !pages ? (
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
                        textAnchor={line.textAnchor}
                        style={line.fontSize ? { fontSize: line.fontSize, fill: line.fill } : undefined}
                        onClick={() => choose(line.nodeId)}
                      >
                        {line.segments ? line.segments.map((segment, index) => (
                          <tspan key={index} style={{ fontSize: segment.fontSize, fill: segment.fill }}>{segment.text}</tspan>
                        )) : line.text}
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
          {cause && paragraphs ? <p className="aside-note">{cause}</p> : null}
          {selected && selection && validation ? (
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
              <section className="format-panel">
                <h2>글자</h2>
                <label className="field">
                  <span>적용 범위</span>
                  <select value={charScope} onChange={(event) => setCharScope(event.target.value === 'document' ? 'document' : event.target.value === 'paragraph' ? 'paragraph' : 'sentence')}>
                    <option value="sentence">이 문장</option>
                    <option value="paragraph">이 문단</option>
                    <option value="document">문서 전체</option>
                  </select>
                </label>
                <div className="format-grid">
                  <label className="field">
                    <span>글자 크기 (pt)</span>
                    <input value={sizePt} inputMode="decimal" onChange={(event) => setSizePt(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>글자색</span>
                    <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                  </label>
                </div>
                <div className="actions">
                  <button type="button" onClick={approveCharacter} disabled={!format}>글자 승인</button>
                </div>
              </section>
              <section className="format-panel">
                <h2>문단</h2>
                <label className="field">
                  <span>적용 범위</span>
                  <select value={paraScope} onChange={(event) => setParaScope(event.target.value === 'document' ? 'document' : 'paragraph')}>
                    <option value="paragraph">이 문단</option>
                    <option value="document">문서 전체</option>
                  </select>
                </label>
                <label className="field">
                  <span>문단 정렬</span>
                  <select value={align} onChange={(event) => setAlign(event.target.value)}>
                    {alignOptions(align).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button type="button" onClick={approveParagraph} disabled={!format}>문단 승인</button>
                </div>
              </section>
              <section className="format-panel">
                <h2>문서</h2>
                {!format ? (
                  <p className="aside-note">서식을 읽는 중입니다</p>
                ) : format.sections[sectionIndex(selected.nodeId)]?.margins ? (
                  <>
                    <label className="field">
                      <span>적용 범위</span>
                      <select value={marginScope} onChange={(event) => setMarginScope(event.target.value === 'document' ? 'document' : 'section')}>
                        <option value="section">이 구역</option>
                        <option value="document">문서 전체</option>
                      </select>
                    </label>
                    <div className="format-grid">
                      {MARGIN_FIELDS.map((field) => (
                        <label className="field" key={field.key}>
                          <span>{`${field.label} (mm)`}</span>
                          <input value={margins[field.key]} inputMode="decimal" onChange={(event) => setMargins((current) => ({ ...current, [field.key]: event.target.value }))} />
                        </label>
                      ))}
                    </div>
                    <div className="actions">
                      <button type="button" onClick={approveMargins}>여백 승인</button>
                    </div>
                  </>
                ) : (
                  <p className="aside-note">쪽 여백이 없습니다.</p>
                )}
              </section>
              <label className="field">
                <span>바꿀 문장</span>
                <input
                  value={replacement}
                  onChange={(event) => {
                    const value = event.target.value
                    setReplacement(value)
                    setCommandDirty(false)
                    setApplyNote(null)
                    setPatchPlan(null)
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
                  setPatchPlan(null)
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
                    onClick={() => {
                      setPatchPlan(null)
                      setPreview((state) =>
                        previewDecision(state, { type: 'reject' }, textNodes(paragraphs ?? []), originalBytes.current),
                      )
                    }}
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
              {patchPlan ? (
                <div className="patch-plan">
                  <p className="kept" data-part="changed">{`바꿀 파트: ${patchPlan.changed.map((entry) => entry.path).join(', ')}`}</p>
                  <ul>
                    {patchPlan.kept.map((entry) => (
                      <li key={entry.path} data-part="kept">{`유지 ${entry.path}`}</li>
                    ))}
                  </ul>
                  <p className="aside-note">저장 파일은 다음 단계</p>
                </div>
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

const MARGIN_FIELDS = [
  { key: 'top', label: '위' },
  { key: 'bottom', label: '아래' },
  { key: 'left', label: '왼쪽' },
  { key: 'right', label: '오른쪽' },
  { key: 'header', label: '머리말' },
  { key: 'footer', label: '꼬리말' },
  { key: 'gutter', label: '제본' },
] as const

type MarginKey = (typeof MARGIN_FIELDS)[number]['key']

const ALIGN_LABELS: Record<string, string> = {
  LEFT: '왼쪽',
  CENTER: '가운데',
  RIGHT: '오른쪽',
  JUSTIFY: '양쪽',
}

function styledViews(paragraphs: Paragraph[], format: DocumentFormat): ParagraphView[] {
  return paragraphs.map((paragraph) => {
    const section = format.sections[sectionIndex(paragraph.nodeId)]
    const pageWidth = section?.pageWidth || 59528
    const para = format.paraPr[paragraph.paraPrIDRef]
    return {
      nodeId: paragraph.nodeId,
      text: paragraph.text,
      align: para?.align,
      runs: paragraph.runs.filter((run) => run.text !== '').map((run) => {
        const char = format.charPr[run.charPrIDRef]
        return {
          text: run.text,
          fontSize: (char?.height ?? 1000) * (PAGE_WIDTH / pageWidth),
          fill: hexColor(char?.textColor ?? '#000000'),
        }
      }),
      frame: section?.margins
        ? { pageWidthHwp: section.pageWidth, pageHeightHwp: section.pageHeight, margins: section.margins }
        : undefined,
    }
  })
}

function sectionIndex(nodeId: string): number {
  return Number(/^section(\d+)_p\d+$/.exec(nodeId)?.[1] ?? 0)
}

function hexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#000000'
}

function emptyMargins(): Record<MarginKey, string> {
  return { top: '', bottom: '', left: '', right: '', header: '', footer: '', gutter: '' }
}

function marginsToFields(margins: PageMargins): Record<MarginKey, string> {
  return {
    top: hwpToMm(margins.top),
    bottom: hwpToMm(margins.bottom),
    left: hwpToMm(margins.left),
    right: hwpToMm(margins.right),
    header: hwpToMm(margins.header),
    footer: hwpToMm(margins.footer),
    gutter: hwpToMm(margins.gutter),
  }
}

function fieldsToMargins(fields: Record<MarginKey, string>): PageMargins | null {
  const values = MARGIN_FIELDS.map((field) => Math.round((Number(fields[field.key]) / 25.4) * 7200))
  if (values.some((value) => !Number.isFinite(value))) return null
  const [top, bottom, left, right, header, footer, gutter] = values
  return { top, bottom, left, right, header, footer, gutter }
}

function hwpToMm(value: number): string {
  return ((value / 7200) * 25.4).toFixed(1)
}

function alignOptions(current: string): { value: string; label: string }[] {
  const options = Object.entries(ALIGN_LABELS).map(([value, label]) => ({ value, label }))
  if (!ALIGN_LABELS[current]) options.unshift({ value: current, label: current })
  return options
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
