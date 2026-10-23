// LLM 구축 과정(임베딩·어텐션·학습·정렬·평가·디코딩·서빙) 화면에서 함께 쓰는 학습용 계산 모음.
// 실제 트랜스포머 대신 브라우저에서 1초 안에 학습되는 작은 모델(앞 K개 단어를 보고 다음 단어를 맞히는 선형 모델)을 쓴다.

import { pct } from './format.js'
import { makeRng } from './random.js'

// 난수(makeRng)와 백분율(pct)은 RAG 화면과 함께 쓰려고 공용 파일로 옮겼다. 기존 import 경로도 그대로 쓸 수 있게 다시 내보낸다
export { makeRng, pct }

// ---------- 난수 (같은 시드면 늘 같은 결과) ----------

// 표준 정규분포 난수 (Box-Muller)
export function randn(rng) {
  const u = Math.max(rng(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

// ---------- 예시 데이터 (일상 주제: 커피·차) ----------

export const PRETRAIN_CORPUS = [
  '커피 원두는 밀폐 용기에 담아 서늘한 곳에 보관한다.',
  '커피 원두는 볶은 뒤 2주 안에 마시는 것이 좋다.',
  '커피 원두는 마시기 직전에 갈면 향이 오래 남는다.',
  '녹차는 70도로 식힌 물에 우리는 것이 좋다.',
  '녹차는 너무 뜨거운 물에 우리면 쓴맛이 강해진다.',
  '홍차는 끓는 물에 3분 정도 우리는 것이 좋다.',
  '홍차는 우유를 넣어 밀크티로 마시기도 한다.',
  '에스프레소는 곱게 간 원두에 뜨거운 물을 높은 압력으로 통과시켜 만든다.',
  '라테는 에스프레소에 데운 우유를 넣어 만든다.',
  '아메리카노는 에스프레소에 뜨거운 물을 넣어 만든다.',
  '콜드브루는 차가운 물로 오래 우려 만든다.',
  '커피는 물의 온도가 높으면 쓴맛이 강해진다.',
  '녹차는 찻잎을 덖거나 쪄서 만든다.',
  '홍차는 찻잎을 발효시켜 만든다.',
  '보리차는 볶은 보리를 끓는 물에 우려 만든다.',
  '드립 커피는 90도 정도의 물을 천천히 부어 내린다.',
  '원두를 너무 곱게 갈면 쓴맛이 강해진다.',
  '원두를 너무 굵게 갈면 맛이 싱거워진다.',
  '녹차에는 카테킨이 풍부하다.',
  '커피에는 카페인이 들어 있다.',
  '허브차에는 카페인이 거의 없다.',
  '우유를 넣은 커피는 맛이 부드럽다.',
  '차가운 물로 우린 차는 맛이 부드럽다.',
  '찻잎은 습기를 피해 밀폐 용기에 보관한다.',
]

// 학습에 쓰지 않고 손실만 재는 검증 문장
export const VALID_CORPUS = [
  '커피 원두는 서늘한 곳에 보관하는 것이 좋다.',
  '홍차는 우유를 넣어 마시기도 한다.',
  '녹차는 끓는 물에 우리면 쓴맛이 강해진다.',
  '라테는 우유를 넣어 맛이 부드럽다.',
]

// 지시 미세 조정 예시. 질문 끝 단어가 서로 달라야 작은 모델도 질문을 구분할 수 있다
export const SFT_SAMPLES = [
  { user: '커피 원두는 어디에 보관해?', assistant: '커피 원두는 밀폐 용기에 담아 서늘한 곳에 보관한다.' },
  { user: '녹차는 몇 도에서 우려?', assistant: '녹차는 70도로 식힌 물에 우리는 것이 좋다.' },
  { user: '라테는 무엇으로 만들어?', assistant: '라테는 에스프레소에 데운 우유를 넣어 만든다.' },
  { user: '홍차는 몇 분 우려야 해?', assistant: '홍차는 끓는 물에 3분 정도 우리는 것이 좋다.' },
]

// 객관식 평가 문제: 앞부분(stem)에 이어질 보기 중 정답(answer)을 고른다.
// 앞의 세 문제는 학습 문장을 그대로 옮긴 "오염된" 문제다
export const EVAL_ITEMS = [
  { stem: '녹차는', choices: ['70도로 식힌 물에 우리는 것이 좋다.', '얼음물에 하루 동안 두는 것이 좋다.', '우유에 끓여 마시는 것이 좋다.', '볶아서 갈아 마시는 것이 좋다.'], answer: 0 },
  { stem: '라테는', choices: ['보리를 볶아 만든다.', '에스프레소에 데운 우유를 넣어 만든다.', '찻잎을 발효시켜 만든다.', '차가운 물로 오래 우려 만든다.'], answer: 1 },
  { stem: '허브차에는', choices: ['카페인이 아주 많다.', '우유가 들어 있다.', '카페인이 거의 없다.', '원두가 들어 있다.'], answer: 2 },
  { stem: '홍차를', choices: ['얼음물에 하루 담가 둔다.', '끓는 물에 잠시 우려 마신다.', '곱게 갈아 압력으로 내린다.', '볶아서 보관만 한다.'], answer: 1 },
  { stem: '커피 원두를', choices: ['햇볕이 드는 창가에 둔다.', '물에 담가 보관한다.', '습하고 따뜻한 곳에 둔다.', '서늘하고 어두운 곳에 둔다.'], answer: 3 },
  { stem: '쓴맛이 강해지는 까닭은', choices: ['물이 너무 뜨겁기 때문이다.', '물이 너무 적당하기 때문이다.', '컵이 너무 크기 때문이다.', '날씨가 맑기 때문이다.'], answer: 0 },
]

// ---------- 토큰화 (단어 단위) ----------

export const SPECIALS = ['<pad>', '<bos>', '<eos>', '<unk>', '<|user|>', '<|assistant|>', '<|end|>']
const PUNCT = /^[.,?!]$/

// 글자·숫자 묶음과 문장부호를 토큰으로 본다 (실제 모델은 BPE 같은 서브워드 토크나이저를 쓴다)
export function splitWords(text) {
  return text.match(/[\p{L}\p{N}~]+|[^\s\p{L}\p{N}]/gu) ?? []
}

function buildVocab(texts) {
  const words = new Set()
  for (const t of texts) for (const w of splitWords(t)) words.add(w)
  const list = [...SPECIALS, ...[...words].sort((a, b) => a.localeCompare(b, 'ko'))]
  const index = new Map(list.map((w, i) => [w, i]))
  const unk = index.get('<unk>')
  return {
    list,
    size: list.length,
    id: (w) => index.get(w) ?? unk,
    encode: (text) => splitWords(text).map((w) => index.get(w) ?? unk),
  }
}

// 모든 화면이 같은 어휘를 쓴다
export const VOCAB = buildVocab([
  ...PRETRAIN_CORPUS, ...VALID_CORPUS,
  ...SFT_SAMPLES.flatMap((s) => [s.user, s.assistant]),
  ...EVAL_ITEMS.flatMap((it) => [it.stem, ...it.choices]),
])
export const BOS = VOCAB.id('<bos>')
export const EOS = VOCAB.id('<eos>')
export const UNK = VOCAB.id('<unk>')
export const USER = VOCAB.id('<|user|>')
export const ASSISTANT = VOCAB.id('<|assistant|>')
export const END = VOCAB.id('<|end|>')

// 토큰 ID를 문장으로 되돌린다. 특수 토큰은 빼고, 문장부호 앞에는 띄어쓰기를 하지 않는다
export function detokenize(ids) {
  let out = ''
  for (const id of ids) {
    const w = VOCAB.list[id]
    if (id < SPECIALS.length) continue
    out += out && !PUNCT.test(w) ? ` ${w}` : w
  }
  return out
}

// 문장마다 <bos> … <eos>로 감싼 학습 시퀀스
export function corpusSequences(texts) {
  return texts.map((t) => ({ ids: [BOS, ...VOCAB.encode(t), EOS] }))
}

// 채팅 템플릿: <bos> <|user|> 질문 <|assistant|> 답변 <|end|>. 손실은 답변과 <|end|>에서만 계산한다(train[pos] = 1)
export function chatSequence({ user, assistant }) {
  const prompt = [BOS, USER, ...VOCAB.encode(user), ASSISTANT]
  const answer = [...VOCAB.encode(assistant), END]
  return { ids: [...prompt, ...answer], train: [...prompt.map(() => 0), ...answer.map(() => 1)] }
}

// ---------- 공용 수학 ----------

export function softmax(logits, temperature = 1) {
  const t = Math.max(temperature, 1e-6)
  let max = -Infinity
  for (const x of logits) if (x > max) max = x
  const out = new Float64Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp((logits[i] - max) / t)
    sum += out[i]
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

export function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function matmul(A, B) {
  const cols = B[0]?.length ?? 0
  return A.map((row) => {
    const out = new Array(cols).fill(0)
    row.forEach((a, k) => {
      if (a) for (let j = 0; j < cols; j++) out[j] += a * B[k][j]
    })
    return out
  })
}

export function randomMatrix(rows, cols, rng, std = 1) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => randn(rng) * std))
}

// ---------- 2. 임베딩·위치 인코딩 ----------

// 사인·코사인 위치 인코딩: 짝수 칸은 sin, 홀수 칸은 cos이고 칸 번호가 클수록 천천히 변한다
export function positionalEncoding(length, dim) {
  return Array.from({ length }, (_, pos) => Array.from({ length: dim }, (_, i) => {
    const angle = pos / 10000 ** ((2 * Math.floor(i / 2)) / dim)
    return i % 2 === 0 ? Math.sin(angle) : Math.cos(angle)
  }))
}

// 학습 전 임베딩 표: 단어마다 무작위 벡터 한 줄 (시드가 같으면 같은 값)
export function randomEmbeddings(dim, seed) {
  return randomMatrix(VOCAB.size, dim, makeRng(seed), 1 / Math.sqrt(dim) * 2)
}

// 같은 문장 안에서 window 거리 안에 함께 나온 횟수로 PPMI 벡터를 만든다.
// 학습된 임베딩처럼 비슷한 자리에 쓰이는 단어끼리 가까워지는 모습을 흉내 낸다
export function cooccurrenceEmbeddings(texts, window = 2, minCount = 2) {
  const V = VOCAB.size
  const counts = new Map()
  const freq = new Float64Array(V)
  let total = 0
  for (const t of texts) {
    const ids = VOCAB.encode(t).filter((id) => !PUNCT.test(VOCAB.list[id]))
    ids.forEach((a, i) => {
      freq[a]++
      for (let j = Math.max(0, i - window); j <= Math.min(ids.length - 1, i + window); j++) {
        if (j === i) continue
        const row = counts.get(a) ?? new Float64Array(V)
        row[ids[j]]++
        counts.set(a, row)
        total++
      }
    })
  }
  const words = [...counts.keys()].filter((id) => freq[id] >= minCount)
  const colSum = new Float64Array(V)
  for (const row of counts.values()) row.forEach((c, j) => (colSum[j] += c))
  const vectors = words.map((id) => {
    const row = counts.get(id)
    const rowSum = row.reduce((s, c) => s + c, 0)
    const v = Array.from(row, (c, j) => (c ? Math.max(0, Math.log((c * total) / (rowSum * colSum[j]))) : 0))
    const norm = Math.hypot(...v)
    return norm ? v.map((x) => x / norm) : v
  })
  return { words, vectors }
}

// ---------- 3. 셀프 어텐션 ----------

// 헤드마다 Q·K·V를 만들고 점수 → (인과 마스크) → softmax → 가중합까지 계산한다. 가중치는 무작위(학습 전)
export function selfAttention(X, { heads, seed, causal }) {
  const dim = X[0].length
  const headDim = dim / heads
  const rng = makeRng(seed)
  const std = 1.5 / Math.sqrt(dim)
  return Array.from({ length: heads }, () => {
    const [Wq, Wk, Wv] = [0, 1, 2].map(() => randomMatrix(dim, headDim, rng, std))
    const Q = matmul(X, Wq)
    const K = matmul(X, Wk)
    const V = matmul(X, Wv)
    const scores = Q.map((q) => K.map((k) => dot(q, k) / Math.sqrt(headDim)))
    const masked = scores.map((row, i) => row.map((s, j) => (causal && j > i ? -Infinity : s)))
    const weights = masked.map((row) => Array.from(softmax(row)))
    const out = weights.map((w) => V[0].map((_, c) => w.reduce((s, wj, j) => s + wj * V[j][c], 0)))
    return { Q, K, V, scores, masked, weights, out }
  })
}

// ---------- 4~5. 작은 언어 모델 (앞 K개 단어 → 다음 단어) ----------
// logits = b + W[0][바로 앞 단어] + W[1][두 칸 앞 단어] + … 인 선형 모델. 0으로 시작하므로 처음 손실은 ln(어휘 수)다

export function createModel(context, V = VOCAB.size) {
  const size = context * V * V
  return {
    V, K: context, t: 0,
    W: new Float32Array(size), mW: new Float32Array(size), vW: new Float32Array(size),
    b: new Float32Array(V), mb: new Float32Array(V), vb: new Float32Array(V),
  }
}

// 가중치는 복사하고 옵티마이저 상태는 새로 시작한다 (미세 조정용)
export function cloneModel(m) {
  return {
    ...createModel(m.K, m.V),
    W: Float32Array.from(m.W), b: Float32Array.from(m.b),
  }
}

export function paramCount(m) {
  return m.W.length + m.b.length
}

// 앞 K개 단어 (가까운 것부터). 문장 앞을 넘어가면 <bos>로 채운다
function contextOf(ids, pos, K) {
  return Array.from({ length: K }, (_, k) => (pos - 1 - k >= 0 ? ids[pos - 1 - k] : BOS))
}

function logitsOf(m, ctx) {
  const out = Float64Array.from(m.b)
  ctx.forEach((id, k) => {
    const off = (k * m.V + id) * m.V
    for (let j = 0; j < m.V; j++) out[j] += m.W[off + j]
  })
  return out
}

// ids 다음에 올 단어의 확률 분포
export function nextProbs(m, ids, temperature = 1) {
  return softmax(logitsOf(m, contextOf(ids, ids.length, m.K)), temperature)
}

// 시퀀스의 각 위치를 (앞 단어들 → 정답 단어) 학습 문제로 바꾼다. weight가 0이면 손실에서 뺀다
export function makeExamples(seqs, K) {
  return seqs.flatMap(({ ids, train }) => ids.slice(1).map((target, i) => ({
    ctx: contextOf(ids, i + 1, K), target, weight: train ? train[i + 1] : 1,
  })))
}

// 가중 평균 교차 엔트로피로 한 스텝 학습한다. 옵티마이저는 Adam이며, 이번 배치에 나온 단어의 행만 갱신한다
export function trainStep(m, examples, lr) {
  const { V } = m
  const grads = new Map()
  const gb = new Float64Array(V)
  let loss = 0
  let total = 0
  for (const { ctx, target, weight } of examples) {
    if (!weight) continue
    const p = softmax(logitsOf(m, ctx))
    loss -= Math.log(Math.max(p[target], 1e-12)) * weight
    total += weight
    p[target] -= 1
    for (let j = 0; j < V; j++) gb[j] += p[j] * weight
    ctx.forEach((id, k) => {
      const key = k * V + id
      let g = grads.get(key)
      if (!g) grads.set(key, (g = new Float64Array(V)))
      for (let j = 0; j < V; j++) g[j] += p[j] * weight
    })
  }
  if (!total) return 0
  m.t++
  const b1 = 0.9
  const b2 = 0.999
  const c1 = 1 - b1 ** m.t
  const c2 = 1 - b2 ** m.t
  const adam = (param, mom, vel, off, g) => {
    for (let j = 0; j < V; j++) {
      const gj = g[j] / total
      mom[off + j] = b1 * mom[off + j] + (1 - b1) * gj
      vel[off + j] = b2 * vel[off + j] + (1 - b2) * gj * gj
      param[off + j] -= (lr * (mom[off + j] / c1)) / (Math.sqrt(vel[off + j] / c2) + 1e-8)
    }
  }
  for (const [key, g] of grads) adam(m.W, m.mW, m.vW, key * V, g)
  adam(m.b, m.mb, m.vb, 0, gb)
  return loss / total
}

// 학습 없이 평균 손실만 잰다
export function evaluate(m, examples) {
  let loss = 0
  let total = 0
  for (const { ctx, target, weight } of examples) {
    if (!weight) continue
    loss -= Math.log(Math.max(softmax(logitsOf(m, ctx))[target], 1e-12)) * weight
    total += weight
  }
  return total ? loss / total : 0
}

// 위치마다 정답 단어의 확률과 손실(-ln p)
export function tokenLosses(m, ids) {
  return ids.slice(1).map((target, i) => {
    const prob = nextProbs(m, ids.slice(0, i + 1))[target]
    return { target, prob, loss: -Math.log(Math.max(prob, 1e-12)) }
  })
}

// 학습률 스케줄: warmup 동안 0에서 peak까지 올린 뒤 코사인 곡선으로 peak의 10%까지 내린다
export function lrAt(step, { steps, peakLr, warmup }) {
  if (step < warmup) return (peakLr * (step + 1)) / warmup
  const progress = Math.min(1, (step - warmup) / Math.max(1, steps - warmup))
  return peakLr * (0.1 + 0.9 * 0.5 * (1 + Math.cos(Math.PI * progress)))
}

export const PRETRAIN_DEFAULTS = { context: 3, steps: 200, peakLr: 0.1, warmup: 20 }

// 다른 화면(SFT·평가·디코딩)이 함께 쓰는 사전 학습 모델. 처음 쓸 때 한 번만 학습한다
let pretrained = null
export function getPretrainedModel() {
  if (!pretrained) {
    const m = createModel(PRETRAIN_DEFAULTS.context)
    const examples = makeExamples(corpusSequences(PRETRAIN_CORPUS), m.K)
    for (let s = 0; s < PRETRAIN_DEFAULTS.steps; s++) trainStep(m, examples, lrAt(s, PRETRAIN_DEFAULTS))
    pretrained = m
  }
  return pretrained
}

// ---------- 8. 디코딩 ----------

// 확률이 높은 순으로 top-k개, 누적 확률이 top-p에 닿을 때까지만 남기고 다시 합이 1이 되게 나눈다
export function filterTopKTopP(probs, topK, topP) {
  const order = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a])
  const kept = new Array(probs.length).fill(false)
  let cum = 0
  for (let r = 0; r < order.length; r++) {
    if (topK && r >= topK) break
    if (r > 0 && cum >= topP) break
    kept[order[r]] = true
    cum += probs[order[r]]
  }
  const sum = order.reduce((s, i) => s + (kept[i] ? probs[i] : 0), 0)
  return { kept, probs: Array.from(probs, (p, i) => (kept[i] ? p / sum : 0)) }
}

