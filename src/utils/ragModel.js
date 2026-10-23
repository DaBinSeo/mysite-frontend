// RAG 구축 전 과정 화면(/rag/*)이 함께 쓰는 학습용 계산 모음.
// 가상의 '햇살 도서관' 이용 안내 문서로 지식 베이스를 만들고, 전처리 → 청킹·임베딩 → 인덱스 → 질의 변환 →
// 하이브리드 검색 → 재순위화 → 답변 생성 → 평가 → 운영 계산을 브라우저에서 흉내 낸다.
import { chunkColor, chunkText, cosine, embed, hash, pca2d, tokenize } from './rag.js'
import { makeRng } from './random.js'

export const KB_DIM = 128
export const KB_CHUNK = { strategy: 'sentence', size: 110, overlap: 0 }
export const NEAR_DUP_THRESHOLD = 0.6

// ---------- 1. 원본 문서 (형식이 제각각인 수집 결과) ----------

const HOURS_TEXT = `운영 시간·휴관일

자료실은 평일 오전 9시부터 오후 10시까지, 주말은 오전 9시부터 오후 6시까지 엽니다.
열람실은 매일 오전 7시부터 오후 11시까지 이용할 수 있습니다.
매주 월요일과 법정 공휴일은 휴관합니다. 단, 월요일이 공휴일이면 다음 날 쉽니다.`

// access: public(누구나) / staff(직원만). 9단계 권한 필터에서 쓴다
export const RAW_SOURCES = [
  {
    id: 'loan', title: '대출·반납 안내', format: 'html', category: '대출', updated: '2026-09-01', access: 'public',
    raw: `<html><head><script>trackVisit()</script></head><body>
<nav>홈 | 이용 안내 | 자료 검색 | 로그인</nav>
<h1>대출·반납 안내</h1>
<p>회원증이 있으면 누구나 책을 대출할 수 있습니다. 한 사람이 한 번에 최대 7권까지 빌릴 수 있고, 대출 기간은 14일입니다.</p>
<p>반납은 1층 안내 데스크나 정문 옆 무인 반납함에서 할 수 있습니다. 무인 반납함은 휴관일에도 이용할 수 있습니다.</p>
<p>DVD와 잡지 최신호는 관내에서만 볼 수 있고 대출되지 않습니다.</p>
<footer>© 햇살 도서관. 모든 권리 보유.</footer>
</body></html>`,
  },
  {
    id: 'overdue', title: '연체·대출 연장 규정', format: 'markdown', category: '대출', updated: '2026-08-20', access: 'public',
    raw: `# 연체·대출 연장 규정

## 대출 연장
- 반납 예정일 전에 도서관 앱이나 안내 데스크에서 **한 번** 연장할 수 있으며, 연장하면 기간이 7일 늘어납니다.
- 다른 회원이 예약한 책은 연장할 수 없습니다.

## 연체
- 반납 예정일을 넘기면 연체된 날짜만큼 대출이 정지됩니다. 예를 들어 3일 늦게 반납하면 3일 동안 책을 빌릴 수 없습니다.
- 연체료(벌금)는 받지 않습니다.
- 책을 잃어버리거나 훼손하면 같은 책으로 변상해야 합니다.`,
  },
  {
    id: 'reading', title: '열람실 이용', format: 'html', category: '시설', updated: '2026-07-15', access: 'public',
    raw: `<nav>이전 | 다음 | 인쇄</nav>
<h2>열람실 이용</h2>
<p>2층 일반 열람실은 자리를 맡지 않고 누구나 이용합니다. 3층 노트북석은 콘센트가 있는 좌석 40석이며, 키오스크에서 좌석을 배정받아 4시간씩 쓸 수 있습니다.</p>
<p>열람실에서는 뚜껑 있는 음료만 마실 수 있고 음식은 먹을 수 없습니다. 통화는 복도에서 해 주세요.</p>
<p>&nbsp;&nbsp;이 페이지가 도움이 되었나요? 예 / 아니요</p>`,
  },
  {
    id: 'card', title: '회원증 발급', format: 'text', category: '회원', updated: '2026-06-30', access: 'public',
    raw: `회원증 발급



신분증을 가지고 1층 안내 데스크에 오면 바로 회원증을 만들어 드립니다.    발급 비용은 없습니다.
만 14세 미만 어린이는 보호자와 함께 와야 합니다.
회원증을 잃어버리면 재발급 비용 1,000원을 내고 다시 받을 수 있습니다.
모바일 회원증은 도서관 앱에 로그인하면 바로 쓸 수 있습니다.`,
  },
  {
    id: 'ebook', title: '전자책 서비스', format: 'markdown', category: '전자책', updated: '2026-09-10', access: 'public',
    raw: `# 전자책 서비스

회원이면 도서관 앱에서 전자책을 무료로 빌려 볼 수 있습니다.

| 항목 | 내용 |
|---|---|
| 전자책 대출 권수 | 최대 5권 |
| 전자책 대출 기간 | 7일 |

대출 기간이 끝나면 전자책은 자동으로 반납되므로 연체가 생기지 않습니다. 오디오북도 같은 방식으로 이용합니다.`,
  },
  {
    id: 'hours', title: '운영 시간·휴관일', format: 'text', category: '운영', updated: '2026-09-05', access: 'public',
    raw: HOURS_TEXT,
  },
  {
    id: 'parking', title: '주차·찾아오는 길', format: 'html', category: '시설', updated: '2026-05-12', access: 'public',
    raw: `<header>햇살 도서관 · 이용 안내</header>
<h2>주차·찾아오는 길</h2>
<p>도서관 지하 1층에 주차장 30면이 있습니다. 도서관을 이용하면 주차는 2시간까지 무료이고, 이후 30분마다 500원입니다.</p>
<p>버스는 햇살공원 정류장에서 내려 5분 걸으면 됩니다. 주차 공간이 적으니 대중교통을 이용해 주세요.</p>
<footer>© 햇살 도서관</footer>`,
  },
  {
    id: 'program', title: '문화 프로그램', format: 'html', category: '행사', updated: '2026-09-15', access: 'public',
    raw: `<h2>문화 프로그램</h2>
<p>매주 토요일 오전 10시에 4층 강당에서 어린이 그림책 읽기 모임이 열립니다. 신청은 행사 3일 전까지 도서관 앱에서 받습니다.</p>
<p>매달 마지막 수요일 저녁 7시에는 저자 초청 강연이 있습니다. 강연은 선착순 50명이며 무료입니다.</p>`,
  },
  {
    id: 'stack', title: '보존서고 관리 지침 (직원용)', format: 'markdown', category: '직원', updated: '2026-04-01', access: 'staff',
    raw: `# 보존서고 관리 지침 (직원용)

- 지하 2층 보존서고는 직원만 출입한다.
- 이용자가 보존서고 자료를 신청하면 30분 안에 꺼내 안내 데스크로 전달한다.
- 보존서고 온도는 18~22도, 습도는 40~55%로 유지한다.`,
  },
  {
    // 같은 문서가 다른 경로로 한 번 더 수집됨 (공백만 다름)
    id: 'hours-copy', title: '운영 시간·휴관일', format: 'text', category: '운영', updated: '2026-09-05', access: 'public',
    raw: HOURS_TEXT.replace(/ /g, '  '),
  },
  {
    // 예전 버전: 대출 권수가 5권이던 시절 문서. 남겨 두면 틀린 근거가 검색된다
    id: 'loan-2025', title: '대출·반납 안내', format: 'text', category: '대출', updated: '2025-03-02', access: 'public',
    raw: `대출·반납 안내

회원증이 있으면 누구나 책을 대출할 수 있습니다. 한 사람이 한 번에 최대 5권까지 빌릴 수 있고, 대출 기간은 14일입니다.
반납은 1층 안내 데스크나 정문 옆 무인 반납함에서 할 수 있습니다. 무인 반납함은 휴관일에도 이용할 수 있습니다.`,
  },
]

