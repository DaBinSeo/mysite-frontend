import { useMemo, useState } from 'react'
import { Heatmap, LlmPage, WordChip } from '../components/LlmViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import {
  PRETRAIN_CORPUS, VOCAB, cooccurrenceEmbeddings, dot, positionalEncoding, randomEmbeddings,
} from '../utils/llmModel.js'
import { pca2d } from '../utils/rag.js'

const INPUT_MAX_LENGTH = 60
const MAX_TOKENS = 16
const DIMS = [8, 16, 32]
const PE_POSITIONS = 24
const NEIGHBORS = 5
const SAMPLE = '커피 원두는 마시기 직전에 갈면 향이 오래 남는다.'

const TERMS = {
  1: [
    ['토큰 ID', '어휘 목록에서 그 토큰이 몇 번째인지 나타내는 정수. 모델은 글자가 아니라 이 번호를 입력으로 받는다.'],
    ['어휘 (Vocabulary)', `여기서는 예시 문장들의 단어와 특수 토큰 ${VOCAB.size}개. 실제 모델은 BPE로 만든 3만~20만 개 서브워드를 쓴다.`],
  ],
  2: [
    ['임베딩 표 (Embedding table)', '어휘 수 × 차원 크기의 행렬. 토큰 ID 번째 행을 꺼내는 것(조회)이 곧 임베딩이며, 이 값도 학습되는 매개변수다.'],
    ['차원 (d_model)', '토큰 하나를 나타내는 숫자 개수. 실제 모델은 768~16,384 정도이며, 모델의 모든 층이 이 크기의 벡터를 주고받는다.'],
  ],
  3: [
    ['의미 공간', '학습이 끝나면 비슷한 자리에 쓰이는 단어(예: 녹차·홍차)의 벡터가 서로 가까워진다. 이 성질 덕분에 처음 보는 조합도 일반화한다.'],
    ['PPMI', 'Positive Pointwise Mutual Information. 두 단어가 우연보다 얼마나 자주 함께 나오는지. 여기서는 학습된 임베딩 대신 이 값으로 의미 공간을 흉내 낸다.'],
    ['코사인 유사도', '두 벡터 사이 각도의 코사인. 1에 가까울수록 방향(의미)이 같다.'],
  ],
  4: [
    ['위치 인코딩 (Positional encoding)', '어텐션은 순서를 모르므로 몇 번째 토큰인지를 벡터로 만들어 더해 준다.'],
    ['사인·코사인 방식', '원 논문(Transformer, 2017)의 방식. 앞쪽 칸은 빨리, 뒤쪽 칸은 천천히 진동해 위치마다 다른 무늬가 된다.'],
    ['RoPE', '최근 LLM 대부분이 쓰는 회전 위치 인코딩. 더하는 대신 Q·K 벡터를 위치만큼 회전시켜 상대 거리를 표현한다.'],
  ],
  5: [
    ['입력 벡터', '토큰 임베딩 + 위치 인코딩. 같은 단어라도 위치가 다르면 다른 벡터가 되어 첫 트랜스포머 층으로 들어간다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 의미 공간 산점도: 고른 단어와 가까운 단어를 강조한다
function Scatter({ words, points, selected, neighbors, onSelect }) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = (v) => 30 + ((v - minX) / (maxX - minX || 1)) * 540
  const sy = (v) => 20 + ((v - minY) / (maxY - minY || 1)) * 280
  const near = new Set(neighbors.map((n) => n.index))
  return (
    <svg className="llm-chart border rounded" viewBox="0 0 600 320" role="img" aria-label="단어 의미 공간 2차원 그림">
      {points.map((p, i) => {
        const active = i === selected
        const hl = near.has(i)
        return (
          <g key={words[i]} role="button" tabIndex={0} aria-label={`${VOCAB.list[words[i]]} 선택`} aria-pressed={active}
             className="llm-point" onClick={() => onSelect(i)}
             onKeyDown={(e) => {
               if (e.key !== 'Enter' && e.key !== ' ') return
               e.preventDefault() // 스페이스로 페이지가 스크롤되지 않게
               onSelect(i)
             }}>
            {active && neighbors.map((n) => (
              <line key={n.index} x1={sx(p[0])} y1={sy(p[1])} x2={sx(points[n.index][0])} y2={sy(points[n.index][1])}
                    stroke="#146c43" strokeOpacity="0.5" />
            ))}
            <circle cx={sx(p[0])} cy={sy(p[1])} r={active ? 6 : 4} fill={active ? '#b02a37' : hl ? '#146c43' : '#6c757d'} />
            <text x={sx(p[0]) + 7} y={sy(p[1]) + 4} fontSize="13" fontWeight={active || hl ? 'bold' : 'normal'}
                  fill={active ? '#b02a37' : hl ? '#146c43' : 'currentColor'}>
              {VOCAB.list[words[i]]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// 2. 임베딩·위치 인코딩 (로그인 불필요)
export default function LlmEmbedding() {
  const [input, setInput] = useState(SAMPLE)
  const [dim, setDim] = useState(16)
  const [seed, setSeed] = useState(1)
  const [selectedToken, setSelectedToken] = useState(0)
  const [selectedWord, setSelectedWord] = useState(null)

  const ids = useMemo(() => VOCAB.encode(input).slice(0, MAX_TOKENS), [input])
  const table = useMemo(() => randomEmbeddings(dim, seed), [dim, seed])
  const pe = useMemo(() => positionalEncoding(Math.max(PE_POSITIONS, ids.length), dim), [dim, ids.length])
  const space = useMemo(() => {
    const { words, vectors } = cooccurrenceEmbeddings(PRETRAIN_CORPUS)
    return { words, vectors, points: pca2d(vectors).points }
  }, [])
  const peSimilarity = useMemo(() => {
    const rows = pe.slice(0, PE_POSITIONS)
    const norms = rows.map((r) => Math.hypot(...r))
    return rows.map((a, i) => rows.map((b, j) => dot(a, b) / (norms[i] * norms[j])))
  }, [pe])

  const sel = Math.min(selectedToken, Math.max(0, ids.length - 1))
  // 처음에는 '녹차는'을 고른다 (없으면 첫 단어)
  const wordIndex = selectedWord ?? Math.max(0, space.words.indexOf(VOCAB.id('녹차는')))
  const neighbors = space.vectors
    .map((v, i) => ({ index: i, score: dot(v, space.vectors[wordIndex]) }))
    .filter((n) => n.index !== wordIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, NEIGHBORS)
  const tokenVec = ids.length ? table[ids[sel]] : []
  const posVec = pe[sel] ?? []

  return (
    <LlmPage path="/llm/embedding"
             intro="모델은 글자를 직접 읽지 못합니다. 토큰을 번호(ID)로 바꾸고, 번호마다 숫자 벡터를 꺼낸 뒤, 몇 번째 토큰인지를 나타내는 위치 벡터를 더해 첫 층의 입력을 만듭니다.">
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-12 col-md">
            <label className="form-label small mb-1" htmlFor="emb-input">문장 (단어 단위로 최대 {MAX_TOKENS}토큰)</label>
            <input id="emb-input" className="form-control form-control-sm" value={input} maxLength={INPUT_MAX_LENGTH}
                   onChange={(e) => setInput(e.target.value)} />
          </div>
          <div className="col-6 col-md-auto">
            <label className="form-label small mb-1" htmlFor="emb-dim">차원 (d_model)</label>
            <select id="emb-dim" className="form-select form-select-sm" value={dim} onChange={(e) => setDim(Number(e.target.value))}>
              {DIMS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-auto">
            <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={() => setSeed((s) => s + 1)}>
              초기 가중치 다시 뽑기
            </button>
          </div>
        </div>
      </div>

      <Stage step="1" title={`토큰 → ID — ${ids.length}개`}
             desc="문장을 토큰으로 나누고 어휘 목록의 번호로 바꾼다. 예시 문장에 없던 단어는 <unk>(모르는 단어)가 된다.">
        {ids.length === 0 && <p className="small text-body-secondary mb-0">문장을 입력해 보세요.</p>}
        <div className="d-flex flex-wrap gap-2">
          {ids.map((id, i) => (
            <button key={i} type="button" className={`btn btn-sm btn-light border text-start ${i === sel ? 'border-dark' : ''}`}
                    aria-pressed={i === sel} onClick={() => setSelectedToken(i)}>
              <WordChip id={id} /> <span className="small text-body-secondary font-monospace">ID {id}</span>
            </button>
          ))}
        </div>
      </Stage>

      <Stage step="2" title={`임베딩 표 조회 — ${VOCAB.size} × ${dim} 행렬에서 ${ids.length}행`}
             desc="토큰 ID 번째 행을 꺼내면 그 토큰의 벡터가 된다. 아직 학습 전이라 값은 무작위다(빨강 +, 파랑 −). 학습하면서 이 값들이 조금씩 고쳐진다.">
        {ids.length > 0 && (
          <Heatmap rows={ids.map((id) => table[id])} rowLabels={ids.map((id) => VOCAB.list[id])} activeRow={sel}
                   colLabels={tokenVec.map((_, j) => j)} label="토큰별 임베딩 벡터" />
        )}
        <p className="small text-body-secondary mt-2 mb-0">
          임베딩 표의 매개변수: {VOCAB.size} × {dim} = <strong>{(VOCAB.size * dim).toLocaleString()}</strong>개
          (실제 모델 예: 어휘 128,000 × 차원 4,096 ≈ 5억 개)
        </p>
      </Stage>

      <Stage step="3" title="학습된 임베딩의 의미 공간"
             desc="학습이 끝난 임베딩에서는 비슷한 자리에 쓰이는 단어끼리 가까이 모인다. 예시 문장에서 함께 나온 단어로 만든 벡터를 2차원으로 줄여 그렸다. 점을 누르면 가장 가까운 단어를 보여 준다.">
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            <Scatter words={space.words} points={space.points} selected={wordIndex} neighbors={neighbors} onSelect={setSelectedWord} />
          </div>
          <div className="col-12 col-lg-4 small">
            <div className="fw-bold mb-1">가까운 단어: <span className="text-danger">{VOCAB.list[space.words[wordIndex]]}</span></div>
            <ol className="mb-0">
              {neighbors.map((n) => (
                <li key={n.index}>{VOCAB.list[space.words[n.index]]} <span className="text-body-secondary font-monospace">{n.score.toFixed(2)}</span></li>
              ))}
            </ol>
          </div>
        </div>
      </Stage>

      <Stage step="4" title={`위치 인코딩 — 위치 ${PE_POSITIONS}개 × 차원 ${dim}`}
             desc="위치마다 사인·코사인 값으로 고유한 무늬를 만든다. 왼쪽 칸은 위치에 따라 빠르게, 오른쪽 칸은 천천히 바뀐다. 오른쪽 표는 위치끼리의 코사인 유사도로, 가까운 위치일수록 비슷하다(대각선 근처가 진함).">
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <Heatmap rows={pe.slice(0, PE_POSITIONS)} rowLabels={pe.slice(0, PE_POSITIONS).map((_, i) => i)} max={1}
                     activeRow={sel} label="위치 인코딩 행렬" />
          </div>
          <div className="col-12 col-lg-6">
            <Heatmap rows={peSimilarity} rowLabels={peSimilarity.map((_, i) => i)} max={1} label="위치끼리의 코사인 유사도" />
          </div>
        </div>
      </Stage>

      {ids.length > 0 && (
        <Stage step="5" title={`입력 벡터 = 임베딩 + 위치 — ${sel + 1}번째 토큰 '${VOCAB.list[ids[sel]]}'`}
               desc="1단계에서 토큰을 고르면 그 토큰의 계산을 보여 준다. 두 벡터를 칸마다 더한 값이 트랜스포머 첫 층의 입력이 된다.">
          <Heatmap rows={[tokenVec, posVec, tokenVec.map((v, j) => v + posVec[j])]}
                   rowLabels={['토큰 임베딩', `위치 ${sel} 인코딩`, '= 입력 벡터']}
                   colLabels={tokenVec.map((_, j) => j)} max={2} label="임베딩과 위치 인코딩의 합" />
          <p className="small text-body-secondary mt-2 mb-0">
            문장 전체로는 토큰 {ids.length}개 × 차원 {dim}의 행렬이 되고, 다음 단계(셀프 어텐션)는 이 행렬을 받는다.
          </p>
        </Stage>
      )}
    </LlmPage>
  )
}
