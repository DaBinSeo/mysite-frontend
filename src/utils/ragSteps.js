import { stepMenuItems } from './vizSteps.js'

// RAG 메뉴의 화면 목록. 네비게이션 드롭다운·전체 흐름 화면·이전/다음 버튼이 이 순서를 함께 쓴다
export const RAG_STEPS = [
  {
    path: '/rag/overview', group: '시작', label: '전체 흐름 한눈에 보기',
    desc: '문서를 미리 검색할 수 있게 만들어 두는 색인 단계(오프라인)와, 질문이 올 때마다 찾아서 답하는 단계(온라인)를 한 장의 지도로 본다.',
  },
  {
    path: '/rag/ingest', group: '색인 (오프라인)', num: 1, label: '문서 수집·전처리',
    desc: 'HTML·마크다운·텍스트 문서에서 본문만 뽑아 정리하고, 중복·옛 버전을 걸러 낸 뒤 분류·날짜·공개 범위 같은 메타데이터를 붙인다.',
    input: '원본 파일 (HTML·MD·TXT)', output: '정제된 문서 + 메타데이터',
  },
  {
    path: '/rag/build', group: '색인 (오프라인)', num: 2, label: '청킹·임베딩·벡터 저장',
    desc: '문서를 검색 단위인 청크로 나누고 청크마다 임베딩 벡터를 만들어 원문과 함께 저장한다. 직접 문서를 넣어 볼 수 있다.',
    input: '정제된 문서', output: '청크 + 벡터',
  },
  {
    path: '/rag/index', group: '색인 (오프라인)', num: 3, label: '벡터 인덱스·근사 검색',
    desc: '청크가 수백만 개여도 빠르게 찾도록 비슷한 벡터끼리 묶어(IVF) 일부 묶음만 뒤진다. 속도와 정확도를 맞바꾸는 지점을 본다.',
    input: '청크 벡터', output: '검색 인덱스',
  },
  {
    path: '/rag/query', group: '검색 (온라인)', num: 4, label: '질의 변환',
    desc: '질문을 정규화하고, 동의어를 덧붙이고, 여러 질문으로 쪼개고, 분류 필터를 뽑아 검색하기 좋은 형태로 바꾼다.',
    input: '사용자 질문', output: '검색 질의 (+ 필터)',
  },
  {
    path: '/rag/hybrid', group: '검색 (온라인)', num: 5, label: '하이브리드 검색',
    desc: '단어가 일치하는 청크를 찾는 키워드 검색(BM25)과 뜻이 비슷한 청크를 찾는 벡터 검색을 함께 돌리고 순위를 합친다(RRF).',
    input: '검색 질의', output: '후보 청크 목록',
  },
  {
    path: '/rag/rerank', group: '검색 (온라인)', num: 6, label: '재순위화·다양성',
    desc: '후보를 질문과 함께 다시 꼼꼼히 채점해 순서를 바로잡고(리랭커), 비슷한 내용이 겹치지 않게 골라(MMR) 최종 근거를 정한다.',
    input: '후보 청크', output: '최종 근거 top-k',
  },
  {
    path: '/rag/generate', group: '생성', num: 7, label: '컨텍스트 구성·답변 생성',
    desc: '토큰 예산 안에 근거를 배치해 프롬프트를 만들고, 근거 문장에 출처 번호를 붙여 답한다. 근거가 약하면 모른다고 답한다.',
    input: '질문 + 근거 청크', output: '출처가 달린 답변',
  },
  {
    path: '/rag/eval', group: '평가·운영', num: 8, label: '평가',
    desc: '정답 문서를 표시한 질문 모음으로 검색 성능(Recall@k·MRR·nDCG)을 비교하고, 답변 문장이 근거에 실제로 있는지(충실도) 확인한다.',
    input: '평가 질문 + 정답', output: '검색·생성 점수',
  },
  {
    path: '/rag/ops', group: '평가·운영', num: 9, label: '운영 (갱신·권한·캐시)',
    desc: '바뀐 청크만 다시 임베딩하고, 사용자 권한에 맞는 문서만 검색하고, 비슷한 질문은 캐시로 답해 비용과 지연 시간을 줄인다.',
    input: '문서 변경·실제 트래픽', output: '최신·안전·빠른 서비스',
  },
]

export const RAG_MENU_ITEMS = stepMenuItems(RAG_STEPS)
