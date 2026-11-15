import { useLayoutEffect, useRef, useState } from 'react'
import { draftReplaceText, validateCommand, type CommandValidation } from '@hwpx/commands'
import { readParagraphs, type Paragraph } from '@hwpx/hwpx'
import { layoutParagraphs, pageHeight, paragraphSelection } from './svg/layoutParagraphs.ts'

type Highlight = {
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
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const lines = paragraphs ? layoutParagraphs(paragraphs) : null

  const selected = paragraphs?.find((paragraph) => paragraph.nodeId === selectedId) ?? null
  const selection = selected ? paragraphSelection({ nodeId: selected.nodeId, text: selected.text, x: 40, y: 28 }) : null
  const draft = selection ? draftReplaceText({ node_id: selection.node_id, text: selection.text }, replacement) : null
  const shownCommand = commandDirty ? commandText : draft ? JSON.stringify(draft, null, 2) : ''
  const validation = selection ? validateShown(shownCommand, paragraphs ?? []) : null

  useLayoutEffect(() => {
    if (!selectedId) {
      setHighlight(null)
      return
    }
    const elements = [...(svgRef.current?.querySelectorAll<SVGTextElement>(`text[data-node-id="${selectedId}"]`) ?? [])]
    if (elements.length === 0) return
    const boxes = elements.map((element) => element.getBBox())
    const x = Math.min(...boxes.map((box) => box.x)) - 6
    const y = Math.min(...boxes.map((box) => box.y)) - 3
    const right = Math.max(...boxes.map((box) => box.x + box.width)) + 6
    const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 3
    setHighlight({ x, y, width: right - x, height: bottom - y })
  }, [selectedId, paragraphs])

  async function openFile(file: File) {
    setFileName(file.name)
    setParagraphs(null)
    setCause(null)
    setSelectedId(null)
    setReplacement('')
    setCommandDirty(false)
    setCommandText('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
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
        <section className="stage" aria-label="문서">
          {cause ? (
            <div className="error" role="alert">
              <p>파일을 열 수 없습니다</p>
              <p>{cause}</p>
            </div>
          ) : lines ? (
            <svg ref={svgRef} data-page="1" width="794" height={pageHeight(lines)} viewBox={`0 0 794 ${pageHeight(lines)}`}>
              <rect width="794" height={pageHeight(lines)} fill="#fffef9" />
              <g data-layer="body">
                {lines.map((line) => (
                  <text
                    key={`${line.nodeId}-${line.y}`}
                    data-node-id={line.nodeId}
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
                    setReplacement(event.target.value)
                    setCommandDirty(false)
                  }}
                />
              </label>
              <h2>명령</h2>
              <textarea
                aria-label="명령 JSON"
                value={shownCommand}
                spellCheck={false}
                onChange={(event) => {
                  setCommandDirty(true)
                  setCommandText(event.target.value)
                }}
              />
              <p className="validation" data-validation={validation.ok ? 'pass' : validation.code}>
                {validation.ok ? '통과' : `${validation.code} ${validation.message}`}
              </p>
            </>
          ) : (
            <p className="aside-note">문단을 클릭하면 선택과 명령 초안이 여기 나옵니다.</p>
          )}
          <p className="aside-note">이 화면에는 적용, 저장, 다운로드가 없습니다.</p>
        </aside>
      </div>
    </div>
  )
}

function validateShown(commandText: string, paragraphs: Paragraph[]): CommandValidation {
  try {
    return validateCommand(
      JSON.parse(commandText) as unknown,
      paragraphs.map((paragraph) => ({ nodeId: paragraph.nodeId, text: paragraph.text })),
    )
  } catch {
    return { ok: false, code: 'INVALID_COMMAND', message: '명령 JSON이 올바르지 않습니다' }
  }
}
