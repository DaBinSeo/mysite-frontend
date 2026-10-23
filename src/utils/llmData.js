// LLM 학습 데이터 구축 과정을 브라우저에서 흉내 내는 학습용 계산 모음.
// 수집 → 정제·품질 필터링 → 중복 제거 → 개인정보 마스킹 → BPE 토큰화 → 시퀀스 패킹 순서로 처리한다.

export const CORPUS_MAX_LENGTH = 20000
export const MAX_DOCS = 30
export const BPE_MAX_MERGES = 300
export const SHINGLE_SIZE = 4
const KO_MIN_RATIO = 0.5
const REPEAT_MIN_WORDS = 8

export const DEFAULT_OPTIONS = {
  minLength: 20,
  maxSymbolRatio: 0.1,
  minUniqueRatio: 0.3,
  koreanOnly: true,
  dedupThreshold: 0.7,
}

// 문서는 `---` 줄로 나누고, 첫 줄이 [출처]면 출처로 쓴다
export const SAMPLE_CORPUS = [
  `[웹 크롤링]
<html><body><h1>파이썬 리스트 정렬</h1><p>파이썬에서 리스트를 정렬할 때는 sorted() 함수나 sort() 메서드를 쓴다. sorted()는 새 리스트를 돌려주고, sort()는 원래 리스트를 바꾼다.</p><p>key 인자에 함수를 넘기면 원하는 기준으로 정렬할 수 있고, reverse=True를 주면 내림차순이 된다.</p></body></html>`,
  `[복사 블로그]
파이썬 리스트 정렬 — 파이썬에서 리스트를 정렬할 때는 sorted() 함수나 sort() 메서드를 쓴다. sorted()는 새 리스트를 돌려주고, sort()는 원래 리스트를 바꾼다. key 인자에 함수를 넘기면 원하는 기준으로 정렬할 수 있고, reverse=True를 주면 내림차순이 된다. (출처: 복사 블로그)`,
  `[기술 문서]
장고(Django)는 파이썬으로 만든 웹 프레임워크다. 모델, 뷰, 템플릿으로 역할을 나누고, 관리자 화면과 ORM을 기본으로 제공한다. 마이그레이션 명령으로 모델 변경을 데이터베이스에 반영한다.`,
  `[광고 페이지]
★★★ 최저가 보장 ★★★ $$$ 지금 클릭 >>> http://spam.example <<< !!! 100% 당첨 !!! ★★★`,
  `[댓글]
감사합니다!!`,
  `[커뮤니티]
파이썬 최고 파이썬 최고 파이썬 최고 파이썬 최고 파이썬 최고 파이썬 최고 파이썬 최고 파이썬 최고`,
  `[커뮤니티]
스터디 모집합니다. 매주 토요일에 장고로 게시판을 만들고 코드 리뷰를 합니다. 참여하실 분은 홍길동(gildong@example.com, 010-1234-5678)에게 연락 주세요.`,
  `[영문 위키]
Python is a popular programming language. It is widely used for web development, data analysis, and machine learning.`,
  `[미러 사이트]
장고(Django)는   파이썬으로 만든 웹 프레임워크다.
모델, 뷰, 템플릿으로 역할을 나누고, 관리자 화면과 ORM을 기본으로 제공한다. 마이그레이션 명령으로 모델 변경을 데이터베이스에 반영한다.`,
  `[기술 문서]
대규모 언어 모델은 문장의 다음 토큰을 예측하도록 학습한다. 학습 데이터가 깨끗하고 다양할수록 모델의 품질이 좋아지므로, 수집한 문서를 정제하고 중복을 없애는 과정이 중요하다.`,
  `[교재]
파이썬 함수는 def 키워드로 정의한다. 함수 이름 뒤 괄호 안에 매개변수를 쓰고, return으로 값을 돌려준다. 함수를 쓰면 같은 코드를 여러 번 다시 쓰지 않아도 된다.`,
].join('\n---\n')

// ---------- 1. 수집 ----------

export function parseCorpus(text) {
  return text.slice(0, CORPUS_MAX_LENGTH)
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_DOCS)
    .map((s, index) => {
      const m = s.match(/^\[([^\]\n]{1,20})\][ \t]*(?:\n|$)/)
      return { index, source: m ? m[1] : '출처 없음', raw: m ? s.slice(m[0].length).trim() : s }
    })
}

