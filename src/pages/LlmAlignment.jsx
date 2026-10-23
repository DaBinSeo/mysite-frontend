import { useMemo, useState } from 'react'
import { Bars, LineChart, LlmPage } from '../components/LlmViz.jsx'
import { StageCard } from '../components/VizStage.jsx'
import { ALIGN_SAMPLE, fitRewardModel, klDivergence, pct, rlhfOptimal, trainDpo } from '../utils/llmModel.js'

const LETTERS = ['A', 'B', 'C', 'D']
const BETAS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
const DPO_STEPS = 200
const DPO_LR = 1

const TERMS = {
  1: [
    ['선호 데이터', '같은 질문에 대한 두 답 중 사람이 더 나은 쪽을 고른 기록. 점수를 매기는 것보다 둘 중 하나를 고르는 편이 사람마다 덜 엇갈린다.'],
    ['정렬 (Alignment)', '모델이 도움이 되고(helpful), 정직하고(honest), 해롭지 않게(harmless) 답하도록 사람의 선호에 맞추는 것.'],
  ],
  2: [
    ['보상 모델 (Reward model)', '답을 받아 점수 하나를 내는 모델. 사람의 비교 결과를 잘 설명하도록 학습한다. 실제로는 LLM에 점수 출력층을 붙여 만든다.'],
    ['Bradley-Terry 모델', 'A가 B보다 선호될 확률을 σ(r_A − r_B)로 보는 모델. 점수 차가 클수록 확실히 이긴다.'],
  ],
  3: [
    ['RLHF', 'Reinforcement Learning from Human Feedback. 보상 모델 점수를 높이도록 강화학습(주로 PPO)으로 모델을 고친다.'],
    ['KL 페널티 (β)', '원래 모델(기준 정책)에서 너무 멀어지지 않게 하는 벌점. β가 작으면 보상만 쫓다가 보상 모델의 허점을 파고드는 "보상 해킹"이 생기고, 크면 거의 바뀌지 않는다.'],
    ['기준 정책 (Reference)', '정렬을 시작하기 전 SFT 모델. 정렬 중에는 고정해 두고 비교 기준으로만 쓴다.'],
  ],
  4: [
    ['DPO', 'Direct Preference Optimization. 보상 모델과 강화학습 없이, 선호 쌍에서 바로 "이긴 답의 확률 비율은 올리고 진 답은 내리는" 손실로 학습한다. 단순하고 안정적이라 널리 쓰인다.'],
    ['암묵적 보상', 'DPO 모델 안에 숨어 있는 보상 β·ln(π/π_ref). 기준보다 확률이 오른 답일수록 보상이 크다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

function AnswerLabel({ i }) {
  return <><strong>{LETTERS[i]}</strong> {ALIGN_SAMPLE.answers[i]}</>
}

// 6. 선호 정렬 (로그인 불필요). 답 4개짜리 질문 하나로 보상 모델·RLHF·DPO를 계산한다
export default function LlmAlignment() {
  const [betaIndex, setBetaIndex] = useState(3)
  const [dpoBeta, setDpoBeta] = useState(0.5)
  const [dpoStep, setDpoStep] = useState(DPO_STEPS)

  const { answers, comparisons, reference } = ALIGN_SAMPLE
  const rm = useMemo(() => fitRewardModel(answers.length, comparisons), [answers.length, comparisons])
  const beta = BETAS[betaIndex]
  const optimal = rlhfOptimal(reference, rm.rewards, beta)
  const expected = (p) => p.reduce((s, pi, i) => s + pi * rm.rewards[i], 0)
  const dpo = useMemo(() => trainDpo(reference, comparisons, { beta: dpoBeta, steps: DPO_STEPS, lr: DPO_LR }), [reference, comparisons, dpoBeta])
  const cur = dpo[dpoStep]

  // 답마다 이긴 횟수·진 횟수
  const record = answers.map((_, i) => ({
    win: comparisons.filter(([w]) => w === i).length,
    lose: comparisons.filter(([, l]) => l === i).length,
  }))

  return (
    <LlmPage path="/llm/alignment"
             intro="SFT 모델은 답하는 형식은 알지만 어떤 답이 더 좋은지는 모릅니다. 사람이 두 답을 비교한 데이터로, 좋은 답의 확률은 높이고 나쁜 답의 확률은 낮춥니다. 질문 하나와 답 네 개로 보상 모델, RLHF, DPO를 계산해 봅니다.">
      <Stage step="1" title={`선호 데이터 — 비교 ${comparisons.length}건`}
             desc="질문 하나에 SFT 모델이 낸 답 네 개를 두 개씩 짝지어 사람에게 보여 주고 더 나은 쪽을 고르게 했다. 사람마다 판단이 달라 서로 어긋난 표(B > A)도 섞여 있다.">
        <div className="border rounded p-2 small mb-2"><strong>질문</strong> {ALIGN_SAMPLE.prompt}</div>
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-2">
            <thead>
              <tr><th scope="col">답</th><th scope="col" className="text-end">이김</th><th scope="col" className="text-end">짐</th><th scope="col" className="text-end">SFT 모델 확률</th></tr>
            </thead>
            <tbody>
              {answers.map((_, i) => (
                <tr key={i}>
                  <td><AnswerLabel i={i} /></td>
                  <td className="text-end font-monospace">{record[i].win}</td>
                  <td className="text-end font-monospace">{record[i].lose}</td>
                  <td className="text-end font-monospace">{pct(reference[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex flex-wrap gap-1 small">
          {comparisons.map(([w, l], i) => (
            <span key={i} className="border rounded px-2 bg-body-tertiary">
              <span className="text-success fw-bold">{LETTERS[w]}</span> &gt; <span className="text-danger">{LETTERS[l]}</span>
            </span>
          ))}
        </div>
      </Stage>

      <Stage step="2" title={`보상 모델 학습 — 비교 ${pct(rm.accuracy)} 일치`}
             desc="답마다 점수 r을 두고, 사람이 고른 쪽이 σ(r_이긴답 − r_진답)의 확률로 이기도록 경사 하강법으로 맞췄다. 어긋난 표 때문에 모든 비교를 맞히지는 못한다.">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <Bars items={answers.map((_, i) => ({ key: i, label: `${LETTERS[i]} ${answers[i]}`, value: rm.rewards[i], tone: rm.rewards[i] >= 0 ? 'success' : 'danger' }))}
                  format={(v) => v.toFixed(2)} />
          </div>
          <div className="col-12 col-md-6">
            <LineChart label="보상 모델 손실" xMax={rm.losses.length} yMax={1}
                       series={[{ label: '보상 모델 손실 (−ln σ)', color: '#6f42c1', points: rm.losses }]} />
          </div>
        </div>
      </Stage>

      <Stage step="3" title={`RLHF — β = ${beta}`}
             desc="보상은 높이되 기준(SFT) 모델과의 차이(KL)에는 β만큼 벌점을 준다. 이 목표의 최적 정책은 π*(답) ∝ π_ref(답)·exp(r/β)이다. 실제로는 PPO로 조금씩 이 방향으로 학습한다. β를 줄여 보면 보상이 가장 높은 답 하나로 쏠린다.">
        <label className="form-label small mb-1" htmlFor="al-beta">KL 페널티 β: {beta}</label>
        <input id="al-beta" type="range" className="form-range mb-2" min="0" max={BETAS.length - 1}
               value={betaIndex} onChange={(e) => setBetaIndex(Number(e.target.value))} />
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-2">
            <thead>
              <tr><th scope="col">답</th><th scope="col" style={{ width: '30%' }}>SFT 모델 (기준)</th><th scope="col" style={{ width: '30%' }}>RLHF 후</th></tr>
            </thead>
            <tbody>
              {answers.map((_, i) => (
                <tr key={i}>
                  <td><strong>{LETTERS[i]}</strong> <span className="text-body-secondary">r = {rm.rewards[i].toFixed(2)}</span></td>
                  <td><Bars items={[{ key: 'ref', value: reference[i] }]} max={1} /></td>
                  <td><Bars items={[{ key: 'opt', value: optimal[i], tone: optimal[i] > reference[i] ? 'success' : 'danger' }]} max={1} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small">
          평균 보상 <strong>{expected(reference).toFixed(2)}</strong> → <strong>{expected(optimal).toFixed(2)}</strong>
          {' '}· KL(π* ‖ π_ref) = <strong>{klDivergence(optimal, reference).toFixed(3)}</strong>
        </div>
      </Stage>

      <Stage step="4" title={`DPO — 스텝 ${dpoStep}, 손실 ${cur.loss.toFixed(3)}`}
             desc="보상 모델 없이 비교 쌍에서 바로 학습한다. 손실은 −ln σ(β·[(ln π(이긴답) − ln π_ref(이긴답)) − (ln π(진답) − ln π_ref(진답))])이다. 스텝을 움직이면 확률이 어떻게 옮겨 가는지 보인다.">
        <div className="row g-3 align-items-end mb-2">
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="al-dpo-beta">β: {dpoBeta}</label>
            <input id="al-dpo-beta" type="range" className="form-range" min="0.1" max="2" step="0.1"
                   value={dpoBeta} onChange={(e) => setDpoBeta(Number(e.target.value))} />
          </div>
          <div className="col-6">
            <label className="form-label small mb-1" htmlFor="al-dpo-step">학습 스텝: {dpoStep}</label>
            <input id="al-dpo-step" type="range" className="form-range" min="0" max={DPO_STEPS}
                   value={dpoStep} onChange={(e) => setDpoStep(Number(e.target.value))} />
          </div>
        </div>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">답별 확률 (괄호: 암묵적 보상 β·ln π/π_ref)</div>
            <Bars items={answers.map((_, i) => ({
              key: i,
              label: `${LETTERS[i]} (${(dpoBeta * Math.log(cur.probs[i] / reference[i])).toFixed(2)})`,
              value: cur.probs[i],
              tone: cur.probs[i] > reference[i] ? 'success' : cur.probs[i] < reference[i] ? 'danger' : undefined,
            }))} max={1} />
          </div>
          <div className="col-12 col-md-6">
            <LineChart label="DPO 손실 곡선" xMax={DPO_STEPS} yMax={1} marker={dpoStep}
                       series={[{ label: 'DPO 손실 (세로선: 현재 스텝)', color: '#0b5ed7', points: dpo.map((h) => h.loss) }]} />
          </div>
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          RLHF는 보상 모델 학습 → 강화학습의 두 단계와 생성·채점을 반복해야 해서 무겁고, DPO는 일반 미세 조정처럼 한 번에 학습한다. 둘 다 기준 모델에서 너무 멀어지지 않도록 β로 묶는다.
        </p>
      </Stage>
    </LlmPage>
  )
}