// ---------- 전처리: 본문 추출 → 정제 → 중복 제거 ----------

const DROP_TAGS = ['script', 'style', 'nav', 'header', 'footer']
// 내용과 상관없는 안내 문구(머리말·꼬리말·설문)
export const BOILERPLATE = [/도움이 되었나요/, /모든 권리 보유/, /^©/]

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

// HTML: 본문이 아닌 태그(스크립트·메뉴·머리말·꼬리말)를 통째로 지우고, 블록 태그는 줄바꿈으로 바꾼 뒤 나머지 태그를 벗긴다
function extractHtml(raw) {
  let s = raw
  const removed = []
  for (const tag of DROP_TAGS) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), (m) => {
      removed.push(`<${tag}> ${m.replace(/<[^>]+>/g, '').trim()}`)
      return ''
    })
  }
  s = s.replace(/<\/(p|h[1-6]|li|div|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  return { text: decodeEntities(s), removed }
}

// 마크다운: 제목·목록·굵게 표시를 벗기고, 표는 "항목: 값" 문장으로 바꾼다(표 모양 그대로는 검색이 잘 안 된다)
function extractMarkdown(raw) {
  const lines = raw.split('\n')
  const out = []
  const removed = []
  const isRow = (l) => /^\|.*\|$/.test(l?.trim() ?? '')
  const isSep = (l) => /^\|[\s:|-]+\|$/.test(l?.trim() ?? '')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isSep(line)) continue
    if (isRow(line)) {
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim())
      if (isSep(lines[i + 1])) removed.push(`표 머리행 | ${cells.join(' | ')} |`)
      else out.push(`${cells[0]}: ${cells.slice(1).join(', ')}`)
      continue
    }
    out.push(line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'))
  }
  return { text: out.join('\n'), removed }
}

// 공백 정리와 안내 문구 줄 삭제
function cleanText(text) {
  const boilerplate = []
  const lines = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[ \t ]+/g, ' ').trim()
    if (line && BOILERPLATE.some((re) => re.test(line))) boilerplate.push(line)
    else lines.push(line)
  }
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), boilerplate }
}

// 글자 3-gram 묶음 (공백 무시). 두 문서의 겹침(Jaccard)으로 거의 같은 문서를 찾는다
function shingles(text) {
  const s = text.replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3))
  return set
}

export function jaccard(a, b) {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / Math.max(1, a.size + b.size - inter)
}

