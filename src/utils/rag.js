// RAG 데이터 구축 과정을 브라우저에서 흉내 내는 학습용 계산 모음.
// 실제 임베딩 모델 대신 토큰·글자 bigram을 해시해 고정 차원 벡터를 만든다(feature hashing).

export const DOC_MAX_LENGTH = 10000
export const EMBEDDING_DIM = 64

// 청크마다 돌려 쓰는 색 (원문 지도·벡터 공간·검색 결과에서 같은 색을 쓴다)
// 흰 글자(배지·점 번호)와 대비 4.5:1 이상이 되도록 어두운 색만 쓴다
export const CHUNK_COLORS = ['#0b5ed7', '#146c43', '#c2185b', '#b35309', '#6f42c1', '#0f766e', '#b02a37', '#087990']

export function chunkColor(index) {
  return CHUNK_COLORS[index % CHUNK_COLORS.length]
}

export const SAMPLE_DOC = `RAG(Retrieval-Augmented Generation)는 언어 모델이 답변하기 전에 외부 문서에서 관련 내용을 찾아 함께 넘겨 주는 방식이다. 모델이 학습하지 않은 최신 정보나 사내 문서도 근거로 삼을 수 있다.

데이터 구축은 먼저 문서를 작은 조각(청크)으로 나누는 데서 시작한다. 청크가 너무 크면 검색이 부정확해지고, 너무 작으면 문맥이 끊긴다. 그래서 앞 청크의 끝부분을 다음 청크에 겹쳐(overlap) 넣기도 한다.

나눈 청크는 임베딩 모델을 거쳐 숫자 벡터가 된다. 의미가 비슷한 문장은 벡터 공간에서 가까운 곳에 놓인다. 벡터는 원문과 함께 벡터 데이터베이스에 저장한다.

사용자가 질문하면 질문도 같은 방식으로 임베딩한다. 질문 벡터와 코사인 유사도가 높은 청크 몇 개를 골라 프롬프트에 붙이고, 언어 모델은 그 내용을 근거로 답변을 만든다.`

// ---------- 청킹 ----------

// 고정 길이: size 글자씩 자르고, 다음 청크는 overlap 글자만큼 뒤로 물러나 시작한다
function chunkFixed(text, size, overlap) {
  const chunks = []
  const step = Math.max(1, size - overlap)
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(text.length, start + size)
    chunks.push({ start, end })
    if (end === text.length) break
  }
  return chunks
}

// 정규식으로 나눈 단위(문장·문단)의 [start, end) 목록. 하나도 못 나누면(구두점만 있는 글 등) 전체를 한 단위로 본다
function splitUnits(text, pattern) {
  const units = []
  for (const m of text.matchAll(pattern)) {
    if (m[0].trim()) units.push({ start: m.index, end: m.index + m[0].length })
  }
  if (!units.length && text.trim()) units.push({ start: 0, end: text.length })
  return units
}

// 단위(문장·문단)를 size 이하로 묶는다. 겹침은 앞 청크 끝의 단위 중 overlap 글자 안에 드는 것을 다시 넣는다.
// size보다 긴 단위 하나는 고정 길이로 잘라 넣는다.
function groupUnits(units, size, overlap) {
  const chunks = []
  let group = []
  let fresh = 0 // group 중 겹침으로 넘겨받지 않은 새 단위 수 (0이면 직전 청크의 일부라 내보내지 않는다)
  const flush = () => {
    if (!fresh) {
      group = []
      return
    }
    chunks.push({ start: group[0].start, end: group[group.length - 1].end })
    const carry = []
    for (let i = group.length - 1; i >= 0; i--) {
      if (group[group.length - 1].end - group[i].start > overlap) break
      carry.unshift(group[i])
    }
    // 겹침이 그룹 전체면 다음 청크가 앞으로 나아가지 못하므로 넘기지 않는다
    group = carry.length < group.length ? carry : []
    fresh = 0
  }
  for (const unit of units) {
    if (unit.end - unit.start > size) {
      flush()
      group = []
      for (const c of chunkFixed('x'.repeat(unit.end - unit.start), size, overlap)) {
        chunks.push({ start: unit.start + c.start, end: unit.start + c.end })
      }
      continue
    }
    if (group.length && unit.end - group[0].start > size) flush()
    // 겹침으로 넘긴 단위와 새 단위를 합쳐도 size를 넘으면 겹침을 버린다
    if (group.length && unit.end - group[0].start > size) group = []
    group.push(unit)
    fresh++
  }
  flush()
  return chunks
}

export const CHUNK_STRATEGIES = {
  fixed: { label: '고정 길이', help: '정해진 글자 수마다 자른다. 단어·문장 중간에서 끊길 수 있다.' },
  sentence: { label: '문장 단위', help: '문장 경계에서 자르고, 문장을 글자 수 한도까지 묶는다.' },
  paragraph: { label: '문단 단위', help: '빈 줄로 나눈 문단을 한도까지 묶는다. 긴 문단은 고정 길이로 자른다.' },
}

