// 篇幅校验：任务单里的「约 N 字」按正文汉字 + 西文词计（口径见 lib/blocks.js 的 draftStats），
// 允许 ±10%。模型很容易把「约 3000 字」写成 3700 字并用「可读性」解释；存稿时按同一口径拦一次，
// 让它在落盘前删到位，而不是事后再让用户自己发现。
export const LENGTH_TOLERANCE = 0.1

export function lengthBand(target, minimum = 0) {
  const t = Math.round(Number(target) || 0)
  if (t <= 0) return null
  const lower = Math.round(t * (1 - LENGTH_TOLERANCE))
  return {
    target: t,
    min: t >= minimum ? Math.max(minimum, lower) : lower,
    max: Math.round(t * (1 + LENGTH_TOLERANCE)),
  }
}

export function lengthState(chars, target, minimum = 0) {
  const band = lengthBand(target, minimum)
  if (!band) return null
  const n = Math.max(0, Math.round(Number(chars) || 0))
  return { ...band, chars: n, state: n > band.max ? 'over' : n < band.min ? 'under' : 'ok' }
}

export function lengthText(state) {
  if (!state || state.state === 'ok') return ''
  if (state.state === 'over') {
    return `成稿 ${state.chars} 字，超过任务单上限 ${state.max} 字（目标 ${state.target} 字）。请删减重复交代、与结论无关的背景和过长引文，保留证据与「待核」。`
  }
  return `成稿 ${state.chars} 字，低于任务单下限 ${state.min} 字（目标 ${state.target} 字）。请补足证据和分析后再保存。`
}
