import { useEffect, useMemo, useState } from 'react'
import { Bars, LineChart, LlmPage, WordChip } from '../components/LlmViz.jsx'
import { StageCard, Terms } from '../components/VizStage.jsx'
import {
  BOS, PRETRAIN_CORPUS, PRETRAIN_DEFAULTS, VALID_CORPUS, VOCAB,
  corpusSequences, createModel, detokenize, evaluate, generate, lrAt, makeExamples, nextProbs, paramCount, tokenLosses, trainStep, pct,
} from '../utils/llmModel.js'

const TICK_MS = 40
const STEPS_PER_TICK = 2
const TOP_N = 8
const PROMPT_MAX_LENGTH = 40
const INITIAL_LOSS = Math.log(VOCAB.size)

const TERMS = {
  settings: [
    ['문맥 길이 (K)', '모델이 보는 앞 단어 수. 실제 LLM은 트랜스포머로 수천~수백만 토큰을 보지만, 여기서는 앞 K개 단어만 보는 선형 모델을 쓴다.'],
    ['학습률 (Learning rate)', '한 스텝에 가중치를 얼마나 크게 고칠지. 너무 크면 손실이 튀고, 너무 작으면 느리다.'],
    ['워밍업 (Warmup)', '처음 몇 스텝은 학습률을 0에서 천천히 올린다. 초기에 큰 갱신으로 학습이 망가지는 것을 막는다.'],
  ],
  1: [
    ['자기 지도 학습', '문장의 다음 단어 자체가 정답이라 사람이 라벨을 달 필요가 없다. 그래서 인터넷 규모의 텍스트를 학습할 수 있다.'],
    ['교차 엔트로피 손실', '정답 단어에 준 확률 p의 −ln p. 정답을 확신하면 0에 가깝고, 모든 단어를 같은 확률로 고르면 ln(어휘 수)다.'],
  ],
  2: [
    ['스텝 (Step)', '배치 하나로 손실을 계산하고 기울기(gradient)만큼 가중치를 고치는 한 번의 갱신. 여기서는 학습 문장 전체가 배치 하나다.'],
    ['Adam', '기울기의 이동 평균과 크기를 함께 보고 가중치마다 갱신 크기를 조절하는 옵티마이저. LLM 학습의 기본값(AdamW)이다.'],
    ['검증 손실', '학습에 쓰지 않은 문장의 손실. 학습 손실만 줄고 검증 손실이 오르면 외우기만 하는 과적합이다.'],
    ['코사인 스케줄', '워밍업 뒤 학습률을 코사인 곡선처럼 서서히 줄인다. 끝으로 갈수록 작게 고쳐 안정적으로 수렴한다.'],
  ],
  3: [
    ['logits', '어휘의 모든 단어에 매긴 점수. softmax를 거쳐 다음 단어 확률이 된다.'],
    ['기반 모델', '사전 학습만 마친 모델. 문장을 이어 쓰지만 질문에 답하는 법은 모른다(다음 단계 SFT에서 배운다).'],
  ],
}

function Stage(props) {
  return <StageCard {...props} terms={TERMS[props.step]} />
}