// ---------- 2. 정제·품질 필터링 ----------

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
// 태그 길이를 제한해 닫는 >가 없는 '<a'가 반복된 글에서 끝까지 훑지 않게 한다
const TAG_RE = /<\/?[a-z][^<>]{0,500}>/gi

// HTML 태그·스크립트를 걷어 내고 줄마다 공백을 정리한다. 블록 태그가 끝나는 곳은 줄바꿈으로 바꾼다
export function cleanText(raw) {
  const htmlRemoved = /<\/?[a-z][^<>]{0,500}>/i.test(raw)
  const text = raw
    .replace(/<(script|style)\b[^<>]{0,500}>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, '\n')
    .replace(TAG_RE, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return { text, htmlRemoved }
}

export function textMetrics(text) {
  const chars = [...text]
  const letters = chars.filter((c) => /\p{L}/u.test(c)).length
  const hangul = chars.filter((c) => /\p{Script=Hangul}/u.test(c)).length
  // 글자·숫자·공백과 흔한 문장부호(. , ' " ( ) · -)가 아닌 문자를 기호로 센다
  const symbols = chars.filter((c) => !/[\p{L}\p{N}\s.,'"()·-]/u.test(c)).length
  const words = text.split(/\s+/).filter(Boolean)
  return {
    length: chars.length,
    koRatio: letters ? hangul / letters : 0,
    symbolRatio: chars.length ? symbols / chars.length : 0,
    // 단어가 너무 적으면 반복 여부를 판단하지 않는다
    uniqueRatio: words.length >= REPEAT_MIN_WORDS ? new Set(words).size / words.length : 1,
  }
}

// key는 통계 표에서 어느 칸이 걸렸는지 표시할 때 쓴다
export const FILTERS = [
  { key: 'length', label: '너무 짧음', test: (m, o) => m.length >= o.minLength },
  { key: 'koRatio', label: '한국어 아님', test: (m, o) => !o.koreanOnly || m.koRatio >= KO_MIN_RATIO },
  { key: 'symbolRatio', label: '기호 과다', test: (m, o) => m.symbolRatio <= o.maxSymbolRatio },
  { key: 'uniqueRatio', label: '반복 과다', test: (m, o) => m.uniqueRatio >= o.minUniqueRatio },
]

// ---------- 3. 중복 제거 ----------

// 대소문자·공백·문장부호 차이는 무시하고 비교한다
function normalizeForDedup(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function shingles(norm) {
  const set = new Set()
  for (let i = 0; i + SHINGLE_SIZE <= norm.length; i++) set.add(norm.slice(i, i + SHINGLE_SIZE))
  if (!set.size && norm) set.add(norm)
  return set
}

function jaccard(a, b) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  let inter = 0
  for (const s of small) if (large.has(s)) inter++
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

// ---------- 4. 개인정보 마스킹 ----------

const PII_PATTERNS = [
  // 앞쪽 경계와 길이 제한이 없으면 @ 없는 긴 글에서 시작 위치마다 끝까지 훑어 이차 시간이 걸린다
  ['EMAIL', /(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/],
  ['RRN', /\b\d{6}-[1-4]\d{6}\b/],
  ['PHONE', /\b0\d{1,2}-?\d{3,4}-?\d{4}\b/],
]
const PII_RE = new RegExp(PII_PATTERNS.map(([name, re]) => `(?<${name}>${re.source})`).join('|'), 'g')
export const PII_LABELS = { EMAIL: '이메일', RRN: '주민등록번호', PHONE: '전화번호' }

// 원문을 조각으로 나눠 개인정보 조각에는 type·tag를 붙인다. masked는 tag로 바꾼 글
export function maskPii(text) {
  const parts = []
  let last = 0
  for (const m of text.matchAll(PII_RE)) {
    const type = Object.keys(m.groups).find((k) => m.groups[k] !== undefined)
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[0], type, tag: `<${type}>` })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return {
    parts,
    hits: parts.filter((p) => p.type).length,
    masked: parts.map((p) => p.tag ?? p.text).join(''),
  }
}

// 1~4단계를 한 번에 처리한다. 필터 통과 문서끼리의 유사도 행렬도 돌려준다
export function runPipeline(text, options) {
  const docs = parseCorpus(text).map((d) => {
    const { text: cleaned, htmlRemoved } = cleanText(d.raw)
    const metrics = textMetrics(cleaned)
    const fails = FILTERS.filter((f) => !f.test(metrics, options))
    return { ...d, cleaned, htmlRemoved, metrics, fails, dup: null, pii: null }
  })

  const passed = docs.filter((d) => !d.fails.length)
  const sigs = passed.map((d) => {
    const norm = normalizeForDedup(d.cleaned)
    return { norm, set: shingles(norm) }
  })
  const matrix = passed.map((_, i) => passed.map((_, j) => (i === j ? 1 : jaccard(sigs[i].set, sigs[j].set))))

  // 앞에서부터 남긴 문서와 비교해, 완전히 같거나 기준 이상 비슷하면 뒤 문서를 지운다
  const kept = []
  passed.forEach((d, i) => {
    const exact = kept.find((k) => sigs[k].norm === sigs[i].norm)
    if (exact !== undefined) {
      d.dup = { type: 'exact', of: passed[exact].index, score: 1 }
      return
    }
    const near = kept.reduce((best, k) => (best === undefined || matrix[i][k] > matrix[i][best] ? k : best), undefined)
    if (near !== undefined && matrix[i][near] >= options.dedupThreshold) {
      d.dup = { type: 'near', of: passed[near].index, score: matrix[i][near] }
      return
    }
    kept.push(i)
  })

  const finalDocs = kept.map((i) => passed[i])
  for (const d of finalDocs) d.pii = maskPii(d.cleaned)
  return { docs, passed, matrix, finalDocs }
}

// ---------- 5. BPE 토큰화 ----------

export const WORD_START = '▁'
export const SPECIAL_TOKENS = ['<pad>', '<bos>', '<eos>', '<unk>']
export const CHAT_TOKENS = ['<|system|>', '<|user|>', '<|assistant|>', '<|end|>']
// 쌍 키 구분자. 입력에 섞여 있어도 키가 틀어지지 않게 wordsOf()에서 미리 지운다
const SEP = '\u0000'

// 공백으로 나눈 단어마다 앞에 단어 시작 표시(▁)를 붙인다 (SentencePiece 방식)
function wordsOf(text) {
  return text.replaceAll(SEP, '').split(/\s+/).filter(Boolean).map((w) => WORD_START + w)
}

function mergePair(symbols, a, b) {
  const out = []
  for (let i = 0; i < symbols.length; i++) {
    if (i < symbols.length - 1 && symbols[i] === a && symbols[i + 1] === b) {
      out.push(a + b)
      i++
    } else {
      out.push(symbols[i])
    }
  }
  return out
}

// 글자 단위에서 시작해 가장 자주 붙어 나오는 쌍을 하나씩 합친다. 2번 이상 나오는 쌍이 없으면 멈춘다
export function trainBpe(texts, maxMerges = BPE_MAX_MERGES) {
  const freq = new Map()
  for (const t of texts) for (const w of wordsOf(t)) freq.set(w, (freq.get(w) ?? 0) + 1)
  const words = [...freq].map(([w, f]) => ({ symbols: [...w], freq: f }))
  const base = [...new Set(words.flatMap((w) => w.symbols))].sort()
  const merges = []
  for (let n = 0; n < maxMerges; n++) {
    const counts = new Map()
    for (const { symbols, freq: f } of words) {
      for (let i = 0; i < symbols.length - 1; i++) {
        const key = symbols[i] + SEP + symbols[i + 1]
        counts.set(key, (counts.get(key) ?? 0) + f)
      }
    }
    let best = null
    let bestCount = 1
    for (const [key, c] of counts) {
      if (c > bestCount) {
        best = key
        bestCount = c
      }
    }
    if (!best) break
    const [a, b] = best.split(SEP)
    merges.push({ a, b, token: a + b, freq: bestCount })
    for (const w of words) w.symbols = mergePair(w.symbols, a, b)
  }
  return { base, merges }
}

// 앞에서부터 mergeCount개의 병합 규칙만 쓰는 토크나이저. 어휘에 없는 글자는 <unk>가 된다
export function makeTokenizer(bpe, mergeCount) {
  const vocab = new Map()
  for (const t of [...SPECIAL_TOKENS, ...CHAT_TOKENS, ...bpe.base]) if (!vocab.has(t)) vocab.set(t, vocab.size)
  const ranks = new Map()
  bpe.merges.slice(0, mergeCount).forEach((m, i) => {
    ranks.set(m.a + SEP + m.b, i)
    if (!vocab.has(m.token)) vocab.set(m.token, vocab.size)
  })

  const cache = new Map()
  // 학습 때와 같은 순서가 되도록 순위가 가장 앞선(먼저 배운) 병합부터 적용한다
  const encodeWord = (word) => {
    if (cache.has(word)) return cache.get(word)
    let symbols = [...word]
    while (symbols.length > 1) {
      let bestRank = Infinity
      let bestI = -1
      for (let i = 0; i < symbols.length - 1; i++) {
        const r = ranks.get(symbols[i] + SEP + symbols[i + 1])
        if (r !== undefined && r < bestRank) {
          bestRank = r
          bestI = i
        }
      }
      if (bestI < 0) break
      symbols = mergePair(symbols, symbols[bestI], symbols[bestI + 1])
    }
    const tokens = symbols.map((s) => (vocab.has(s) ? { text: s, id: vocab.get(s) } : { text: s, id: vocab.get('<unk>'), unk: true }))
    cache.set(word, tokens)
    return tokens
  }

  return {
    vocabSize: vocab.size,
    encode: (text) => wordsOf(text).flatMap(encodeWord),
    special: (t) => ({ text: t, id: vocab.get(t), special: true }),
  }
}

// ---------- 6. 시퀀스 패킹 ----------

// 문서마다 끝에 <eos>를 붙여 한 줄로 이은 뒤 contextLen 토큰씩 자른다. 마지막 블록의 빈칸은 <pad>로 채운다
export function packSequences(docTokens, contextLen, tokenizer) {
  const stream = docTokens.flatMap(({ doc, tokens }) => [
    ...tokens.map((t) => ({ ...t, doc })),
    { ...tokenizer.special('<eos>'), doc },
  ])
  const blocks = []
  for (let i = 0; i < stream.length; i += contextLen) blocks.push(stream.slice(i, i + contextLen))
  let padCount = 0
  const last = blocks.at(-1)
  while (last && last.length < contextLen) {
    last.push({ ...tokenizer.special('<pad>'), doc: null })
    padCount++
  }
  return { blocks, total: stream.length, padCount }
}

// ---------- 7. 지시·선호 데이터 ----------

export const SFT_SAMPLE = [
  { role: 'system', text: '너는 파이썬을 알려 주는 친절한 도우미다.' },
  { role: 'user', text: '파이썬에서 리스트를 정렬하는 방법을 알려줘.' },
  { role: 'assistant', text: 'sorted() 함수는 정렬한 새 리스트를 돌려주고, 리스트의 sort() 메서드는 원래 리스트를 바꾼다. 내림차순은 reverse=True를 주면 된다.' },
]

export const PREFERENCE_SAMPLE = {
  prompt: '장고에서 모델을 바꾼 뒤 데이터베이스에 반영하려면?',
  chosen: 'makemigrations로 마이그레이션 파일을 만든 뒤 migrate로 데이터베이스에 반영한다. 적용 전 sqlmigrate로 실행될 SQL을 확인할 수도 있다.',
  rejected: '데이터베이스 파일을 지우고 서버를 다시 켜면 된다.',
  note: '거절 답변은 데이터를 모두 잃는 위험한 방법이라 사람이 낮게 평가했다.',
}

// 채팅 템플릿으로 대화를 토큰열로 만든다. 역할 표시는 학습하지 않고, assistant 답변과 끝 표시만 학습(train)한다
export function buildChat(tokenizer, messages) {
  return messages.flatMap(({ role, text }) => {
    const train = role === 'assistant'
    return [
      { ...tokenizer.special(`<|${role}|>`), role, train: false },
      ...tokenizer.encode(text).map((t) => ({ ...t, role, train })),
      { ...tokenizer.special('<|end|>'), role, train },
    ]
  })
}
