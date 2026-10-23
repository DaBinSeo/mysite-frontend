// LLM 구축 과정 화면들이 함께 쓰는 틀(제목·이전/다음 버튼)과 단어 칩. 그래프는 VizCharts.jsx(RAG 화면과 공용)
import { SPECIALS, VOCAB } from '../utils/llmModel.js'
import { LLM_STEPS } from '../utils/llmSteps.js'
import { StepNav, StepPage } from './VizStage.jsx'

export { Bars, Heatmap, LineChart } from './VizCharts.jsx'

// 화면 공통 틀: 단계 제목·소개 → 내용 → 이전/다음 단계 버튼
export function LlmPage({ path, intro, children }) {
  return <StepPage steps={LLM_STEPS} prefix="LLM" path={path} intro={intro}>{children}</StepPage>
}

// 자체 틀을 쓰는 화면(학습 데이터 구축 과정)의 이전/다음 버튼
export function LlmStepNav({ path }) {
  return <StepNav steps={LLM_STEPS} prefix="LLM" path={path} />
}

// 단어 칩. 특수 토큰은 어둡게 칠한다
export function WordChip({ id, className = '', title, style }) {
  const special = id < SPECIALS.length
  return (
    <span className={`rag-token ${special ? 'llm-token-special' : ''} ${className}`} title={title} style={style}>
      {VOCAB.list[id]}
    </span>
  )
}
