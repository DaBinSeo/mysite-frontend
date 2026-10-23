import { stepMenuItems } from './vizSteps.js'

// LLM 메뉴의 화면 목록. 네비게이션 드롭다운·전체 흐름 화면·이전/다음 버튼이 이 순서를 함께 쓴다
export const LLM_STEPS = [
  {
    path: '/llm/overview', group: '시작', label: '전체 흐름 한눈에 보기',
    desc: '데이터를 모으는 데서 시작해 모델을 학습·정렬하고, 평가를 거쳐 서비스하기까지의 순서를 한 장의 지도로 본다.',
  },
  {
    path: '/llm/data', group: '데이터', num: 1, label: '학습 데이터 구축 과정',
    desc: '수집한 문서를 정제·중복 제거·개인정보 마스킹한 뒤 토큰화하고, 컨텍스트 길이만큼 잘라 학습 샘플로 만든다.',
    input: '웹 문서·책·코드', output: '토큰 블록, 지시·선호 데이터',
  },
  {
    path: '/llm/embedding', group: '모델 구조', num: 2, label: '임베딩·위치 인코딩',
    desc: '토큰 ID를 숫자 벡터로 바꾸고, 순서 정보를 위치 인코딩으로 더해 모델의 입력을 만든다.',
    input: '토큰 ID', output: '토큰별 벡터 (토큰 수 × 차원)',
  },
  {
    path: '/llm/attention', group: '모델 구조', num: 3, label: '트랜스포머·셀프 어텐션',
    desc: '각 토큰이 앞 토큰들 중 무엇을 참고할지 Q·K·V로 계산하고, 이 블록을 여러 층 쌓아 모델을 만든다.',
    input: '토큰별 벡터', output: '문맥이 섞인 벡터 → 다음 토큰 점수',
  },
  {
    path: '/llm/pretrain', group: '학습', num: 4, label: '사전 학습 (다음 토큰 예측)',
    desc: '대량의 문장으로 다음 토큰을 맞히는 학습을 반복한다. 손실이 줄면서 모델이 문장을 이어 쓰게 된다.',
    input: '토큰 블록', output: '기반 모델 (Base model)',
  },
  {
    path: '/llm/sft', group: '학습', num: 5, label: '지시 미세 조정 (SFT)',
    desc: '질문–모범 답변 쌍을 채팅 템플릿으로 학습시켜 질문에 답하는 형식을 가르친다.',
    input: '기반 모델 + 지시 데이터', output: '대화형 모델 (SFT model)',
  },
  {
    path: '/llm/alignment', group: '학습', num: 6, label: '선호 정렬 (RLHF·DPO)',
    desc: '사람이 더 좋다고 고른 답의 확률은 올리고 나쁜 답은 내려, 도움이 되고 안전한 답을 하게 만든다.',
    input: 'SFT 모델 + 선호 데이터', output: '정렬된 모델',
  },
  {
    path: '/llm/eval', group: '평가·배포', num: 7, label: '평가',
    desc: '퍼플렉시티와 벤치마크 정답률로 성능을 재고, 평가 문제가 학습 데이터에 섞였는지(오염) 확인한다.',
    input: '모델 + 평가 데이터', output: '점수·배포 여부 판단',
  },
  {
    path: '/llm/decoding', group: '평가·배포', num: 8, label: '추론·디코딩',
    desc: '다음 토큰 확률에서 temperature·top-k·top-p로 토큰을 골라 문장을 생성하고, KV 캐시로 계산을 줄인다.',
    input: '프롬프트', output: '생성된 답변',
  },
  {
    path: '/llm/serving', group: '평가·배포', num: 9, label: '경량화·서빙',
    desc: '가중치를 적은 비트로 양자화해 메모리를 줄이고, 요청을 묶어 처리해 GPU를 효율적으로 쓴다.',
    input: '학습된 가중치', output: '서비스 중인 API',
  },
]

export const LLM_MENU_ITEMS = stepMenuItems(LLM_STEPS)