export function sampleFrom(probs, rng) {
  let r = rng()
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]
    if (r <= 0) return i
  }
  return probs.length - 1
}

// temperature가 0이면 늘 가장 확률 높은 단어를 고른다(greedy). <eos>·<|end|>가 나오면 멈춘다
export function generate(m, promptIds, { temperature = 0, topK = 0, topP = 1, maxLen = 20, rng } = {}) {
  const ids = [...promptIds]
  const out = []
  for (let n = 0; n < maxLen; n++) {
    const probs = nextProbs(m, ids, temperature || 1)
    let next
    if (!temperature) {
      next = probs.indexOf(Math.max(...probs))
    } else {
      next = sampleFrom(filterTopKTopP(probs, topK, topP).probs, rng)
    }
    out.push({ id: next, prob: probs[next] })
    ids.push(next)
    if (next === EOS || next === END) break
  }
  return out
}

// ---------- 6. 선호 정렬 ----------

export const ALIGN_SAMPLE = {
  prompt: '녹차를 맛있게 우리려면?',
  answers: [
    '70~80도로 식힌 물에 2~3분 우린다.',
    '70도 정도의 물에 우리면 된다.',
    '끓는 물에 5분 이상 우린다.',
    '끓는 물에 30분 이상 우린다.',
  ],
  // 사람이 두 답을 비교해 고른 결과 [이긴 답, 진 답]. 사람마다 판단이 달라 서로 어긋난 표도 섞여 있다
  comparisons: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3], [1, 0], [0, 1], [2, 3], [0, 3], [1, 3]],
  // SFT 모델이 각 답을 낼 확률 (기준 정책)
  reference: [0.15, 0.25, 0.35, 0.25],
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x))

