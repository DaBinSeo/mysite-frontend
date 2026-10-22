import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  CHUNK_STRATEGIES, DOC_MAX_LENGTH, EMBEDDING_DIM, SAMPLE_DOC,
  buildIndex, buildPrompt, chunkColor, search,
} from '../utils/rag.js'
import { useTitle } from '../utils/useTitle.js'

// 문서를 넣으면 단계가 하나씩 차례로 나타난다 (원문 → 청킹 → 토큰화 → 임베딩 → 벡터 공간)
const DOC_STAGES = 5
const STAGE_DELAY_MS = 450
const QUERY_MAX_LENGTH = 500

// 단계 카드 공통 틀
function Stage({ step, title, desc, children }) {
  return (
    <section className="card mb-3 rag-stage">
      <div className="card-header d-flex align-items-baseline gap-2">
        <span className="badge text-bg-dark">{step}</span>
        <strong>{title}</strong>
      </div>
      <div className="card-body">
        {desc && <p className="text-body-secondary small mb-3">{desc}</p>}
        {children}
      </div>
    </section>
  )
}

function ChunkBadge({ index }) {
  return <span className="badge" style={{ background: chunkColor(index) }}>#{index + 1}</span>
}

// 원문 위에 청크 범위를 색으로 칠한다. 두 청크가 겹친 부분은 노란 형광펜 + 밑줄
const ChunkMap = memo(function ChunkMap({ segments }) {
  return (
    <div className="rag-doc border rounded p-2">
      {segments.map((s) => {
        if (!s.covers.length) return <span key={s.start} className="text-body-tertiary">{s.text}</span>
        const overlap = s.covers.length > 1
        return (
          <span key={s.start}
                className={overlap ? 'rag-overlap' : undefined}
                style={overlap ? undefined : { background: `${chunkColor(s.covers[0])}22` }}
                title={`청크 ${s.covers.map((i) => `#${i + 1}`).join(', ')}`}>
            {s.text}
          </span>
        )
      })}
    </div>
  )
})

// 벡터 값을 칸 색으로 그린다 (양수 빨강, 음수 파랑, 진할수록 절댓값이 크다)
const VectorStrip = memo(function VectorStrip({ vector, max }) {
  return (
    <div className="rag-vector" style={{ gridTemplateColumns: `repeat(${vector.length}, 1fr)` }}>
      {vector.map((v, i) => {
        const alpha = Math.min(1, Math.abs(v) / max)
        const rgb = v >= 0 ? '220,53,69' : '13,110,253'
        return <span key={i} style={{ background: `rgba(${rgb},${alpha})` }} title={`차원 ${i}: ${v.toFixed(4)}`} />
      })}
    </div>
  )
})

// PCA로 줄인 2차원 좌표를 산점도로 그린다. 질문이 있으면 별표와 top-k 연결선을 함께 그린다
function VectorSpace({ chunks, result }) {
  const W = 480
  const H = 300
  const PAD = 28
  const pts = chunks.map((c) => c.point)
  if (result) pts.push(result.point)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = (x) => (maxX === minX ? W / 2 : PAD + ((x - minX) / (maxX - minX)) * (W - PAD * 2))
  const sy = (y) => (maxY === minY ? H / 2 : H - PAD - ((y - minY) / (maxY - minY)) * (H - PAD * 2))
  const topSet = new Set(result?.top.map((r) => r.index))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-100 border rounded bg-body-tertiary" role="img"
         aria-label="청크 임베딩을 2차원으로 투영한 산점도">
      {result && result.top.map((r) => (
        <line key={r.index} x1={sx(result.point[0])} y1={sy(result.point[1])}
              x2={sx(chunks[r.index].point[0])} y2={sy(chunks[r.index].point[1])}
              stroke="#212529" strokeDasharray="4 3" strokeOpacity="0.6" />
      ))}
      {chunks.map((c) => {
        const dim = result && !topSet.has(c.index)
        return (
          <g key={c.index} opacity={dim ? 0.35 : 1}>
            <circle cx={sx(c.point[0])} cy={sy(c.point[1])} r="11" fill={chunkColor(c.index)} />
            <text x={sx(c.point[0])} y={sy(c.point[1])} dy="0.35em" textAnchor="middle" fontSize="10" fill="#fff">
              {c.index + 1}
            </text>
            <title>{`#${c.index + 1} ${c.text.slice(0, 60)}`}</title>
          </g>
        )
      })}
      {result && (
        <g>
          <text x={sx(result.point[0])} y={sy(result.point[1])} dy="0.35em" textAnchor="middle" fontSize="24">★</text>
          <title>{`질문: ${result.query}`}</title>
        </g>
      )}
    </svg>
  )
}