export function extractDoc(src) {
  const extracted = src.format === 'html' ? extractHtml(src.raw)
    : src.format === 'markdown' ? extractMarkdown(src.raw)
      : { text: src.raw, removed: [] }
  const cleaned = cleanText(extracted.text)
  return {
    ...src,
    extracted: extracted.text,
    removed: extracted.removed,
    boilerplate: cleaned.boilerplate,
    text: cleaned.text,
    hash: hash(cleaned.text.replace(/\s+/g, '')),
    shingles: shingles(cleaned.text),
  }
}

// 최신 문서부터 보면서, 이미 남긴 문서와 내용이 같으면(해시) 완전 중복, 비슷하면(Jaccard ≥ threshold) 옛 버전으로 거른다
export function ingest(threshold = NEAR_DUP_THRESHOLD) {
  const docs = RAW_SOURCES.map(extractDoc)
  const pairs = []
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const sim = jaccard(docs[i].shingles, docs[j].shingles)
      pairs.push({ a: docs[i].id, b: docs[j].id, sim })
    }
  }
  pairs.sort((x, y) => y.sim - x.sim)
  const kept = []
  const status = {}
  const order = [...docs].sort((a, b) => b.updated.localeCompare(a.updated) || docs.indexOf(a) - docs.indexOf(b))
  for (const doc of order) {
    const same = kept.find((k) => k.hash === doc.hash)
    if (same) {
      status[doc.id] = { kind: 'exact', of: same.id, sim: 1 }
      continue
    }
    const near = kept.map((k) => ({ k, sim: jaccard(k.shingles, doc.shingles) })).find((x) => x.sim >= threshold)
    if (near) {
      status[doc.id] = { kind: 'near', of: near.k.id, sim: near.sim }
      continue
    }
    status[doc.id] = { kind: 'kept' }
    kept.push(doc)
  }
  return { docs, pairs, status, kept: docs.filter((d) => status[d.id].kind === 'kept') }
}

// ---------- 2. 용어 정규화·개념 사전 ----------

// 한국어 조사·어미를 떼어 검색어를 맞춘다(형태소 분석기의 아주 작은 흉내).
// '은·는·을·를' 같은 조사는 한 글자 말('책은')에서도 떼고, 낱말의 일부이기 쉬운 '도·과·이' 등은 남는 말이 두 글자 이상일 때만 뗀다
// (문서와 질문에 같은 규칙을 쓰므로 '어린이 → 어린'처럼 더 떼어도 서로 맞는다)
const LONG_SUFFIX = ['에서는', '에서도', '으로는', '이에요', '인가요', '하나요', '하려면', '입니다', '에서', '이며', '이고', '에게', '으로', '까지', '부터', '에도', '에는', '하면', '나요', '예요', '이나']
const JOSA = ['은', '는', '을', '를', '에', '의']
const SHORT_SUFFIX = ['이', '가', '도', '와', '과', '로', '만', '요']
const STOPWORDS = new Set([
  '수', '있나요', '있습니다', '있고', '있으며', '있어요', '있는', '없나요', '할', '및', '등', '어떻게', '되나요', '무엇', '언제', '어디',
  '얼마', '얼마예요', '몇', '그', '저', '합니다', '됩니다', '입니다', '해', '주세요', '뭐', '좀', '하나', '알려', '줘', '데', '것', '때', '드', '하',
  ...JOSA, ...SHORT_SUFFIX,
])

function stripOnce(token) {
  for (const s of LONG_SUFFIX) {
    if (token.length > s.length && token.endsWith(s)) return token.slice(0, -s.length)
  }
  for (const s of JOSA) {
    if (token.length > 1 && token.endsWith(s)) return token.slice(0, -1)
  }
  for (const s of SHORT_SUFFIX) {
    if (token.length >= 3 && token.endsWith(s)) return token.slice(0, -1)
  }
  return token
}

// 조사가 겹친 말('기간은요')도 처리하도록 두 번까지 뗀다
export function normalizeTerm(token) {
  return stripOnce(stripOnce(token))
}

// 검색어 목록: 불용어는 떼기 전·후 모두 거른다('주세요'가 '주세'로 남지 않게).
// '7권'처럼 숫자 + 단위인 말은 단위('권')도 넣어 '몇 권'과 맞게 한다
export function termsOf(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t)).map(normalizeTerm)
    .flatMap((t) => {
      const unit = /^\d+([가-힣]+)$/.exec(t)?.[1]
      return unit ? [t, unit] : [t]
    })
    .filter((t) => t && !STOPWORDS.has(t))
}

// 리랭커·답변 문장 고르기용 느슨한 비교: 같은 말이거나, 한쪽이 다른 쪽으로 시작하거나('주차비'·'주차'),
// 둘 다 세 글자 이상이고 앞 두 글자가 같으면('예약된'·'예약한' 같은 활용형) 같은 말로 본다.
// 숫자로 시작하는 말('5권'·'7권')은 정확히 같아야 한다
export function looseMatch(a, b) {
  if (a === b) return true
  if (/^\d/.test(a) || /^\d/.test(b) || Math.min(a.length, b.length) < 2) return false
  if (a.startsWith(b) || b.startsWith(a)) return true
  return Math.min(a.length, b.length) >= 3 && a.slice(0, 2) === b.slice(0, 2)
}