// Bradley-Terry 보상 모델: P(a가 b보다 낫다) = σ(r_a − r_b)가 되도록 답마다 점수를 경사 하강법으로 맞춘다
export function fitRewardModel(n, comparisons, steps = 150, lr = 0.5) {
  const r = new Array(n).fill(0)
  const losses = []
  for (let s = 0; s < steps; s++) {
    const g = new Array(n).fill(0)
    let loss = 0
    for (const [w, l] of comparisons) {
      const p = sigmoid(r[w] - r[l])
      loss -= Math.log(p)
      g[w] -= 1 - p
      g[l] += 1 - p
    }
    losses.push(loss / comparisons.length)
    // 점수는 차이만 의미가 있어 약한 L2로 0 근처에 묶어 둔다
    for (let i = 0; i < n; i++) r[i] -= lr * (g[i] / comparisons.length + 0.01 * r[i])
  }
  const accuracy = comparisons.filter(([w, l]) => r[w] > r[l]).length / comparisons.length
  return { rewards: r, losses, accuracy }
}

// RLHF 목표(보상 − β·KL)의 최적 정책: π*(y) ∝ π_ref(y)·exp(r(y)/β)
export function rlhfOptimal(reference, rewards, beta) {
  return Array.from(softmax(reference.map((p, i) => Math.log(p) + rewards[i] / beta)))
}