// 4. 사전 학습 (로그인 불필요). 시작을 누르면 브라우저에서 실제로 경사 하강법을 반복한다
export default function LlmPretrain() {
  const [config, setConfig] = useState(PRETRAIN_DEFAULTS)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [history, setHistory] = useState({ train: [], val: [] })
  const [prompt, setPrompt] = useState('녹차는')
  const [sentence, setSentence] = useState(4)
  // 가중치는 스텝마다 그 자리에서 고친다(배열이 커서 복사하지 않음). 화면은 step·history가 바뀔 때 다시 그린다
  const [model, setModel] = useState(() => createModel(PRETRAIN_DEFAULTS.context))

  const examples = useMemo(() => makeExamples(corpusSequences(PRETRAIN_CORPUS), config.context), [config.context])
  const validExamples = useMemo(() => makeExamples(corpusSequences(VALID_CORPUS), config.context), [config.context])
  const schedule = useMemo(() => Array.from({ length: config.steps }, (_, s) => lrAt(s, config)), [config])

  // 학습 중이면 TICK_MS마다 몇 스텝씩 학습하고 기록을 남긴다
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      const added = { train: [], val: [] }
      let s = step
      for (let i = 0; i < STEPS_PER_TICK && s < config.steps; i++, s++) {
        added.train.push(trainStep(model, examples, lrAt(s, config)))
        added.val.push(evaluate(model, validExamples))
      }
      setHistory((h) => ({ train: [...h.train, ...added.train], val: [...h.val, ...added.val] }))
      setStep(s)
      if (s >= config.steps) setRunning(false)
    }, TICK_MS)
    return () => clearTimeout(timer)
  }, [running, step, model, config, examples, validExamples])

  const reset = (next = config) => {
    setRunning(false)
    setModel(createModel(next.context))
    setStep(0)
    setHistory({ train: [], val: [] })
  }

  // 설정을 바꾸면 처음부터 다시 학습한다
  const setOption = (key) => (e) => {
    const next = { ...config, [key]: Number(e.target.value) }
    setConfig(next)
    reset(next)
  }

  const promptIds = [BOS, ...VOCAB.encode(prompt)]
  const probs = nextProbs(model, promptIds)
  const top = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]).slice(0, TOP_N)
  const continuation = generate(model, promptIds, { maxLen: 15 })
  const sentenceIds = corpusSequences([PRETRAIN_CORPUS[sentence]])[0].ids
  const losses = tokenLosses(model, sentenceIds)
  const done = step >= config.steps
  const lastTrain = history.train.at(-1)
  const lastVal = history.val.at(-1)
  const status = done ? '학습 완료' : running ? '학습 중…' : step ? '일시 정지' : '학습 전'

  return (
    <LlmPage path="/llm/pretrain"
             intro="예시 문장 24개로 작은 언어 모델을 직접 학습합니다. 모든 가중치가 0인 상태(아무것도 모름)에서 시작해, 다음 단어를 맞히는 손실이 줄어드는 동안 모델이 문장을 이어 쓰게 되는 과정을 봅니다.">
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-6 col-md">
              <label className="form-label small mb-1" htmlFor="pt-context">문맥 길이: 앞 {config.context}단어</label>
              <input id="pt-context" type="range" className="form-range" min="1" max="4" disabled={running}
                     value={config.context} onChange={setOption('context')} />
            </div>
            <div className="col-6 col-md">
              <label className="form-label small mb-1" htmlFor="pt-steps">학습 스텝: {config.steps}</label>
              <input id="pt-steps" type="range" className="form-range" min="50" max="400" step="50" disabled={running}
                     value={config.steps} onChange={setOption('steps')} />
            </div>
            <div className="col-6 col-md">
              <label className="form-label small mb-1" htmlFor="pt-lr">최대 학습률: {config.peakLr}</label>
              <input id="pt-lr" type="range" className="form-range" min="0.01" max="0.5" step="0.01" disabled={running}
                     value={config.peakLr} onChange={setOption('peakLr')} />
            </div>
            <div className="col-6 col-md">
              <label className="form-label small mb-1" htmlFor="pt-warmup">워밍업: {config.warmup}스텝</label>
              <input id="pt-warmup" type="range" className="form-range" min="0" max="50" step="5" disabled={running}
                     value={config.warmup} onChange={setOption('warmup')} />
            </div>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={done} onClick={() => setRunning((r) => !r)}>
              {running ? '일시 정지' : step ? '이어서 학습' : '학습 시작'}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!step} onClick={() => reset()}>
              처음부터
            </button>
            <span className="small ms-auto" role="status">
              {status} · 스텝 <strong>{step}</strong> / {config.steps} · 매개변수 {paramCount(model).toLocaleString()}개
            </span>
          </div>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS.settings} />
        </div>
      </div>

      <Stage step="1" title="학습 문제: 앞 단어 → 다음 단어"
             desc={`문장 앞뒤에 <bos>·<eos>를 붙이고, 위치마다 앞 ${config.context}단어로 다음 단어를 맞히는 문제를 만든다. 학습 문장 ${PRETRAIN_CORPUS.length}개에서 문제 ${examples.length}개, 검증 문장 ${VALID_CORPUS.length}개에서 ${validExamples.length}개가 나온다. 문장을 고르면 지금 모델이 각 정답 단어에 준 확률을 보여 준다(초록이 진할수록 높음).`}>
        <select className="form-select form-select-sm mb-2" aria-label="학습 문장 선택" value={sentence}
                onChange={(e) => setSentence(Number(e.target.value))}>
          {PRETRAIN_CORPUS.map((s, i) => <option key={i} value={i}>{i + 1}. {s}</option>)}
        </select>
        <div className="d-flex flex-wrap gap-1 align-items-end">
          <span className="d-inline-flex flex-column align-items-center">
            <WordChip id={sentenceIds[0]} />
            <span className="small">&nbsp;</span>
          </span>
          {losses.map((t, i) => (
            <span key={i} className="d-inline-flex flex-column align-items-center">
              <WordChip id={t.target} style={{ background: `rgba(20,108,67,${(t.prob * 0.6).toFixed(3)})` }}
                        title={`p = ${t.prob.toFixed(3)}, 손실 ${t.loss.toFixed(2)}`} />
              <span className="small font-monospace text-body-secondary">{pct(t.prob)}</span>
            </span>
          ))}
        </div>
        <p className="small text-body-secondary mt-2 mb-0">
          평균 손실 <strong>{(losses.reduce((s, t) => s + t.loss, 0) / losses.length).toFixed(2)}</strong>
          {' '}(학습 전에는 모든 단어가 1/{VOCAB.size} 확률이라 ln {VOCAB.size} = {INITIAL_LOSS.toFixed(2)})
        </p>
      </Stage>

      <Stage step="2" title={`손실 곡선 — 학습 ${lastTrain?.toFixed(2) ?? '…'} / 검증 ${lastVal?.toFixed(2) ?? '…'}`}
             desc="스텝마다 학습 손실(파랑)과 검증 손실(빨강)을 그린다. 학습 문장은 거의 외워 손실이 0에 가까워지지만, 처음 보는 검증 문장은 일정 수준 아래로 내려가지 않는다. 데이터가 적을수록 이 차이(과적합)가 커진다.">
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            <LineChart label="학습·검증 손실 곡선" xMax={config.steps} yMax={Math.ceil(Math.max(INITIAL_LOSS, ...history.val))}
                       series={[
                         { label: '학습 손실', color: '#0b5ed7', points: history.train },
                         { label: '검증 손실', color: '#b02a37', points: history.val },
                       ]} />
          </div>
          <div className="col-12 col-lg-4">
            <LineChart label="학습률 스케줄" xMax={config.steps} yMax={config.peakLr} height={140} marker={step}
                       format={(v) => v.toFixed(3)}
                       series={[{ label: '학습률 (세로선: 현재 스텝)', color: '#6f42c1', points: schedule }]} />
          </div>
        </div>
      </Stage>

      <Stage step="3" title="지금 모델로 이어 쓰기"
             desc="시작 단어를 넣으면 지금 가중치로 계산한 다음 단어 확률과, 가장 높은 단어를 계속 골라 이어 쓴 결과를 보여 준다. 학습이 진행되면 바뀌는 모습을 보세요.">
        <label className="form-label small mb-1" htmlFor="pt-prompt">시작 단어</label>
        <input id="pt-prompt" className="form-control form-control-sm mb-3" value={prompt} maxLength={PROMPT_MAX_LENGTH}
               onChange={(e) => setPrompt(e.target.value)} />
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">다음 단어 확률 상위 {TOP_N}개</div>
            <Bars items={top.map((id) => ({ key: id, label: VOCAB.list[id], value: probs[id] }))} max={1} />
          </div>
          <div className="col-12 col-md-6">
            <div className="small fw-bold mb-1">이어 쓴 문장 (greedy)</div>
            <div className="border rounded p-2 bg-body-tertiary">
              {prompt} <strong>{detokenize(continuation.map((t) => t.id)) || '…'}</strong>
            </div>
            <div className="d-flex flex-wrap gap-1 mt-2">
              {continuation.map((t, i) => <WordChip key={i} id={t.id} title={`p = ${t.prob.toFixed(3)}`} />)}
            </div>
          </div>
        </div>
      </Stage>
    </LlmPage>
  )
}