// 개념 사전: 뜻이 같은 표현을 한 개념으로 묶는다. 실제 임베딩 모델이 대량의 문장에서 배우는 "뜻이 비슷하다"는 지식의 대용품이다.
// 토큰이 이 어간으로 시작하면 그 개념을 가진 것으로 본다
export const CONCEPTS = {
  대출: ['대출', '빌리', '빌려', '빌릴', '대여'],
  반납: ['반납', '돌려'],
  연체: ['연체', '늦게', '늦으', '늦은', '넘기'],
  연장: ['연장', '늘리', '늘릴', '늘려', '늘어'],
  비용: ['비용', '요금', '연체료', '벌금', '무료', '유료', '돈', '주차비', '얼마'],
  시간: ['시간', '오전', '오후', '언제', '열어', '여나', '엽니다', '운영'],
  휴관: ['휴관', '쉬', '쉽니다', '닫'],
  주차: ['주차', '차량', '자동차', '운전', '차를'],
  좌석: ['좌석', '자리', '노트북', '콘센트'],
  음식: ['음식', '음료', '먹', '마시', '커피', '간식'],
  회원증: ['회원증', '회원카드', '신분증', '가입'],
  분실: ['잃어', '분실', '잃어버'],
  전자책: ['전자책', '이북', '오디오북'],
  교통: ['버스', '지하철', '대중교통', '찾아', '정류장', '위치'],
  행사: ['프로그램', '강연', '행사', '모임', '강좌'],
  어린이: ['어린이', '아이', '아동', '자녀', '보호자'],
  서고: ['서고', '보존'],
}
const CONCEPT_WEIGHT = 2

export function conceptsOf(tokens) {
  const found = new Set()
  for (const tok of tokens) {
    for (const [name, stems] of Object.entries(CONCEPTS)) {
      if (stems.some((s) => tok.startsWith(s))) found.add(name)
    }
  }
  return [...found]
}

// 학습용 '의미 임베딩': 단어·글자 조각 해시(rag.js) + 개념 특징. 개념 덕분에 '늦게 돌려주면'과 '연체·반납'이 가까워진다.
// 긴 청크에서도 개념이 단어 특징에 묻히지 않도록 개념 가중치를 토큰 수의 제곱근에 비례시킨다
export function denseEmbed(text) {
  const tokens = tokenize(text)
  const weight = CONCEPT_WEIGHT * Math.sqrt(Math.max(4, tokens.length) / 4)
  return embed(tokens, KB_DIM, conceptsOf(tokens).map((c) => [`k:${c}`, weight]))
}

// ---------- 3. 지식 베이스 (청크 + 벡터 + BM25 통계) ----------

// 본문 첫 줄의 제목은 메타데이터로 따로 있으므로 떼고 나눈다
export function bodyOf(doc) {
  const [first, ...rest] = doc.text.split('\n')
  return first.trim() === doc.title ? rest.join('\n').trim() : doc.text
}

// 청크마다 문서 제목을 머리말로 붙여 색인한다(청크만 보면 무슨 문서인지 모를 때를 대비)
function buildChunks(docs) {
  return docs.flatMap((doc) => chunkText(bodyOf(doc), KB_CHUNK).map((c, n) => {
    const indexed = `${doc.title} ${c.text}`
    return {
      id: `${doc.id}#${n + 1}`, docId: doc.id, title: doc.title, category: doc.category,
      updated: doc.updated, access: doc.access, n, text: c.text,
      terms: termsOf(indexed),
      concepts: conceptsOf(tokenize(indexed)),
      vector: denseEmbed(indexed),
    }
  }))
}

function bm25Stats(chunks) {
  const df = new Map()
  for (const c of chunks) for (const t of new Set(c.terms)) df.set(t, (df.get(t) ?? 0) + 1)
  const avgdl = chunks.reduce((s, c) => s + c.terms.length, 0) / Math.max(1, chunks.length)
  return { df, avgdl, N: chunks.length }
}

const INGESTED = ingest()
export const KB_DOCS = INGESTED.kept
export const KB_CHUNKS = buildChunks(KB_DOCS)
const STATS = bm25Stats(KB_CHUNKS)
const PROJECTION = pca2d(KB_CHUNKS.map((c) => c.vector))
KB_CHUNKS.forEach((c, i) => { c.point = PROJECTION.points[i] })
export const projectPoint = PROJECTION.project

// 문서마다 고정 색 (청크 배지·그림에서 같은 문서는 같은 색)
export function docColor(docId) {
  return chunkColor(Math.max(0, KB_DOCS.findIndex((d) => d.id === docId)))
}

export function docTitle(docId) {
  return RAW_SOURCES.find((d) => d.id === docId)?.title ?? docId
}

// ---------- 4. 질의 분석·변환 ----------

export function analyzeQuery(query) {
  const tokens = tokenize(query)
  return { query, tokens, terms: termsOf(query), concepts: conceptsOf(tokens), vector: denseEmbed(query) }
}

// 동의어 확장: 질문에서 찾은 개념의 대표어를 검색어에 덧붙인다(키워드 검색이 다른 표현을 놓치지 않게)
export function expandTerms(q) {
  return [...new Set([...q.terms, ...q.concepts])]
}

// 리랭커·답변용 핵심어: 개념 + 개념으로 설명되지 않는 검색어('빌릴'은 '대출' 개념에 들어가므로 따로 세지 않는다)
export function keyTerms(q) {
  const rest = q.terms.filter((t) => !conceptsOf([t]).length)
  return [...new Set([...q.concepts, ...rest])]
}