export function klDivergence(p, q) {
  return p.reduce((s, pi, i) => s + (pi > 0 ? pi * Math.log(pi / q[i]) : 0), 0)
}

// DPO: 보상 모델 없이 선호 쌍으로 정책을 직접 학습한다. 스텝마다 확률·손실 기록을 남긴다
export function trainDpo(reference, comparisons, { beta, steps, lr }) {
  const refLog = reference.map(Math.log)
  const theta = [...refLog]
  const history = []
  for (let s = 0; s <= steps; s++) {
    const probs = Array.from(softmax(theta))
    const logp = probs.map(Math.log)
    let loss = 0
    const g = new Array(theta.length).fill(0)
    for (const [w, l] of comparisons) {
      const z = beta * ((logp[w] - refLog[w]) - (logp[l] - refLog[l]))
      loss -= Math.log(sigmoid(z))
      // d(−ln σ(z))/dθ = −(1 − σ(z))·β·(e_w − e_l)  (softmax 정규화 항은 서로 지워진다)
      g[w] -= (1 - sigmoid(z)) * beta
      g[l] += (1 - sigmoid(z)) * beta
    }
    history.push({ probs, loss: loss / comparisons.length })
    for (let i = 0; i < theta.length; i++) theta[i] -= (lr * g[i]) / comparisons.length
  }
  return history
}