// 하단 고정 입력창. 입력 중인 글은 여기서만 관리해 타이핑할 때 위쪽 결과 전체가 다시 그려지지 않게 한다
function InputBar({ mode, setMode, canQuery, onSubmitDoc, onSubmitQuery }) {
  const [input, setInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    // 모드를 바꿔도 입력은 남으므로, 문서 모드에서 쓴 긴 글이 질문으로 가지 않게 여기서도 자른다
    if (mode === 'doc') onSubmitDoc(text)
    else onSubmitQuery(text.slice(0, QUERY_MAX_LENGTH))
    setInput('')
  }

  // 문서 모드는 줄바꿈이 필요하므로 Ctrl(⌘)+Enter, 질문 모드는 Enter로 보낸다
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    if (mode === 'query' ? !e.shiftKey : e.ctrlKey || e.metaKey) handleSubmit(e)
  }

  return (
    <form className="rag-input position-fixed bottom-0 start-0 end-0 bg-body border-top" onSubmit={handleSubmit}>
      <div className="container py-2">
        <div className="d-flex align-items-center gap-2 mb-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="입력 종류">
            <button type="button" className={`btn btn-outline-secondary ${mode === 'doc' ? 'active' : ''}`}
                    aria-pressed={mode === 'doc'} onClick={() => setMode('doc')}>문서 넣기</button>
            <button type="button" className={`btn btn-outline-secondary ${mode === 'query' ? 'active' : ''}`}
                    aria-pressed={mode === 'query'} onClick={() => setMode('query')} disabled={!canQuery}>질문하기</button>
          </div>
          <small className="text-body-secondary ms-auto text-end">
            {mode === 'doc' ? `Ctrl+Enter로 처리 · 최대 ${DOC_MAX_LENGTH.toLocaleString()}자(넘으면 잘림)` : 'Enter로 검색'}
          </small>
        </div>
        <div className="d-flex gap-2">
          <textarea className="form-control" rows={mode === 'doc' ? 3 : 1} value={input}
                    maxLength={mode === 'doc' ? DOC_MAX_LENGTH : QUERY_MAX_LENGTH}
                    placeholder={mode === 'doc' ? '청킹·임베딩할 문서를 붙여 넣으세요 (새 문서를 넣으면 이전 결과를 바꿉니다)' : '문서에 대해 질문해 보세요'}
                    aria-label={mode === 'doc' ? '문서 입력' : '질문 입력'}
                    onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} />
          <button type="submit" className="btn btn-primary text-nowrap align-self-end" disabled={!input.trim()}>
            {mode === 'doc' ? '처리' : '검색'}
          </button>
        </div>
      </div>
    </form>
  )
}

