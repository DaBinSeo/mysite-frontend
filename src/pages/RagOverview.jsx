import { useState } from 'react'
import { Link } from 'react-router'
import { ChunkBadge, QueryInput, RagPage } from '../components/RagViz.jsx'
import { FlowMap, Terms } from '../components/VizStage.jsx'
import { KB_CHUNKS, KB_DOCS, RAW_SOURCES, answer, answerText } from '../utils/ragModel.js'
import { RAG_STEPS } from '../utils/ragSteps.js'

const TERMS = [
  ['RAG', 'Retrieval-Augmented Generation(검색 증강 생성). 질문과 관련된 문서를 먼저 찾아 언어 모델에 함께 넘겨, 학습하지 않은 최신·사내 정보로도 근거 있는 답을 하게 하는 방식.'],
  ['색인 (Indexing)', '질문이 오기 전에 미리 해 두는 일. 문서를 정리·분할·임베딩해 검색할 수 있는 형태로 저장한다. 문서가 바뀔 때만 다시 한다.'],
  ['검색 (Retrieval)', '질문이 올 때마다 하는 일. 질문과 관련 있는 청크를 찾아 순위를 매긴다. 답의 품질은 대부분 여기서 결정된다.'],
  ['생성 (Generation)', '찾은 청크를 근거로 프롬프트를 만들어 언어 모델이 답을 쓰게 하는 일.'],
]

const PRESETS = ['책을 늦게 돌려주면 어떻게 되나요?', '노트북 쓸 수 있는 자리가 있나요?', '도서관 카페 메뉴 추천해 줘']

// RAG 구축 전체 흐름 지도 + 예시 지식 베이스로 질문 하나를 끝까지 돌려 보기
export default function RagOverview() {
  const [query, setQuery] = useState(PRESETS[0])
  const result = query.trim() ? answer(query) : null

  return (
    <RagPage path="/rag/overview"
             intro="RAG는 문서를 미리 검색할 수 있게 만들어 두는 색인 단계와, 질문이 올 때마다 찾아서 답하는 검색·생성 단계로 나뉩니다. 카드를 누르면 각 단계를 직접 계산해 보는 화면으로 이동합니다.">
      <FlowMap steps={RAG_STEPS} />

      <section className="card mb-3">
        <div className="card-header"><strong>질문 하나를 끝까지 돌려 보기</strong></div>
        <div className="card-body">
          <p className="small text-body-secondary">
            모든 단계 화면은 가상의 &lsquo;햇살 도서관&rsquo; 이용 안내 문서 {RAW_SOURCES.length}개를 예시 지식 베이스로 씁니다.
            전처리 후 {KB_DOCS.length}개 문서, {KB_CHUNKS.length}개 청크가 남습니다.
            아래 질문은 질의 분석 → 하이브리드 검색 → 재순위화 → 답변 생성을 모두 거친 결과입니다.
          </p>
          <QueryInput value={query} onChange={setQuery} presets={PRESETS} />
          {result && (
            <div className="row g-3">
              <div className="col-12 col-md-5">
                <div className="small fw-bold mb-1">찾은 근거 (상위 3개)</div>
                <ol className="list-unstyled small mb-0">
                  {result.packed.map((it, i) => (
                    <li key={it.chunk.id} className="mb-2">
                      <span className="me-1">[{i + 1}]</span><ChunkBadge chunk={it.chunk} />
                      <span className="text-body-secondary ms-1">점수 {it.score.toFixed(2)}</span>
                      <div className="text-body-secondary">{it.chunk.text}</div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="col-12 col-md-7">
                <div className="small fw-bold mb-1">답변</div>
                <div className={`border rounded p-2 small ${result.refused ? 'border-warning bg-warning-subtle' : 'bg-body-tertiary'}`}>
                  {answerText(result)}
                </div>
                <p className="small text-body-secondary mt-2 mb-0">
                  {result.refused
                    ? '가장 좋은 근거도 질문과 잘 맞지 않아 답하지 않았습니다. 지어내서 답하는 것(환각)보다 낫습니다. → 7단계'
                    : '답변 문장은 근거 청크에서 골라 출처 번호를 붙였습니다. 실제 서비스에서는 이 근거로 LLM이 문장을 새로 씁니다. → 7단계'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="card">
        <div className="card-body small">
          <p className="mb-2">
            <strong>왜 RAG인가</strong> — LLM은 학습한 시점 이후의 정보나 공개되지 않은 사내 문서를 모릅니다.
            다시 학습시키는 대신 필요한 문서를 그때그때 찾아 넘겨 주면, 문서만 고쳐도 답이 바로 바뀌고 출처도 보여 줄 수 있습니다.
          </p>
          <p className="mb-0 text-body-secondary">
            실제 서비스는 임베딩 모델·벡터 DB·리랭커·LLM을 씁니다. 이 화면들은 같은 역할을 단어 해시 임베딩, 개념 사전, BM25 같은 작은 계산으로 흉내 내
            각 단계에서 무엇이 일어나는지 보여 줍니다. 청킹·임베딩을 직접 해 보려면 <Link to="/rag/build">2단계</Link>로 가세요.
          </p>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS} />
        </div>
      </div>
    </RagPage>
  )
}