// 질문을 여러 개로 쪼갠다: '그리고'·'또'·'랑'·물음표·쉼표에서 나눈다(실제로는 LLM에게 하위 질문을 만들게 한다)
export function splitQuery(query) {
  const parts = query.split(/\?|？|,|그리고|또한|\s또\s|하고\s|이랑\s|고\s(?=[가-힣]+(?:은|는)\s)/).map((s) => s.trim()).filter((s) => termsOf(s).length)
  return parts.length ? parts : [query]
}

// 분류 필터 추출: 질문에 분류를 대표하는 개념이 있으면 그 분류만 검색하도록 제안한다
const CATEGORY_HINTS = { 전자책: '전자책', 행사: '행사', 주차: '시설', 좌석: '시설', 회원증: '회원', 휴관: '운영' }
export function suggestFilter(q) {
  const hit = q.concepts.find((c) => CATEGORY_HINTS[c])
  return hit ? { field: 'category', value: CATEGORY_HINTS[hit], because: hit } : null
}

// ---------- 5. 검색: BM25·벡터·하이브리드 ----------

export const BM25 = { k1: 1.2, b: 0.75 }

export function bm25Score(terms, chunk) {
  let score = 0
  for (const t of new Set(terms)) {
    const df = STATS.df.get(t)
    if (!df) continue
    const tf = chunk.terms.filter((x) => x === t).length
    if (!tf) continue
    const idf = Math.log(1 + (STATS.N - df + 0.5) / (df + 0.5))
    score += idf * (tf * (BM25.k1 + 1)) / (tf + BM25.k1 * (1 - BM25.b + BM25.b * chunk.terms.length / STATS.avgdl))
  }
  return score
}

export function idfOf(term) {
  const df = STATS.df.get(term) ?? 0
  return df ? Math.log(1 + (STATS.N - df + 0.5) / (df + 0.5)) : 0
}

const MEAN_IDF = [...STATS.df.keys()].reduce((s, t) => s + idfOf(t), 0) / Math.max(1, STATS.df.size)

// 점수 배열 → 순위(1부터). 점수가 0 이하인 키워드 결과는 '못 찾음'(Infinity)으로 둔다
function ranksOf(scores, dropZero) {
  const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a])
  const ranks = new Array(scores.length).fill(Infinity)
  let r = 0
  for (const i of order) if (!(dropZero && scores[i] <= 0)) ranks[i] = ++r
  return ranks
}

function minMax(values) {
  const finite = values.filter((v) => v > -Infinity)
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  return values.map((v) => (hi > lo ? (v - lo) / (hi - lo) : v > 0 ? 1 : 0))
}

export const RRF_K = 60

// 권한(role)에 맞는 청크만 남긴다. 직원은 모두, 일반 이용자는 공개 문서만
export function allowed(chunk, role) {
  return role === 'staff' || chunk.access === 'public'
}

// 하나의 질의로 모든 방식의 점수를 계산해 둔다. 결과 행: { chunk, bm25, vector, bmRank, vecRank, rrf, weighted }
export function scoreAll(query, { role = 'public', expand = false, alpha = 0.5, filter = null, chunks = KB_CHUNKS } = {}) {
  const q = analyzeQuery(query)
  const terms = expand ? expandTerms(q) : q.terms
  const pool = chunks.filter((c) => allowed(c, role) && (!filter || c[filter.field] === filter.value))
  const bm = pool.map((c) => bm25Score(terms, c))
  const vec = pool.map((c) => cosine(q.vector, c.vector))
  const bmRank = ranksOf(bm, true)
  const vecRank = ranksOf(vec, false)
  const nb = minMax(bm)
  const nv = minMax(vec)
  const rows = pool.map((chunk, i) => ({
    chunk, bm25: bm[i], vector: vec[i], bmRank: bmRank[i], vecRank: vecRank[i],
    rrf: (Number.isFinite(bmRank[i]) ? 1 / (RRF_K + bmRank[i]) : 0) + 1 / (RRF_K + vecRank[i]),
    weighted: alpha * nv[i] + (1 - alpha) * nb[i],
  }))
  return { q, terms, rows }
}

export function rankRows(rows, key) {
  return [...rows].sort((a, b) => b[key] - a[key] || a.chunk.id.localeCompare(b.chunk.id))
}

// ---------- 6. 재순위화·다양성 ----------

// 질문 핵심어의 중요도: 드문 말일수록 크다(IDF). 색인에 없는 말은 평균 중요도로 본다
function termWeight(term) {
  return idfOf(term) || MEAN_IDF
}

// 개념은 개념끼리만 비교한다('회원증' 개념이 '회원이면'과 느슨하게 맞지 않게)
function hasTerm(chunk, term) {
  return CONCEPTS[term] ? chunk.concepts.includes(term) : chunk.terms.some((t) => looseMatch(t, term))
}