// RAG 데이터 구축 과정 시각화 (로그인 불필요, 계산은 모두 브라우저에서 한다)
export default function RagVisualizer() {
  useTitle('RAG 시각화')
  const [doc, setDoc] = useState('')
  const [options, setOptions] = useState({ strategy: 'sentence', size: 120, overlap: 30 })
  const [topK, setTopK] = useState(3)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState(0)
  const [mode, setMode] = useState('doc')
  const [selected, setSelected] = useState(0)
  const bottomRef = useRef(null)

  const index = useMemo(() => (doc ? buildIndex(doc, options) : null), [doc, options])
  const result = useMemo(() => (index && query ? search(index, query, topK) : null), [index, query, topK])
  const prompt = useMemo(() => (result ? buildPrompt(index, result) : ''), [index, result])
  const paragraphCount = useMemo(() => doc.split(/\n\s*\n/).filter((p) => p.trim()).length, [doc])
  const maxAbs = useMemo(
    () => Math.max(1e-6, ...(index?.chunks.flatMap((c) => c.vector.map(Math.abs)) ?? [])),
    [index],
  )
  const chunk = index?.chunks[Math.min(selected, index.chunks.length - 1)]

  // 문서를 새로 넣으면 단계를 하나씩 연다
  useEffect(() => {
    if (!doc || stage >= DOC_STAGES) return
    const timer = setTimeout(() => setStage((s) => s + 1), STAGE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [doc, stage])

  // 새 단계·검색 결과가 나오면 입력창 바로 위(가장 최근 결과)로 스크롤한다
  useEffect(() => {
    if (!stage && !result) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [stage, result])

  const submitDoc = (text) => {
    setDoc(text.slice(0, DOC_MAX_LENGTH))
    setQuery('')
    setSelected(0)
    setStage(1)
    setMode('query')
  }

  const setOption = (key) => (e) => {
    const value = key === 'strategy' ? e.target.value : Number(e.target.value)
    setOptions((o) => {
      const next = { ...o, [key]: value }
      // 겹침은 청크 크기의 절반을 넘지 않게 한다
      next.overlap = Math.min(next.overlap, Math.floor(next.size / 2))
      return next
    })
    setSelected(0)
  }

  const totalTokens = index?.chunks.reduce((n, c) => n + c.tokens.length, 0) ?? 0

  return (
    <div className="rag-page">
      <div className="container my-3">
        <h4 className="border-bottom pb-2">RAG 데이터 구축 과정 시각화</h4>
        <p className="text-body-secondary small">
          하단 입력창에 문서를 넣으면 청킹 → 토큰화 → 임베딩 → 벡터 공간 순서로 처리 과정을 보여 줍니다.
          그다음 질문을 입력하면 비슷한 청크를 찾아 프롬프트를 만드는 검색 단계까지 볼 수 있습니다.
          임베딩은 실제 모델 대신 단어·글자 조각을 해시한 {EMBEDDING_DIM}차원 벡터(학습용)이며, 입력한 글은 서버로 보내지 않습니다.
        </p>

        {/* 청킹 설정: 바꾸면 아래 단계가 바로 다시 계산된다 */}
        <div className="card mb-3">
          <div className="card-body row g-3 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label small mb-1" htmlFor="rag-strategy">청킹 방식</label>
              <select id="rag-strategy" className="form-select form-select-sm"
                      value={options.strategy} onChange={setOption('strategy')}>
                {Object.entries(CHUNK_STRATEGIES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="rag-size">청크 크기: {options.size}자</label>
              <input id="rag-size" type="range" className="form-range" min="50" max="600" step="10"
                     value={options.size} onChange={setOption('size')} />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="rag-overlap">겹침: {options.overlap}자</label>
              <input id="rag-overlap" type="range" className="form-range" min="0" max={Math.floor(options.size / 2)}
                     step="5" value={options.overlap} onChange={setOption('overlap')} />
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label small mb-1" htmlFor="rag-topk">검색 개수(top-k): {topK}</label>
              <input id="rag-topk" type="range" className="form-range" min="1" max="5"
                     value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
            </div>
            <div className="col-12 small text-body-secondary">{CHUNK_STRATEGIES[options.strategy].help}</div>
          </div>
        </div>

        {!index && (
          <div className="text-center text-body-secondary py-5">
            <p>아직 문서가 없습니다. 하단 입력창에 문서를 붙여 넣어 보세요.</p>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => submitDoc(SAMPLE_DOC)}>
              예시 문서로 시작하기
            </button>
          </div>
        )}

        {index && stage >= 1 && (
          <Stage step="1" title="원문 수집·정리"
                 desc="문서를 불러와 하나의 텍스트로 만든다. 실제로는 PDF·웹 페이지에서 본문만 뽑고 불필요한 공백·머리말을 정리한다.">
            <div className="d-flex flex-wrap gap-3 small mb-2">
              <span>글자 수 <strong>{doc.length.toLocaleString()}</strong></span>
              <span>문단 수 <strong>{paragraphCount}</strong></span>
            </div>
            <pre className="rag-doc border rounded p-2 mb-0">{doc}</pre>
          </Stage>
        )}

        {index && stage >= 2 && (
          <Stage step="2" title={`청킹 (Chunking) — ${index.chunks.length}개`}
                 desc="검색 단위로 쓸 수 있게 문서를 조각낸다. 색은 청크, 노란 밑줄은 두 청크에 함께 들어간 겹침 부분이다. 청크를 누르면 아래 단계에서 그 청크를 자세히 본다.">
            <ChunkMap segments={index.segments} />
            <div className="d-flex flex-wrap gap-2 mt-3">
              {index.chunks.map((c) => (
                <button key={c.index} type="button"
                        className={`btn btn-sm rag-chunk-btn ${chunk.index === c.index ? 'active' : ''}`}
                        style={{ '--chunk-color': chunkColor(c.index) }}
                        aria-pressed={chunk.index === c.index}
                        onClick={() => setSelected(c.index)}>
                  #{c.index + 1} <span className="opacity-75">{c.text.length}자</span>
                </button>
              ))}
            </div>
          </Stage>
        )}

        {index && stage >= 3 && (
          <Stage step="3" title="토큰화 (Tokenization)"
                 desc="임베딩 모델이 읽을 수 있게 청크를 토큰으로 쪼갠다. 여기서는 글자·숫자 묶음 단위로 나눈다(실제 모델은 BPE 같은 서브워드 단위).">
            <div className="small mb-2">
              전체 토큰 <strong>{totalTokens}</strong>개 · 선택한 청크 <ChunkBadge index={chunk.index} /> 토큰 <strong>{chunk.tokens.length}</strong>개
            </div>
            <div className="d-flex flex-wrap gap-1">
              {chunk.tokens.map((t, i) => (
                <span key={i} className="rag-token" style={{ '--chunk-color': chunkColor(chunk.index) }}>{t}</span>
              ))}
            </div>
          </Stage>
        )}

        {index && stage >= 4 && (
          <Stage step="4" title={`임베딩 (Embedding) — ${EMBEDDING_DIM}차원`}
                 desc="토큰을 숫자 벡터로 바꾼다. 한 줄이 청크 하나의 벡터이고, 칸 하나가 차원 하나다(빨강 +, 파랑 −). 길이를 1로 맞춰 코사인 유사도를 내적으로 계산할 수 있게 한다.">
            <div className="rag-vectors">
              {index.chunks.map((c) => (
                <button key={c.index} type="button" aria-pressed={c.index === chunk.index}
                        aria-label={`청크 #${c.index + 1} 벡터 선택`}
                        className={`rag-vector-row ${c.index === chunk.index ? 'active' : ''}`}
                        onClick={() => setSelected(c.index)}>
                  <ChunkBadge index={c.index} />
                  <VectorStrip vector={c.vector} max={maxAbs} />
                </button>
              ))}
            </div>
            <div className="small text-body-secondary mt-2 font-monospace text-break">
              #{chunk.index + 1} = [{chunk.vector.slice(0, 8).map((v) => v.toFixed(3)).join(', ')}, …]
            </div>
          </Stage>
        )}

        {index && stage >= 5 && (
          <Stage step="5" title="벡터 저장소 (Vector Store)"
                 desc={`벡터를 원문과 함께 저장한다. 아래 그림은 ${EMBEDDING_DIM}차원 벡터를 PCA로 2차원에 줄여 그린 것으로, 가까울수록 내용이 비슷하다.${index.chunks.length < 3 ? ' (청크가 3개 미만이면 위치 차이가 잘 드러나지 않는다)' : ''}`}>
            <VectorSpace chunks={index.chunks} result={result} />
            {!result && <p className="small text-body-secondary mt-2 mb-0">이제 하단 입력창에 질문을 입력해 검색해 보세요.</p>}
          </Stage>
        )}

        {result && stage >= DOC_STAGES && (
          <>
            <Stage step="6" title="질문 임베딩·유사도 검색 (Retrieval)"
                   desc="질문도 같은 방식으로 토큰화·임베딩한 뒤, 모든 청크 벡터와 코사인 유사도를 계산해 높은 순으로 top-k를 고른다. 위 벡터 공간의 ★이 질문이다.">
              <div className="small mb-2">
                질문 토큰: {result.tokens.map((t, i) => <span key={i} className="rag-token me-1">{t}</span>)}
              </div>
              <div className="rag-vector-row mb-3">
                <span className="badge text-bg-dark">질문</span>
                <VectorStrip vector={result.vector} max={maxAbs} />
              </div>
              {result.scored.map((r) => {
                const isTop = result.top.some((t) => t.index === r.index)
                return (
                  <div key={r.index} className={`d-flex align-items-center gap-2 mb-1 small ${isTop ? '' : 'opacity-50'}`}>
                    <ChunkBadge index={r.index} />
                    <div className="progress flex-grow-1" role="progressbar" aria-label={`청크 #${r.index + 1} 유사도`}
                         aria-valuenow={Math.round(Math.max(0, r.score) * 100)} aria-valuemin="0" aria-valuemax="100">
                      <div className="progress-bar" style={{ width: `${Math.max(0, r.score) * 100}%`, background: chunkColor(r.index) }} />
                    </div>
                    <span className="font-monospace rag-score">{r.score.toFixed(3)}</span>
                    {/* 막대 길이가 행마다 같도록 선택되지 않은 행도 배지 자리를 차지한다 */}
                    <span className={`badge text-bg-warning ${isTop ? '' : 'invisible'}`}>선택</span>
                  </div>
                )
              })}
            </Stage>

            <Stage step="7" title="프롬프트 구성 (Augmentation)"
                   desc="고른 청크를 근거 문서로 붙여 언어 모델에 보낼 프롬프트를 만든다. 모델은 이 내용을 바탕으로 답변을 생성한다(Generation).">
              <pre className="rag-doc border rounded p-2 mb-0 bg-body-tertiary">{prompt}</pre>
            </Stage>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <InputBar mode={mode} setMode={setMode} canQuery={!!index}
                onSubmitDoc={submitDoc} onSubmitQuery={setQuery} />
    </div>
  )
}
