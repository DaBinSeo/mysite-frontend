import { useMemo, useState } from 'react'
import { Bars, Heatmap, LlmPage } from '../components/LlmViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { VOCAB, pct, positionalEncoding, randomEmbeddings, selfAttention } from '../utils/llmModel.js'

const INPUT_MAX_LENGTH = 60
const MAX_TOKENS = 10
const DIM = 16
const HEADS = [1, 2, 4]
const SAMPLE = '녹차는 너무 뜨거운 물에 우리면 쓴맛이 강해진다.'

const TERMS = {
  1: [
    ['X (입력 행렬)', '토큰 수 × 차원 크기의 행렬. 앞 단계에서 만든 임베딩 + 위치 인코딩이다.'],
  ],
  2: [
    ['Query (Q)', '"나는 어떤 정보가 필요한가"를 나타내는 벡터. X에 가중치 W_Q를 곱해 만든다.'],
    ['Key (K)', '"나는 이런 정보를 갖고 있다"를 나타내는 벡터. Q와 내적해 관련도를 잰다.'],
    ['Value (V)', '실제로 전달할 내용. 관련도(가중치)만큼 섞여 출력이 된다.'],
  ],
  3: [
    ['어텐션 점수', 'Q·Kᵀ / √d_head. 내적이 클수록 관련이 깊다. √d_head로 나누는 것은 차원이 커져도 값이 너무 커지지 않게 하려는 것이다.'],
    ['인과 마스크 (Causal mask)', '다음 토큰을 맞혀야 하므로 뒤 토큰은 보면 안 된다. 대각선 위쪽 점수를 −∞로 바꿔 softmax 뒤 0이 되게 한다.'],
    ['softmax', '행마다 점수를 0~1 사이 확률로 바꾸고 합이 1이 되게 한다. 이것이 어텐션 가중치다.'],
  ],
  4: [
    ['출력', '어텐션 가중치로 V 행들을 가중합한 벡터. 앞 토큰들의 정보가 섞인 "문맥을 반영한" 표현이 된다.'],
  ],
  5: [
    ['멀티헤드 어텐션', '차원을 헤드 수만큼 나눠 어텐션을 따로 계산하고 결과를 이어 붙인다. 헤드마다 문법·지시어·가까운 단어 등 서로 다른 관계를 본다.'],
  ],
  6: [
    ['잔차 연결 (Residual)', '층의 입력을 출력에 그대로 더하는 지름길. 층이 깊어져도 학습이 잘 되게 한다.'],
    ['층 정규화 (LayerNorm)', '벡터의 평균·분산을 맞춰 값이 폭주하지 않게 한다. 최근 모델은 RMSNorm을 많이 쓴다.'],
    ['FFN', '토큰마다 따로 적용하는 2층 신경망(보통 차원의 4배로 넓혔다 줄임). 모델 매개변수의 약 2/3가 여기 있다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 트랜스포머 블록 매개변수 수: 층마다 어텐션 4d² + FFN 8d²(4배 확장), 임베딩 V·d (출력층과 공유)
function paramEstimate(layers, d, vocab) {
  return { embed: vocab * d, perLayer: 12 * d * d, total: vocab * d + layers * 12 * d * d }
}

const fmtCount = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString())

// 3. 트랜스포머·셀프 어텐션 (로그인 불필요)
export default function LlmAttention() {
  const [input, setInput] = useState(SAMPLE)
  const [heads, setHeads] = useState(2)
  const [head, setHead] = useState(0)
  const [seed, setSeed] = useState(7)
  const [causal, setCausal] = useState(true)
  const [query, setQuery] = useState(null)
  const [layers, setLayers] = useState(32)
  const [dModel, setDModel] = useState(4096)

  const ids = useMemo(() => VOCAB.encode(input).slice(0, MAX_TOKENS), [input])
  const table = useMemo(() => randomEmbeddings(DIM, seed), [seed])
  const X = useMemo(() => {
    const pe = positionalEncoding(ids.length, DIM)
    return ids.map((id, i) => table[id].map((v, j) => v + pe[i][j] * 0.5))
  }, [ids, table])
  const result = useMemo(() => (X.length ? selfAttention(X, { heads, seed: seed * 31 + heads, causal }) : []), [X, heads, seed, causal])

  const labels = ids.map((id) => VOCAB.list[id])
  const h = Math.min(head, heads - 1)
  const cur = result[h]
  const q = Math.min(query ?? ids.length - 1, ids.length - 1)
  const headDim = DIM / heads
  const est = paramEstimate(layers, dModel, 128000)

  return (
    <LlmPage path="/llm/attention"
             intro="트랜스포머의 핵심은 셀프 어텐션입니다. 각 토큰이 앞 토큰들을 얼마나 참고할지 가중치를 계산해 정보를 섞습니다. 가중치는 학습 전 무작위 값이라 패턴은 의미가 없지만, 계산 순서는 실제 모델과 같습니다.">
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-12 col-md">
            <label className="form-label small mb-1" htmlFor="att-input">문장 (최대 {MAX_TOKENS}토큰)</label>
            <input id="att-input" className="form-control form-control-sm" value={input} maxLength={INPUT_MAX_LENGTH}
                   onChange={(e) => setInput(e.target.value)} />
          </div>
          <div className="col-6 col-md-auto">
            <label className="form-label small mb-1" htmlFor="att-heads">헤드 수</label>
            <select id="att-heads" className="form-select form-select-sm" value={heads}
                    onChange={(e) => { setHeads(Number(e.target.value)); setHead(0) }}>
              {HEADS.map((n) => <option key={n} value={n}>{n}개 (헤드당 {DIM / n}차원)</option>)}
            </select>
          </div>
          <div className="col-6 col-md-auto">
            <div className="form-check mb-1">
              <input id="att-causal" type="checkbox" className="form-check-input" checked={causal} onChange={(e) => setCausal(e.target.checked)} />
              <label className="form-check-label small" htmlFor="att-causal">인과 마스크</label>
            </div>
          </div>
          <div className="col-12 col-md-auto">
            <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={() => setSeed((s) => s + 1)}>
              가중치 다시 뽑기
            </button>
          </div>
        </div>
      </div>

      {!cur && <p className="text-center text-body-secondary py-5">문장을 입력해 보세요.</p>}

      {cur && (
        <>
          <Stage step="1" title={`입력 X — 토큰 ${ids.length} × 차원 ${DIM}`}
                 desc="앞 단계(임베딩 + 위치 인코딩)에서 만든 행렬이다. 행 하나가 토큰 하나다.">
            <Heatmap rows={X} rowLabels={labels} label="입력 행렬 X" />
          </Stage>

          <Stage step="2" title={`Q·K·V 만들기 — 헤드 ${h + 1} (헤드당 ${headDim}차원)`}
                 desc={`X에 서로 다른 가중치 행렬 W_Q·W_K·W_V(${DIM} × ${headDim})를 곱해 토큰마다 Query·Key·Value 벡터를 만든다.`}>
            {heads > 1 && (
              <div className="btn-group btn-group-sm mb-2" role="group" aria-label="헤드 선택">
                {result.map((_, i) => (
                  <button key={i} type="button" className={`btn ${i === h ? 'btn-dark' : 'btn-outline-dark'}`}
                          aria-pressed={i === h} onClick={() => setHead(i)}>헤드 {i + 1}</button>
                ))}
              </div>
            )}
            <div className="row g-3">
              {[['Q (Query)', cur.Q], ['K (Key)', cur.K], ['V (Value)', cur.V]].map(([name, M]) => (
                <div key={name} className="col-12 col-md-4">
                  <div className="small fw-bold mb-1">{name}</div>
                  <Heatmap rows={M} rowLabels={labels} label={name} />
                </div>
              ))}
            </div>
          </Stage>

          <Stage step="3" title="점수 → 마스크 → softmax"
                 desc="행은 질문하는 토큰(Query), 열은 참고 대상 토큰(Key)이다. 점수를 √d_head로 나누고, 인과 마스크로 뒤 토큰을 가린 뒤, 행마다 softmax해 가중치를 얻는다. 아래 버튼으로 Query 토큰을 고르면 그 토큰의 계산을 4단계에서 보여 준다.">
            <div className="row g-3">
              <div className="col-12 col-xl-6">
                <div className="small fw-bold mb-1">① 점수 Q·Kᵀ/√{headDim}</div>
                <Heatmap rows={cur.scores} rowLabels={labels} colLabels={labels} showValues digits={1} activeRow={q} label="어텐션 점수" />
              </div>
              <div className="col-12 col-xl-6">
                <div className="small fw-bold mb-1">② 마스크 + softmax = 어텐션 가중치</div>
                <Heatmap rows={cur.weights.map((row, i) => row.map((w, j) => (causal && j > i ? -Infinity : w)))}
                         rowLabels={labels} colLabels={labels} sequential max={1} showValues activeRow={q} label="어텐션 가중치" />
              </div>
            </div>
            <div className="d-flex flex-wrap gap-1 mt-2 small align-items-center">
              <span className="text-body-secondary me-1">Query 토큰 선택:</span>
              {labels.map((w, i) => (
                <button key={i} type="button" className={`btn btn-sm ${i === q ? 'btn-dark' : 'btn-outline-secondary'}`}
                        aria-pressed={i === q} onClick={() => setQuery(i)}>{w}</button>
              ))}
            </div>
          </Stage>

          <Stage step="4" title={`'${labels[q]}'의 출력 = 가중치 × V`}
                 desc={causal ? `${q + 1}번째 토큰은 자기 자신과 앞 토큰 ${q}개만 볼 수 있다. 가중치가 큰 토큰의 Value가 출력에 많이 섞인다.` : '마스크를 끄면 뒤 토큰도 볼 수 있다(BERT 같은 인코더 방식). 다음 토큰 예측에서는 답을 미리 보는 셈이라 쓸 수 없다.'}>
            <div className="row g-3">
              <div className="col-12 col-md-5">
                <Bars items={labels.map((w, j) => ({
                  key: j, label: w, value: cur.weights[q][j], tone: causal && j > q ? 'muted' : undefined,
                }))} max={1} format={pct} />
              </div>
              <div className="col-12 col-md-7">
                <Heatmap rows={[...cur.V.map((v, j) => v.map((x) => x * cur.weights[q][j])), cur.out[q]]}
                         rowLabels={[...labels.map((w, j) => `${pct(cur.weights[q][j])} × V(${w})`), '= 출력']}
                         activeRow={labels.length} label="가중치를 곱한 Value와 출력 벡터" />
              </div>
            </div>
          </Stage>

          <Stage step="5" title={`멀티헤드 — 헤드 ${heads}개의 가중치`}
                 desc="헤드마다 W_Q·W_K·W_V가 달라 보는 관계도 다르다. 학습된 모델에서는 바로 앞 단어만 보는 헤드, 문장 첫 토큰을 보는 헤드, 주어를 찾는 헤드 등이 생긴다. 헤드 출력은 이어 붙인 뒤 W_O를 곱해 다시 차원으로 맞춘다.">
            <div className="row g-3">
              {result.map((r, i) => (
                <div key={i} className="col-12 col-md-6 col-xl-3">
                  <div className="small fw-bold mb-1">헤드 {i + 1}</div>
                  <Heatmap rows={r.weights.map((row, a) => row.map((w, b) => (causal && b > a ? -Infinity : w)))}
                           rowLabels={labels} sequential max={1} label={`헤드 ${i + 1} 어텐션 가중치`} />
                </div>
              ))}
            </div>
          </Stage>
        </>
      )}

      <Stage step="6" title="트랜스포머 블록을 쌓아 모델 만들기"
             desc="블록 하나는 [정규화 → 셀프 어텐션 → 잔차 더하기 → 정규화 → FFN → 잔차 더하기]이다. 이 블록을 수십 층 쌓고, 마지막 벡터에 어휘 크기의 출력층을 곱하면 다음 토큰의 점수(logits)가 나온다.">
        <div className="d-flex flex-wrap align-items-center gap-2 small mb-3" aria-label="트랜스포머 계산 순서">
          {['입력 벡터', '[ LayerNorm → 어텐션 → + 잔차 → LayerNorm → FFN → + 잔차 ] × N층', '최종 LayerNorm', '출력층 (어휘 크기)', 'softmax → 다음 토큰 확률'].map((s, i) => (
            <div key={s} className="d-flex align-items-center gap-2">
              {i > 0 && <span className="text-body-tertiary" aria-hidden="true">→</span>}
              <span className={`border rounded px-2 py-1 ${i === 1 ? 'border-dark fw-bold' : 'bg-body-tertiary'}`}>{s}</span>
            </div>
          ))}
        </div>
        <div className="row g-3 align-items-end">
          <div className="col-6 col-md-4">
            <label className="form-label small mb-1" htmlFor="att-layers">층 수: {layers}</label>
            <input id="att-layers" type="range" className="form-range" min="2" max="96" step="2"
                   value={layers} onChange={(e) => setLayers(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md-4">
            <label className="form-label small mb-1" htmlFor="att-dmodel">차원: {dModel.toLocaleString()}</label>
            <input id="att-dmodel" type="range" className="form-range" min="512" max="12288" step="512"
                   value={dModel} onChange={(e) => setDModel(Number(e.target.value))} />
          </div>
          <div className="col-12 col-md-4 small">
            <div>임베딩 128,000 × {dModel.toLocaleString()} = {fmtCount(est.embed)}</div>
            <div>층당 12 × {dModel.toLocaleString()}² = {fmtCount(est.perLayer)}</div>
            <div className="fw-bold">전체 약 {fmtCount(est.total)} 매개변수</div>
          </div>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          층당 매개변수는 어텐션 4d²(W_Q·W_K·W_V·W_O)와 FFN 8d²(d → 4d → d)를 더한 근사값이다. 32층·4,096차원이면 약 7B(70억) 규모가 된다.
        </p>
      </Stage>
    </LlmPage>
  )
}
