// 시각화 메뉴(LLM·RAG)의 단계 목록에서 함께 쓰는 도우미.
// 단계 항목: { path, group, num?, label, desc, input?, output? } (num이 없으면 번호 없는 시작 화면)

export function stepTitle(step) {
  return step.num ? `${step.num}. ${step.label}` : step.label
}

// 드롭다운 항목: 묶음(group)이 바뀌는 곳마다 제목을 끼운다
export function stepMenuItems(steps) {
  return steps.flatMap((step, i) => [
    ...(i === 0 || steps[i - 1].group !== step.group ? [{ header: step.group }] : []),
    { to: step.path, label: stepTitle(step) },
  ])
}

// 전체 흐름 화면용: 첫 화면(전체 흐름)을 빼고 묶음(group)별로 모은다
export function stepGroups(steps) {
  return steps.slice(1).reduce((acc, step) => {
    const last = acc.at(-1)
    if (last?.group === step.group) last.steps.push(step)
    else acc.push({ group: step.group, steps: [step] })
    return acc
  }, [])
}
