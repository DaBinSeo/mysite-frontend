import { useState } from 'react'
import { ChunkBadge, QueryInput, RagPage } from '../components/RagViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { docColor, buildRagPrompt, estimateTokens, generateAnswer, packContext, rerank } from '../utils/ragModel.js'

const PRESETS = [
  '책은 몇 권까지 빌릴 수 있나요?',
  '휴관일에도 책을 반납할 수 있나요?',
  '보존서고 자료는 어떻게 신청하나요?',
  '도서관 카페 메뉴 추천해 줘',
]

const TERMS = {
  1: [
    ['컨텍스트 창 (Context window)', '모델이 한 번에 읽을 수 있는 최대 토큰 수. 근거를 많이 넣을수록 비용과 지연 시간이 늘고, 관련 없는 근거는 오히려 답을 흐린다.'],
    ['Lost in the middle', '긴 프롬프트의 가운데에 있는 내용을 모델이 잘 활용하지 못하는 경향. 중요한 근거를 앞이나 끝에 두면 도움이 된다.'],
  ],
  2: [
    ['시스템 프롬프트', '모델의 역할과 규칙(근거만 사용, 출처 표시, 모르면 모른다고 답하기)을 정하는 지시문. 사용자 질문보다 앞에 둔다.'],
    ['프롬프트 인젝션', '검색된 문서 안에 "이전 지시를 무시하라" 같은 문장이 숨어 있는 공격. 근거는 [자료] 블록 안의 데이터로만 다루도록 지시하고, 수집 단계에서 걸러야 한다.'],
  ],
  3: [
    ['근거 표시 (Citation)', '답변 문장마다 어떤 자료에서 나왔는지 번호를 붙이는 것. 사용자가 확인할 수 있고, 근거 없는 문장(환각)을 찾기도 쉬워진다.'],
    ['답변 거절 (Abstain)', '가장 좋은 근거도 질문과 잘 맞지 않으면 지어내지 않고 모른다고 답하는 것. 기준을 높이면 틀린 답은 줄지만 답할 수 있는 질문도 거절한다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 7. 컨텍스트 구성·답변 생성 (로그인 불필요)
export default function RagGenerate() {
  const [query, setQuery] = useState(PRESETS[0])
  const [k, setK] = useState(4)
  const [budget, setBudget] = useState(300)
  const [order, setOrder] = useState('score')
  const [minScore, setMinScore] = useState(0.4)
  const { q, after } = rerank(query)
  const { packed, dropped, used, base } = packContext(after.slice(0, k), budget, order)
  const prompt = buildRagPrompt(query, packed)
  const result = generateAnswer(q, packed, { minScore })

  return (
    <RagPage path="/rag/generate"
             intro="고른 근거를 정해진 토큰 예산 안에 배치하고, 규칙을 담은 시스템 프롬프트와 함께 언어 모델에 보냅니다. 모델은 근거 문장을 바탕으로 답하고 출처 번호를 붙입니다. 여기서는 생성 모델 대신 근거 문장을 골라 잇는 방식(추출식)으로 흉내 냅니다.">
      <QueryInput value={query} onChange={setQuery} presets={PRESETS} />

      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="gen-k">근거 후보 수: {k}</label>
            <input id="gen-k" type="range" className="form-range" min="1" max="6" value={k} onChange={(e) => setK(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="gen-budget">토큰 예산: {budget}</label>
            <input id="gen-budget" type="range" className="form-range" min="100" max="500" step="10" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="gen-order">배치 순서</label>
            <select id="gen-order" className="form-select form-select-sm" value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="score">점수 높은 순</option>
              <option value="edges">중요한 것을 앞·뒤 끝에</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="gen-min">답변 최소 근거 점수: {minScore}</label>
            <input id="gen-min" type="range" className="form-range" min="0" max="0.9" step="0.05" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <Stage step="1" title={`근거 배치 — ${used} / ${budget} 토큰`}
             desc="6단계 리랭커 순서대로 근거를 넣다가 예산을 넘으면 뺀다. 토큰 수는 글자 수 ÷ 1.5로 어림했다(지시문·질문 몫 포함).">
        <div className="rag-budget mb-2" role="img" aria-label={`토큰 예산 ${budget} 중 ${used} 사용`}>
          <span style={{ width: `${(base / budget) * 100}%` }} className="bg-secondary" title={`지시문·질문 ${base}토큰`} />
          {packed.map((it) => (
            <span key={it.chunk.id} style={{ width: `${((estimateTokens(it.chunk.text) + 8) / budget) * 100}%`, background: docColor(it.chunk.docId) }}
                  title={`${it.chunk.id} ${estimateTokens(it.chunk.text) + 8}토큰`} />
          ))}
        </div>
        <div className="small">
          <div className="mb-1">
            <span className="badge text-bg-secondary me-1">지시문·질문 {base}</span>
            {packed.map((it, i) => (
              <span key={it.chunk.id} className="me-2 text-nowrap">[{i + 1}] <ChunkBadge chunk={it.chunk} /> {estimateTokens(it.chunk.text) + 8}</span>
            ))}
          </div>
          {dropped.length > 0 && (
            <div className="text-body-secondary">
              예산 초과로 뺌: {dropped.map((it) => <ChunkBadge key={it.chunk.id} chunk={it.chunk} className="me-1 opacity-50" />)}
            </div>
          )}
        </div>
      </Stage>

      <Stage step="2" title={`프롬프트 — 약 ${estimateTokens(prompt)}토큰`}
             desc="시스템 지시문, 번호를 붙인 근거(제목·수정일 포함), 사용자 질문 순서로 이어 붙인다. 이 글 전체가 언어 모델의 입력이다.">
        <pre className="rag-doc border rounded p-2 mb-0 bg-body-tertiary">{prompt}</pre>
      </Stage>

      <Stage step="3" title={result.refused ? '답변 — 근거 부족으로 거절' : `답변 — 문장 ${result.sentences.length}개`}
             desc={`가장 좋은 근거의 리랭커 점수(${result.top.toFixed(2)})가 기준(${minScore}) 이상이면, 근거 문장 중 질문의 핵심어를 많이 담은 문장을 골라 출처 번호를 붙인다. 기준 미만이면 답하지 않는다.`}>
        {result.refused ? (
          <div className="alert alert-warning small mb-0">
            자료에서 찾지 못했습니다. <span className="text-body-secondary">— 검색된 자료가 질문과 잘 맞지 않아 지어내지 않았습니다.
            {q.concepts.includes('서고') && ' 보존서고 지침은 직원용 문서라 일반 이용자 검색에서 빠졌습니다. 권한에 따른 차이는 9단계에서 봅니다.'}</span>
          </div>
        ) : (
          <>
            <div className="border rounded p-2 small bg-body-tertiary mb-2">
              {result.sentences.map((s, i) => (
                <span key={i}>{s.text} <sup className="badge text-bg-dark">{s.source}</sup>{' '}</span>
              ))}
            </div>
            <ul className="list-unstyled small mb-0">
              {[...new Set(result.sentences.map((s) => s.source))].map((n) => {
                const it = packed[n - 1]
                return (
                  <li key={n} className="text-body-secondary">
                    <span className="badge text-bg-dark me-1">{n}</span>{it.chunk.title} · {it.chunk.updated} · <ChunkBadge chunk={it.chunk} />
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Stage>
    </RagPage>
  )
}
