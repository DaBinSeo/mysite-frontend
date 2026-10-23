import { LlmPage } from '../components/LlmViz.jsx'
import { FlowMap, Terms } from '../components/VizStage.jsx'
import { LLM_STEPS } from '../utils/llmSteps.js'

const TERMS = [
  ['LLM', 'Large Language Model(대규모 언어 모델). 수많은 문장으로 다음 토큰을 맞히도록 학습한, 수십억 개 이상의 매개변수를 가진 트랜스포머 모델.'],
  ['기반 모델 (Base model)', '사전 학습만 끝난 모델. 글을 이어 쓸 줄은 알지만 질문에 답하는 형식은 아직 모른다.'],
  ['사후 학습 (Post-training)', '사전 학습 뒤의 SFT·선호 정렬 단계를 묶어 부르는 말. 데이터는 훨씬 적지만 모델의 말투와 태도를 정한다.'],
  ['추론 (Inference)', '학습이 끝난 모델로 실제 답을 만들어 내는 것. 서비스 비용 대부분이 여기서 든다.'],
]

// LLM 구축 전체 흐름 지도 (단계 카드를 누르면 해당 화면으로 이동)
export default function LlmOverview() {
  return (
    <LlmPage path="/llm/overview"
             intro="LLM은 데이터 → 모델 구조 → 학습 → 평가·배포 순서로 만들어집니다. 카드를 누르면 각 단계를 직접 계산해 보는 화면으로 이동합니다.">
      <FlowMap steps={LLM_STEPS} />
      <div className="card">
        <div className="card-body small">
          <p className="mb-2">
            <strong>규모 감각</strong> — 실제 LLM은 수 조 토큰의 데이터로 수십억~수천억 개 매개변수를 GPU 수천 장에서 몇 주~몇 달 학습합니다.
            이 화면들은 같은 과정을 문장 수십 개와 매개변수 수만 개로 줄여, 각 단계에서 무슨 계산이 일어나는지 직접 보도록 만든 것입니다.
          </p>
          <p className="mb-0 text-body-secondary">
            2~3단계는 실제 트랜스포머의 계산을 그대로 보여 줍니다. 4·5·7·8단계는 같은 학습 원리를 쓰는 작은 모델(앞 몇 개 단어를 보고 다음 단어를 맞히는 선형 모델)로, 6단계는 답 네 개의 확률로, 9단계는 메모리·배치 계산으로 시연합니다.
          </p>
        </div>
        <div className="card-footer bg-body-tertiary">
          <Terms items={TERMS} />
        </div>
      </div>
    </LlmPage>
  )
}
