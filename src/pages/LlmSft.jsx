import { useDeferredValue, useMemo, useState } from 'react'
import { LineChart, LlmPage, WordChip } from '../components/LlmViz.jsx'
import { StageCard, Terms } from '../components/VizStage.jsx'
import {
  ASSISTANT, BOS, SFT_SAMPLES, USER, VOCAB,
  chatSequence, cloneModel, detokenize, evaluate, generate, getPretrainedModel, makeExamples, tokenLosses, trainStep, pct,
} from '../utils/llmModel.js'

const QUESTION_MAX_LENGTH = 40

const TERMS = {
  settings: [
    ['미세 조정 학습률', '사전 학습보다 작게 잡는다. 너무 크면 사전 학습에서 배운 지식을 잊는다(파국적 망각).'],
    ['손실 마스크', '켜면 답변 토큰에서만 손실을 계산한다. 끄면 질문까지 외우려 해 학습 신호가 낭비된다.'],
  ],
  1: [
    ['SFT', 'Supervised Fine-Tuning(지도 미세 조정). 사람이 쓴 질문–모범 답변 쌍으로 기반 모델을 추가 학습한다. 보통 수만~수십만 쌍이면 된다.'],
    ['지시 데이터 (Instruction data)', '"~해 줘" 같은 요청과 그에 맞는 답. 요약·번역·코딩·대화 등 원하는 행동을 골고루 담는다.'],
  ],
  2: [
    ['채팅 템플릿', '<|user|>·<|assistant|> 같은 특수 토큰으로 역할을 구분해 대화를 한 줄의 토큰열로 만드는 형식. 학습과 추론에서 같은 템플릿을 써야 한다.'],
    ['<|end|>', '답변이 끝났음을 나타내는 토큰. 이것까지 학습해야 모델이 말을 멈출 줄 안다.'],
  ],
  3: [
    ['답변 손실', '답변 토큰에서만 잰 평균 교차 엔트로피. SFT가 진행되면 모범 답변을 높은 확률로 내게 된다.'],
  ],
  4: [
    ['형식 학습', 'SFT가 주로 가르치는 것은 지식이 아니라 "질문을 받으면 답하고 멈춘다"는 형식과 말투다. 지식은 대부분 사전 학습에서 온다.'],
    ['일반화의 한계', '이 작은 모델은 앞 몇 단어만 보므로, 학습하지 않은 질문에는 비슷한 질문의 답을 섞어 내기 쉽다. 큰 모델은 질문 전체의 의미를 보고 새 질문에도 답한다.'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 질문을 채팅 템플릿에 넣고 <|assistant|> 뒤를 모델이 이어 쓰게 한다
function answerOf(model, question) {
  return generate(model, [BOS, USER, ...VOCAB.encode(question), ASSISTANT], { maxLen: 20 })
}

// chips가 false면 문장만 보여 준다 (좁은 표 안)
function Answer({ tokens, chips = true }) {
  const text = detokenize(tokens.map((t) => t.id))
  return (
    <>
      <div>{text || <span className="text-body-secondary">(바로 {VOCAB.list[tokens[0]?.id] ?? '끝'} — 답하지 못함)</span>}</div>
      {chips && (
        <div className="d-flex flex-wrap gap-1 mt-1">
          {tokens.map((t, i) => <WordChip key={i} id={t.id} title={`p = ${t.prob.toFixed(3)}`} />)}
        </div>
      )}
    </>
  )
}

// 5. 지시 미세 조정 (로그인 불필요). 4단계와 같은 방식으로 사전 학습한 모델을 이어서 학습한다
export default function LlmSft() {
  const [steps, setSteps] = useState(40)
  const [lr, setLr] = useState(0.05)
  const [mask, setMask] = useState(true)
  const [selected, setSelected] = useState(0)
  const [question, setQuestion] = useState('녹차는 어디에 보관해?')

  const base = getPretrainedModel()
  const sequences = useMemo(() => SFT_SAMPLES.map(chatSequence), [])
  // 슬라이더를 끄는 동안에는 손잡이부터 움직이고 재학습은 뒤따르게 한다
  const deferredSteps = useDeferredValue(steps)
  const deferredLr = useDeferredValue(lr)
  const deferredMask = useDeferredValue(mask)
  const tuned = useMemo(() => {
    const m = cloneModel(base)
    const seqs = deferredMask ? sequences : sequences.map(({ ids }) => ({ ids }))
    const examples = makeExamples(seqs, m.K)
    const answerExamples = makeExamples(sequences, m.K)
    const losses = []
    for (let s = 0; s < deferredSteps; s++) {
      trainStep(m, examples, deferredLr)
      losses.push(evaluate(m, answerExamples))
    }
    return { model: m, losses }
  }, [base, sequences, deferredSteps, deferredLr, deferredMask])

  const seq = sequences[selected]
  const before = tokenLosses(base, seq.ids)
  const after = tokenLosses(tuned.model, seq.ids)
  const trainCount = seq.train.filter(Boolean).length

  return (
    <LlmPage path="/llm/sft"
             intro="사전 학습만 한 기반 모델은 글을 이어 쓸 줄만 알고 질문에 답할 줄은 모릅니다. 질문–모범 답변 쌍을 채팅 템플릿으로 만들어 추가 학습하면, 질문을 받으면 답하고 멈추는 형식을 배웁니다.">
      <div className="card mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="sft-steps">SFT 스텝: {steps}</label>
            <input id="sft-steps" type="range" className="form-range" min="0" max="80" step="5"
                   value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
          </div>
          <div className="col-6 col-md">
            <label className="form-label small mb-1" htmlFor="sft-lr">학습률: {lr}</label>
            <input id="sft-lr" type="range" className="form-range" min="0.005" max="0.2" step="0.005"
                   value={lr} onChange={(e) => setLr(Number(e.target.value))} />
          </div>
          <div className="col-12 col-md-auto">
            <div className="form-check mb-2">
              <input id="sft-mask" type="checkbox" className="form-check-input" checked={mask} onChange={(e) => setMask(e.target.checked)} />
              <label className="form-check-label small" htmlFor="sft-mask">손실 마스크 (답변만 학습)</label>
            </div>
          </div>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS.settings} />
        </div>
      </div>

      <Stage step="1" title={`지시 데이터 — ${SFT_SAMPLES.length}쌍`}
             desc="사람이 직접 쓰거나 검수한 질문과 모범 답변이다. 사전 학습 데이터(수 조 토큰)에 비하면 아주 적지만, 모델의 답하는 방식을 정한다.">
        <div className="row g-2">
          {SFT_SAMPLES.map((s, i) => (
            <div key={i} className="col-12 col-md-6">
              <button type="button" className={`btn btn-light border w-100 text-start small h-100 ${i === selected ? 'border-dark' : ''}`}
                      aria-pressed={i === selected} onClick={() => setSelected(i)}>
                <div><span className="badge text-bg-secondary me-1">user</span>{s.user}</div>
                <div className="mt-1"><span className="badge text-bg-success me-1">assistant</span>{s.assistant}</div>
              </button>
            </div>
          ))}
        </div>
      </Stage>

      <Stage step="2" title={`채팅 템플릿과 손실 마스크 — ${seq.ids.length}토큰 중 ${trainCount}토큰 학습`}
             desc="대화를 특수 토큰으로 감싸 한 줄로 만든다. 초록 토큰(답변과 <|end|>)에서만 손실을 계산하고, 질문 쪽은 입력으로만 쓴다. 1단계에서 다른 쌍을 고를 수 있다.">
        <div className="d-flex flex-wrap gap-1 mb-2">
          {seq.ids.map((id, i) => (
            <WordChip key={i} id={id} className={seq.train[i] ? 'llm-token-train' : 'llm-token-masked'} />
          ))}
        </div>
        <span className="small"><span className="rag-token llm-token-train">학습</span> <span className="rag-token llm-token-masked">학습 안 함 (입력만)</span></span>
      </Stage>

      <Stage step="3" title={`학습 — 답변 손실 ${tuned.losses.at(-1)?.toFixed(2) ?? evaluate(base, makeExamples(sequences, base.K)).toFixed(2)}`}
             desc="사전 학습 모델의 가중치를 복사해 지시 데이터로 이어서 학습한다. 아래 표는 고른 쌍의 답변 토큰마다 정답 확률이 SFT 전후로 어떻게 바뀌었는지 보여 준다.">
        <div className="row g-3">
          <div className="col-12 col-lg-5">
            <LineChart label="SFT 답변 손실 곡선" xMax={Math.max(deferredSteps, 1)} yMax={6}
                       series={[{ label: '답변 토큰 평균 손실', color: '#146c43', points: tuned.losses }]} />
          </div>
          <div className="col-12 col-lg-7">
            <div className="table-responsive">
              <table className="table table-sm small align-middle mb-0">
                <thead>
                  <tr><th scope="col">정답 토큰</th><th scope="col" className="text-end">SFT 전</th><th scope="col" className="text-end">SFT 후</th></tr>
                </thead>
                <tbody>
                  {after.map((t, i) => seq.train[i + 1] ? (
                    <tr key={i}>
                      <td><WordChip id={t.target} /></td>
                      <td className="text-end font-monospace">{pct(before[i].prob)}</td>
                      <td className={`text-end font-monospace ${t.prob > before[i].prob ? 'text-success fw-bold' : ''}`}>{pct(t.prob)}</td>
                    </tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Stage>

      <Stage step="4" title="학습 전후 답변 비교"
             desc="같은 질문을 채팅 템플릿에 넣고 <|assistant|> 뒤를 이어 쓰게 했다. 기반 모델은 특수 토큰을 본 적이 없어 엉뚱하게 잇거나 바로 끝내고, SFT 모델은 답을 하고 <|end|>로 멈춘다.">
        <div className="table-responsive">
          <table className="table table-sm small align-top mb-3">
            <thead>
              <tr><th scope="col">질문</th><th scope="col">기반 모델</th><th scope="col">SFT 모델</th></tr>
            </thead>
            <tbody>
              {SFT_SAMPLES.map((s, i) => (
                <tr key={i}>
                  <td className="text-nowrap">{s.user}</td>
                  <td><Answer tokens={answerOf(base, s.user)} chips={false} /></td>
                  <td><Answer tokens={answerOf(tuned.model, s.user)} chips={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="form-label small mb-1" htmlFor="sft-question">학습하지 않은 질문으로 시험해 보기</label>
        <input id="sft-question" className="form-control form-control-sm mb-2" value={question} maxLength={QUESTION_MAX_LENGTH}
               onChange={(e) => setQuestion(e.target.value)} />
        <div className="border rounded p-2 small bg-body-tertiary">
          <span className="badge text-bg-success me-1">SFT 모델</span>
          <Answer tokens={answerOf(tuned.model, question)} />
        </div>
      </Stage>
    </LlmPage>
  )
}