// 리랭커(크로스 인코더) 흉내: 질문과 청크를 '같이' 보고 채점한다.
// coverage = 질문의 핵심어·개념 중 청크에 있는 것의 비율(IDF 가중), proximity = 맞은 단어들이 청크 안에서 얼마나 붙어 있는지
export function rerankScore(q, chunk) {
  const need = keyTerms(q)
  if (!need.length) return { score: 0, coverage: 0, proximity: 0, matched: [] }
  const matched = need.filter((t) => hasTerm(chunk, t))
  const coverage = matched.reduce((s, t) => s + termWeight(t), 0) / need.reduce((s, t) => s + termWeight(t), 0)
  const positions = chunk.terms.map((t, i) => (q.terms.some((x) => looseMatch(x, t)) ? i : -1)).filter((i) => i >= 0)
  const proximity = positions.length >= 2
    ? Math.min(1, new Set(positions.map((p) => chunk.terms[p])).size / (Math.max(...positions) - Math.min(...positions) + 1) * 2)
    : coverage
  return { score: 0.7 * coverage + 0.3 * proximity, coverage, proximity, matched }
}

// 하이브리드(RRF) 상위 후보를 리랭커 점수로 다시 정렬한다
export function rerank(query, { candidates = 10, role = 'public' } = {}) {
  const { q, rows } = scoreAll(query, { role })
  const before = rankRows(rows, 'rrf').slice(0, candidates)
  const scored = before.map((row, i) => ({ ...row, before: i + 1, ...rerankScore(q, row.chunk) }))
  const after = [...scored].sort((a, b) => b.score - a.score || a.before - b.before)
  return { q, before: scored, after }
}

// MMR: 관련도는 높으면서 이미 고른 것과는 덜 비슷한 청크를 하나씩 고른다. λ=1이면 관련도만, 0이면 다양성만
export function mmr(items, k, lambda) {
  const rel = minMax(items.map((it) => it.score))
  const picked = []
  const left = items.map((it, i) => ({ it, rel: rel[i] }))
  while (picked.length < k && left.length) {
    let best = 0
    let bestVal = -Infinity
    left.forEach((cand, i) => {
      const redundancy = picked.length ? Math.max(...picked.map((p) => cosine(p.it.chunk.vector, cand.it.chunk.vector))) : 0
      const val = lambda * cand.rel - (1 - lambda) * redundancy
      if (val > bestVal) [best, bestVal] = [i, val]
    })
    const [chosen] = left.splice(best, 1)
    const redundancy = picked.length ? Math.max(...picked.map((p) => cosine(p.it.chunk.vector, chosen.it.chunk.vector))) : 0
    picked.push({ ...chosen, redundancy, value: bestVal })
  }
  return picked
}

// ---------- 7. 컨텍스트 구성·답변 생성 ----------

// 한국어는 대략 1.5글자가 토큰 1개라고 어림한다(토크나이저마다 다르다)
export function estimateTokens(text) {
  return Math.ceil(text.replace(/\s+/g, '').length / 1.5)
}

export const SYSTEM_PROMPT = '당신은 햇살 도서관 안내원입니다. 아래 [자료]만 근거로 답하고, 문장 끝에 근거 번호를 [1]처럼 붙이세요. 자료에 없으면 "자료에서 찾지 못했습니다"라고 답하세요.'

// 예산(토큰) 안에 들어가는 만큼 근거를 넣는다. order='edges'면 중요한 것을 앞·뒤 끝에 둔다(가운데 내용을 놓치는 경향 대비)
export function packContext(items, budget, order = 'score') {
  const base = estimateTokens(SYSTEM_PROMPT) + 30
  let used = base
  const packed = []
  const dropped = []
  for (const it of items) {
    const cost = estimateTokens(it.chunk.text) + 8
    if (used + cost <= budget) {
      packed.push(it)
      used += cost
    } else dropped.push(it)
  }
  let arranged = packed
  if (order === 'edges') {
    const front = []
    const back = []
    packed.forEach((it, i) => (i % 2 === 0 ? front : back).push(it))
    arranged = [...front, ...back.reverse()]
  }
  return { packed: arranged, dropped, used, base }
}

export function buildRagPrompt(query, packed) {
  const sources = packed.map((it, i) => `[${i + 1}] (${it.chunk.title}, ${it.chunk.updated})\n${it.chunk.text}`).join('\n\n')
  return `${SYSTEM_PROMPT}\n\n[자료]\n${sources || '(없음)'}\n\n[질문]\n${query}`
}

