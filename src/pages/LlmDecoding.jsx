import { useState } from 'react'
import { Bars, LlmPage, WordChip } from '../components/LlmViz.jsx'
import { StageCard, Terms } from '../components/VizStage.jsx'
import {
  BOS, VOCAB, detokenize, filterTopKTopP, generate, getPretrainedModel, makeRng, nextProbs,
} from '../utils/llmModel.js'

const PROMPT_MAX_LENGTH = 40
const TOP_N = 12
const SAMPLE_COUNT = 5
const KV_MAX = 12

const TERMS = {
  settings: [
    ['Temperature', 'logits를 이 값으로 나눈 뒤 softmax한다. 1보다 작으면 높은 확률 쪽으로 더 쏠리고(보수적), 크면 고르게 퍼진다(다양·엉뚱).'],
    ['top-k', '확률 상위 k개 토큰만 후보로 남긴다. 0이면 끈다.'],
    ['top-p (nucleus)', '확률이 높은 순으로 더해 누적 확률이 p에 닿을 때까지만 남긴다. 분포가 뾰족하면 후보가 적고, 퍼져 있으면 많아진다.'],
  ],
  1: [
    ['자기회귀 생성', '토큰 하나를 고르면 입력 끝에 붙이고 다시 다음 토큰을 예측하는 것을 반복한다. 그래서 답이 길수록 시간이 오래 걸린다.'],
  ],
  4: [
    ['Greedy', '매번 가장 확률 높은 토큰을 고른다. 결과가 늘 같고, 같은 말을 되풀이하기 쉽다.'],
    ['샘플링', '확률에 비례해 무작위로 고른다. 같은 프롬프트에도 매번 다른 답이 나온다. 시드를 고정하면 재현할 수 있다.'],
  ],
  5: [
    ['KV 캐시', '이미 처리한 토큰의 Key·Value 벡터를 저장해 두고 다시 계산하지 않는 것. 새 토큰 하나의 Q·K·V만 계산하면 된다.'],
    ['프리필 / 디코드', '프롬프트 전체를 한 번에 처리하는 단계(prefill)와 토큰을 하나씩 만드는 단계(decode). 디코드는 메모리 읽기 속도에 묶인다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// KV 캐시 격자: 행 = 생성 스텝, 열 = 위치. 칸 색으로 새로 계산한 K·V와 캐시에서 읽은 K·V를 나눈다
function KvGrid({ n, cached }) {
  return (
    <table className="llm-grid small mb-1" aria-label={cached ? 'KV 캐시를 쓸 때' : 'KV 캐시가 없을 때'}>
      <tbody>
        {Array.from({ length: n }, (_, step) => (
          <tr key={step}>
            <th scope="row" className="text-end">{step + 1}</th>
            {Array.from({ length: n }, (_, pos) => {
              const used = pos <= step
              const fresh = used && (!cached || pos === step)
              return (
                <td key={pos} style={{ background: fresh ? '#0b5ed7' : used ? 'var(--bs-secondary-bg)' : undefined }}
                    title={fresh ? '새로 계산' : used ? '캐시에서 읽음' : ''}>
                  {/* 색을 구분하기 어려운 사용자를 위한 글자 */}
                  {used && <span className="visually-hidden">{fresh ? '계산' : '캐시'}</span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 8. 추론·디코딩 (로그인 불필요). 4단계와 같은 방식으로 사전 학습한 모델로 생성한다
export default function LlmDecoding() {
  const [prompt, setPrompt] = useState('녹차는')
  const [temperature, setTemperature] = useState(1)
  const [topK, setTopK] = useState(0)
  const [topP, setTopP] = useState(0.9)
  const [seed, setSeed] = useState(1)
  const [kvLen, setKvLen] = useState(8)
  const model = getPretrainedModel()

  const promptIds = [BOS, ...VOCAB.encode(prompt)]
  const base = nextProbs(model, promptIds)
  const scaled = nextProbs(model, promptIds, temperature)
  const filtered = filterTopKTopP(scaled, topK, topP)
  const order = Array.from(base.keys()).sort((a, b) => base[b] - base[a]).slice(0, TOP_N)
  const keptCount = filtered.kept.filter(Boolean).length
  const greedy = generate(model, promptIds, { maxLen: 15 })
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => generate(model, promptIds, {
    temperature, topK, topP, maxLen: 15, rng: makeRng(seed * 100 + i),
  }))
  const withoutCache = (kvLen * (kvLen + 1)) / 2

  return (
    <LlmPage path="/llm/decoding"
             intro="모델이 내놓는 것은 다음 토큰의 확률 분포입니다. 여기서 실제 토큰 하나를 고르는 규칙(디코딩)에 따라 같은 모델도 답이 달라집니다. 확률 분포를 바꾸는 손잡이와, 생성을 빠르게 하는 KV 캐시를 살펴봅니다.">
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1" htmlFor="dec-prompt">프롬프트</label>
            <input id="dec-prompt" className="form-control form-control-sm" value={prompt} maxLength={PROMPT_MAX_LENGTH}
                   onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <div className="col-4 col-md">
            <label className="form-label small mb-1" htmlFor="dec-temp">Temperature: {temperature}</label>
            <input id="dec-temp" type="range" className="form-range" min="0.1" max="2" step="0.1"
                   value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </div>
          <div className="col-4 col-md">
            <label className="form-label small mb-1" htmlFor="dec-topk">top-k: {topK || '끔'}</label>
            <input id="dec-topk" type="range" className="form-range" min="0" max="20"
                   value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
          </div>
          <div className="col-4 col-md">
            <label className="form-label small mb-1" htmlFor="dec-topp">top-p: {topP}</label>
            <input id="dec-topp" type="range" className="form-range" min="0.05" max="1" step="0.05"
                   value={topP} onChange={(e) => setTopP(Number(e.target.value))} />
          </div>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS.settings} />
        </div>
      </div>

      <Stage step="1" title="모델이 낸 다음 토큰 분포"
             desc={`'${prompt}' 다음에 올 토큰의 확률(temperature 1)을 높은 순으로 ${TOP_N}개 보여 준다. 어휘 ${VOCAB.size}개 전체에 확률이 있고 합은 1이다.`}>
        <Bars items={order.map((id) => ({ key: id, label: VOCAB.list[id], value: base[id] }))} max={1} />
      </Stage>

      <Stage step="2" title={`Temperature ${temperature} 적용`}
             desc="logits를 temperature로 나눈 뒤 다시 softmax했다. 값을 낮추면 1등 확률이 커지고, 높이면 아래쪽 토큰에도 기회가 생긴다.">
        <Bars items={order.map((id) => ({ key: id, label: VOCAB.list[id], value: scaled[id] }))} max={1} />
      </Stage>

      <Stage step="3" title={`top-k·top-p 거르기 — 후보 ${keptCount}개`}
             desc="걸러진 토큰(취소선)은 확률이 0이 되고, 남은 후보끼리 합이 1이 되도록 다시 나눈다. 샘플링은 이 분포에서 한다.">
        <Bars items={order.map((id) => ({
          key: id, label: VOCAB.list[id], value: filtered.probs[id], tone: filtered.kept[id] ? undefined : 'muted',
        }))} max={1} />
      </Stage>

      <Stage step="4" title="문장 생성"
             desc="고른 토큰을 프롬프트 뒤에 붙이고 다시 예측하기를 <eos>가 나올 때까지 반복했다. 칩에 마우스를 올리면 그 토큰을 고를 때의 확률이 보인다.">
        <div className="small fw-bold mb-1">Greedy (늘 같은 결과)</div>
        <div className="border rounded p-2 small mb-3 bg-body-tertiary">
          {prompt} <strong>{detokenize(greedy.map((t) => t.id))}</strong>
        </div>
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="small fw-bold">샘플링 {SAMPLE_COUNT}번 (위 설정 적용)</span>
          <button type="button" className="btn btn-outline-secondary btn-sm ms-auto" onClick={() => setSeed((s) => s + 1)}>다시 뽑기</button>
        </div>
        <ol className="small mb-0">
          {samples.map((s, i) => (
            <li key={i} className="mb-1">
              {prompt} <strong>{detokenize(s.map((t) => t.id))}</strong>
              <div className="d-flex flex-wrap gap-1 mt-1">
                {s.map((t, j) => <WordChip key={j} id={t.id} title={`p = ${t.prob.toFixed(3)}`}
                                           style={{ background: `rgba(11,94,215,${(t.prob * 0.5).toFixed(3)})` }} />)}
              </div>
            </li>
          ))}
        </ol>
      </Stage>

      <Stage step="5" title={`KV 캐시 — 토큰 ${kvLen}개 생성 시 K·V 계산 ${withoutCache}번 → ${kvLen}번`}
             desc="트랜스포머는 새 토큰을 만들 때마다 앞 토큰 전체의 Key·Value가 필요하다. 캐시가 없으면 매 스텝 처음부터 다시 계산하고(파랑), 캐시가 있으면 새 토큰 하나만 계산하고 나머지는 저장해 둔 값(회색)을 읽는다.">
        <label className="form-label small mb-1" htmlFor="dec-kv">생성 토큰 수: {kvLen}</label>
        <input id="dec-kv" type="range" className="form-range mb-2" min="2" max={KV_MAX}
               value={kvLen} onChange={(e) => setKvLen(Number(e.target.value))} />
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">캐시 없음: {withoutCache}번 (토큰 수²에 비례)</div>
            <KvGrid n={kvLen} cached={false} />
            <div className="small text-body-secondary">파랑 = 새로 계산, 회색 = 캐시에서 읽음</div>
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">KV 캐시: {kvLen}번 (토큰 수에 비례)</div>
            <KvGrid n={kvLen} cached />
          </div>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          대신 캐시는 메모리를 쓴다: 층 수 × 2(K·V) × 차원 × 토큰 수 × 숫자 크기. 긴 대화일수록 커져서, 다음 단계(경량화·서빙)에서 메모리를 아끼는 방법이 중요해진다.
        </p>
      </Stage>
    </LlmPage>
  )
}