export function chunkText(text, { strategy, size, overlap: rawOverlap }) {
  const overlap = Math.min(rawOverlap, size - 1)
  let ranges
  if (strategy === 'sentence') {
    // 문장 끝 구두점·줄바꿈까지를 한 문장으로 본다 (구두점으로 시작하는 '...' 같은 구간도 빠뜨리지 않는다)
    ranges = groupUnits(splitUnits(text, /[^.!?。\n]*[.!?。\n]+\s*|[^.!?。\n]+$/g), size, overlap)
  } else if (strategy === 'paragraph') {
    ranges = groupUnits(splitUnits(text, /[\s\S]+?(?:\n\s*\n\s*|$)/g), size, overlap)
  } else {
    ranges = chunkFixed(text, size, overlap)
  }
  return ranges
    .map(({ start, end }) => ({ start, end, text: text.slice(start, end).trim() }))
    .filter((c) => c.text)
    .map((c, index) => ({ ...c, index }))
}

// 원문을 청크 경계로 쪼갠 조각들. covers는 그 조각을 포함하는 청크 번호 목록(2개 이상이면 겹침)
export function segmentByChunks(text, chunks) {
  const cuts = new Set([0, text.length])
  for (const c of chunks) {
    cuts.add(c.start)
    cuts.add(c.end)
  }
  const points = [...cuts].sort((a, b) => a - b)
  const segments = []
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i], points[i + 1]]
    const covers = chunks.filter((c) => c.start <= start && end <= c.end).map((c) => c.index)
    segments.push({ start, end, text: text.slice(start, end), covers })
  }
  return segments
}

// ---------- 토큰화 ----------

// 글자·숫자 묶음을 토큰으로 본다 (실제 모델은 BPE 같은 서브워드 토크나이저를 쓴다)
export function tokenize(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

// ---------- 임베딩 ----------

// FNV-1a 32비트 해시 (ragModel.js에서 청크 변경 감지에도 쓴다)
export function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function addFeature(vec, feature, weight) {
  const h = hash(feature)
  vec[h % vec.length] += (h & 0x80000000 ? -1 : 1) * weight
}

// 토큰(가중치 1)과 토큰 안의 글자 bigram(0.5)을 해시해 더한 뒤 길이 1로 정규화한다.
// bigram 덕분에 '임베딩은'과 '임베딩을'처럼 조사만 다른 단어도 비슷한 벡터가 된다.
// extra는 [특징 이름, 가중치] 목록으로, 토큰 말고 더 넣을 특징이다(ragModel.js의 개념 사전).
export function embed(tokens, dim = EMBEDDING_DIM, extra = []) {
  const vec = new Array(dim).fill(0)
  for (const tok of tokens) {
    addFeature(vec, `w:${tok}`, 1)
    for (let i = 0; i < tok.length - 1; i++) addFeature(vec, `c:${tok.slice(i, i + 2)}`, 0.5)
  }
  for (const [feature, weight] of extra) addFeature(vec, feature, weight)
  const norm = Math.hypot(...vec)
  return norm ? vec.map((v) => v / norm) : vec
}

// 두 벡터 모두 길이 1이므로 내적이 곧 코사인 유사도다
export function cosine(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

// ---------- 2차원 투영 (PCA) ----------

// 공분산 행렬의 주성분 2개를 거듭제곱법으로 구한다. 반환한 project(vec)로 질문 벡터도 같은 평면에 놓는다.
export function pca2d(vectors) {
  const dim = vectors[0]?.length ?? 0
  const mean = new Array(dim).fill(0)
  for (const v of vectors) v.forEach((x, i) => (mean[i] += x / vectors.length))
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]))

  const cov = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      if (!v[i]) continue
      for (let j = 0; j < dim; j++) cov[i][j] += v[i] * v[j]
    }
  }

  const components = []
  for (let k = 0; k < 2; k++) {
    // 결과가 매번 같도록 난수 대신 고정된 시작 벡터를 쓴다
    let b = Array.from({ length: dim }, (_, i) => Math.sin(i * 12.9898 + k * 78.233))
    for (let iter = 0; iter < 100; iter++) {
      const next = cov.map((row) => cosine(row, b))
      const norm = Math.hypot(...next)
      if (!norm) break
      b = next.map((x) => x / norm)
    }
    const lambda = cosine(b, cov.map((row) => cosine(row, b)))
    // 찾은 성분을 빼서(deflation) 다음 성분을 구한다
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) cov[i][j] -= lambda * b[i] * b[j]
    components.push(b)
  }

  const project = (v) => {
    const c = v.map((x, i) => x - mean[i])
    return components.map((comp) => cosine(c, comp))
  }
  return { points: vectors.map(project), project }
}

// ---------- 전체 파이프라인 ----------

export function buildIndex(text, options) {
  const chunks = chunkText(text, options).map((c) => {
    const tokens = tokenize(c.text)
    return { ...c, tokens, vector: embed(tokens) }
  })
  const { points, project } = pca2d(chunks.map((c) => c.vector))
  return {
    chunks: chunks.map((c, i) => ({ ...c, point: points[i] })),
    segments: segmentByChunks(text, chunks),
    project,
  }
}

export function search(index, query, topK) {
  const tokens = tokenize(query)
  const vector = embed(tokens)
  const scored = index.chunks
    .map((c) => ({ index: c.index, score: cosine(vector, c.vector) }))
    .sort((a, b) => b.score - a.score)
  return { query, tokens, vector, point: index.project(vector), scored, top: scored.slice(0, topK) }
}

export function buildPrompt(index, result) {
  const context = result.top
    .map((r, i) => `[문서 ${i + 1}] (청크 #${r.index + 1}, 유사도 ${r.score.toFixed(3)})\n${index.chunks[r.index].text}`)
    .join('\n\n')
  return `아래 문서만 근거로 질문에 답하세요. 문서에 없는 내용은 모른다고 답하세요.\n\n${context}\n\n질문: ${result.query}`
}