export function splitSentences(text) {
  return (text.match(/[^.!?。\n]+[.!?。]?/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

// 생성 흉내(추출식): 근거 문장 중 질문의 핵심어·개념을 많이 담은 문장을 골라 출처 번호를 붙인다.
// 가장 좋은 근거의 리랭커 점수가 minScore보다 낮으면 답하지 않는다(환각 방지)
export function generateAnswer(q, packed, { minScore = 0.4, maxSentences = 2 } = {}) {
  const top = Math.max(0, ...packed.map((it) => it.score ?? 0))
  if (!packed.length || top < minScore) return { refused: true, top, sentences: [] }
  const need = keyTerms(q)
  // 소제목처럼 짧은 줄은 답변 문장으로 쓰지 않는다
  const cands = packed.flatMap((it, i) => splitSentences(it.chunk.text).filter((s) => s.length >= 12).map((text, j) => {
    const hit = need.filter((t) => hasTerm({ terms: termsOf(text), concepts: conceptsOf(tokenize(text)) }, t)).length
    return { text, source: i + 1, order: i * 100 + j, score: hit / Math.max(1, need.length) }
  }))
  // 가장 잘 맞는 문장의 60% 이상 맞는 문장만 덧붙인다(관련 적은 문장이 섞이지 않게)
  const best = Math.max(0, ...cands.map((c) => c.score))
  const chosen = cands.filter((c) => c.score > 0 && c.score >= best * 0.6)
    .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, maxSentences)
  if (!chosen.length) return { refused: true, top, sentences: [] }
  return { refused: false, top, sentences: chosen.sort((a, b) => a.order - b.order) }
}

// 질문 하나를 끝까지: 재순위화 → 상위 k개 → 예산 안에 배치 → 답변
export function answer(query, { k = 3, budget = 400, role = 'public', minScore = 0.4 } = {}) {
  const { q, after } = rerank(query, { role })
  const { packed } = packContext(after.slice(0, k), budget)
  return { q, packed, ...generateAnswer(q, packed, { minScore }) }
}

export function answerText(result) {
  return result.refused ? '자료에서 찾지 못했습니다.' : result.sentences.map((s) => `${s.text} [${s.source}]`).join(' ')
}

// 충실도 검사: 답변 문장의 핵심어가 근거 문장 하나에 얼마나 들어 있는지(가장 잘 맞는 근거 문장 기준)
// 숫자가 든 말('5권'·'100원')은 틀리면 치명적이므로 3배로 센다
export function supportOf(sentence, contextTexts) {
  const terms = [...new Set(termsOf(sentence.replace(/\[\d+\]/g, '')))]
  if (!terms.length) return { score: 1, best: '', missing: [] }
  const weight = (t) => (/\d/.test(t) ? 3 : 1)
  const total = terms.reduce((s, t) => s + weight(t), 0)
  let best = { score: 0, best: '', missing: terms }
  for (const ctx of contextTexts.flatMap(splitSentences)) {
    const ctxTerms = new Set(termsOf(ctx))
    const missing = terms.filter((t) => !ctxTerms.has(t))
    const score = 1 - missing.reduce((s, t) => s + weight(t), 0) / total
    if (score > best.score) best = { score, best: ctx, missing }
  }
  return best
}

// ---------- 8. 평가 ----------

// 정답 문서(relevant)와 답에 꼭 있어야 할 말(expect)을 표시한 평가 질문
export const EVAL_SET = [
  { q: '책은 몇 권까지 빌릴 수 있나요?', relevant: ['loan'], expect: '7권' },
  { q: '책을 늦게 돌려주면 어떻게 되나요?', relevant: ['overdue'], expect: '정지' },
  { q: '대출 기간을 늘릴 수 있나요?', relevant: ['overdue'], expect: '7일' },
  { q: '월요일에도 문을 여나요?', relevant: ['hours'], expect: '휴관' },
  { q: '노트북 쓸 수 있는 자리가 있나요?', relevant: ['reading'], expect: '노트북석' },
  { q: '차를 가져가면 주차비가 얼마예요?', relevant: ['parking'], expect: '2시간' },
  { q: '전자책 대출 기간은요?', relevant: ['ebook'], expect: '7일' },
  { q: '회원증을 잃어버렸어요', relevant: ['card'], expect: '1,000원' },
  { q: '아이와 함께 갈 만한 프로그램이 있나요?', relevant: ['program'], expect: '그림책' },
  { q: '휴관일에도 책을 반납할 수 있나요?', relevant: ['loan'], expect: '무인 반납함' },
  { q: 'DVD도 대출되나요?', relevant: ['loan'], expect: '관내' },
  { q: '저자 강연은 몇 명까지 들을 수 있어요?', relevant: ['program'], expect: '50명' },
]

export const EVAL_METHODS = {
  bm25: '키워드 (BM25)',
  vector: '벡터',
  hybrid: '하이브리드 (RRF)',
  rerank: '하이브리드 + 재순위화',
}

// 방식별 검색 결과(청크 순위 목록)
export function retrieveBy(method, query) {
  if (method === 'rerank') return rerank(query).after.map((r) => r.chunk)
  const { rows } = scoreAll(query)
  if (method === 'bm25') return rankRows(rows, 'bm25').filter((r) => r.bm25 > 0).map((r) => r.chunk)
  return rankRows(rows, method === 'vector' ? 'vector' : 'rrf').map((r) => r.chunk)
}

// 청크 단위 지표. 청크가 정답 문서에 속하면 정답으로 본다
export function retrievalMetrics(list, relevant, k) {
  const top = list.slice(0, k)
  const rel = top.map((c) => relevant.includes(c.docId))
  const firstHit = list.findIndex((c) => relevant.includes(c.docId))
  const totalRel = KB_CHUNKS.filter((c) => relevant.includes(c.docId) && c.access === 'public').length
  const dcg = rel.reduce((s, r, i) => s + (r ? 1 / Math.log2(i + 2) : 0), 0)
  const idcg = Array.from({ length: Math.min(k, totalRel) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0)
  return {
    hit: rel.some(Boolean) ? 1 : 0,
    recall: relevant.filter((d) => top.some((c) => c.docId === d)).length / relevant.length,
    precision: rel.filter(Boolean).length / k,
    mrr: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
    ndcg: idcg ? dcg / idcg : 0,
    firstHit: firstHit >= 0 ? firstHit + 1 : null,
  }
}

export function evaluateMethod(method, k) {
  const per = EVAL_SET.map((item) => {
    const list = retrieveBy(method, item.q)
    return { item, list, ...retrievalMetrics(list, item.relevant, k) }
  })
  const mean = (key) => per.reduce((s, p) => s + p[key], 0) / per.length
  return { per, hit: mean('hit'), recall: mean('recall'), precision: mean('precision'), mrr: mean('mrr'), ndcg: mean('ndcg') }
}

// ---------- 3단계: 벡터 인덱스 (IVF) ----------

// k-means로 벡터를 nlist개 묶음으로 나눈다. 시작 중심은 k-means++ 방식(멀리 떨어진 점을 우선)으로 고정 시드에서 고른다
export function kmeans(vectors, nlist, seed = 7, iters = 15) {
  const rng = makeRng(seed)
  const centroids = [vectors[Math.floor(rng() * vectors.length)]]
  while (centroids.length < nlist) {
    const d = vectors.map((v) => Math.min(...centroids.map((c) => 1 - cosine(v, c))))
    const total = d.reduce((a, b) => a + b, 0)
    let r = rng() * total
    let pick = d.findIndex((x) => (r -= x) <= 0)
    if (pick < 0) pick = d.length - 1
    centroids.push(vectors[pick])
  }
  let assign = []
  let cs = centroids
  for (let it = 0; it < iters; it++) {
    assign = vectors.map((v) => cs.reduce((best, c, j) => (cosine(v, c) > cosine(v, cs[best]) ? j : best), 0))
    cs = cs.map((old, j) => {
      const members = vectors.filter((_, i) => assign[i] === j)
      if (!members.length) return old
      const sum = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0))
      const norm = Math.hypot(...sum) || 1
      return sum.map((x) => x / norm)
    })
  }
  return { centroids: cs, assign }
}

// IVF 검색: 질문과 가까운 묶음 nprobe개 안에서만 비교한다. comparisons = 중심 비교 + 묶음 안 청크 비교 수
export function ivfSearch(ivf, chunks, qvec, nprobe, k) {
  const order = ivf.centroids.map((c, j) => ({ j, sim: cosine(qvec, c) })).sort((a, b) => b.sim - a.sim)
  const probed = new Set(order.slice(0, nprobe).map((o) => o.j))
  const cands = chunks.map((c, i) => ({ c, i })).filter(({ i }) => probed.has(ivf.assign[i]))
  const top = cands.map(({ c, i }) => ({ i, sim: cosine(qvec, c.vector) })).sort((a, b) => b.sim - a.sim).slice(0, k)
  return { probed, order, top, comparisons: ivf.centroids.length + cands.length }
}

export function exactSearch(chunks, qvec, k) {
  return chunks.map((c, i) => ({ i, sim: cosine(qvec, c.vector) })).sort((a, b) => b.sim - a.sim).slice(0, k)
}

// ---------- 9. 운영 ----------

// 문서를 고치면 청크를 다시 나눠 내용 해시로 비교한다. 같은 해시는 기존 벡터를 그대로 쓰고 바뀐 것만 다시 임베딩한다
export function diffChunks(oldText, newText) {
  const oldChunks = chunkText(oldText, KB_CHUNK).map((c) => ({ ...c, hash: hash(c.text) }))
  const newChunks = chunkText(newText, KB_CHUNK).map((c) => ({ ...c, hash: hash(c.text) }))
  const oldHashes = new Set(oldChunks.map((c) => c.hash))
  const newHashes = new Set(newChunks.map((c) => c.hash))
  return {
    rows: [
      ...newChunks.map((c) => ({ ...c, status: oldHashes.has(c.hash) ? 'same' : 'new' })),
      ...oldChunks.filter((c) => !newHashes.has(c.hash)).map((c) => ({ ...c, status: 'deleted' })),
    ],
  }
}

// 시맨틱 캐시: 예전 질문과 벡터가 충분히 비슷하면(≥ threshold) 검색·생성 없이 저장해 둔 답을 돌려준다
export function cacheLookup(query, cache, threshold) {
  const v = denseEmbed(query)
  const scored = cache.map((entry) => ({ ...entry, sim: cosine(v, entry.vector) })).sort((a, b) => b.sim - a.sim)
  return { scored, hit: scored[0] && scored[0].sim >= threshold ? scored[0] : null }
}

// 단계별 지연 시간 어림(ms). 실제 값은 모델·하드웨어마다 다르므로 비율만 본다
export const LATENCY = { embed: 20, search: 8, rerankPer: 12, prefillPerToken: 0.15, decodePerToken: 25, cache: 15 }

export function latency({ candidates, useRerank, contextTokens, answerTokens }) {
  return [
    { key: 'embed', label: '질문 임베딩', ms: LATENCY.embed },
    { key: 'search', label: '벡터·키워드 검색', ms: LATENCY.search },
    { key: 'rerank', label: `재순위화 (후보 ${candidates}개)`, ms: useRerank ? LATENCY.rerankPer * candidates : 0 },
    { key: 'prefill', label: `프롬프트 읽기 (${contextTokens}토큰)`, ms: Math.round(LATENCY.prefillPerToken * contextTokens) },
    { key: 'decode', label: `답변 생성 (${answerTokens}토큰)`, ms: LATENCY.decodePerToken * answerTokens },
  ]
}