// ---------- 7. 평가 ----------

// 앞부분(stem) 뒤에 보기가 이어질 때 보기 단어들의 평균 로그 확률. 클수록 모델이 그 보기를 자연스럽게 본다
export function choiceScore(m, stem, choice) {
  const prefix = [BOS, ...VOCAB.encode(stem)]
  const ids = [...prefix, ...VOCAB.encode(choice)]
  const losses = tokenLosses(m, ids).slice(prefix.length - 1)
  return -losses.reduce((s, t) => s + t.loss, 0) / losses.length
}

// 평가 문장의 단어 n-gram이 학습 문장에 그대로 있는지 센다 (평가 데이터 오염 검사)
export function ngramOverlap(text, corpus, n = 4) {
  const grams = (ids) => {
    const out = []
    for (let i = 0; i + n <= ids.length; i++) out.push(ids.slice(i, i + n).join(' '))
    return out
  }
  const seen = new Set(corpus.flatMap((t) => grams(splitWords(t))))
  const mine = grams(splitWords(text))
  const hits = mine.filter((g) => seen.has(g))
  return { total: mine.length, hits: hits.length, ratio: mine.length ? hits.length / mine.length : 0 }
}

// ---------- 9. 경량화·서빙 ----------

// 대칭 양자화: 그룹마다 절댓값 최대를 정수 최대값에 맞추는 scale로 나눠 반올림한다
export function quantize(values, bits, groupSize) {
  const qmax = 2 ** (Math.max(2, bits) - 1) - 1
  const deq = new Array(values.length)
  const scales = []
  for (let g = 0; g < values.length; g += groupSize) {
    const group = values.slice(g, g + groupSize)
    const scale = Math.max(...group.map(Math.abs)) / qmax || 1
    scales.push(scale)
    group.forEach((v, i) => {
      deq[g + i] = Math.max(-qmax, Math.min(qmax, Math.round(v / scale))) * scale
    })
  }
  const mse = values.reduce((s, v, i) => s + (v - deq[i]) ** 2, 0) / values.length
  return { deq, scales, mse }
}

// 정적 배치는 묶음의 가장 긴 요청이 끝나야 다음 묶음을 받고, 연속 배치는 자리가 비는 즉시 다음 요청을 넣는다.
// 반환값 slots[자리][시간] = 요청 번호(빈자리는 null)
export function simulateBatching(lengths, batchSize, continuous) {
  const slots = Array.from({ length: batchSize }, () => [])
  if (continuous) {
    const free = new Array(batchSize).fill(0)
    lengths.forEach((len, req) => {
      const s = free.indexOf(Math.min(...free))
      for (let t = 0; t < len; t++) slots[s][free[s] + t] = req
      free[s] += len
    })
  } else {
    let start = 0
    for (let g = 0; g < lengths.length; g += batchSize) {
      const group = lengths.slice(g, g + batchSize)
      group.forEach((len, i) => {
        for (let t = 0; t < len; t++) slots[i][start + t] = g + i
      })
      start += Math.max(...group)
    }
  }
  const time = Math.max(...slots.map((row) => row.length))
  const grid = slots.map((row) => Array.from({ length: time }, (_, t) => row[t] ?? null))
  const busy = lengths.reduce((s, l) => s + l, 0)
  return { grid, time, utilization: busy / (time * batchSize) }
}
