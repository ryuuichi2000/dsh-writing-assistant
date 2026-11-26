export const pageNumbers = {
  defaults: { enabled: true, style: 'number', position: 'center', first: true },
  styles: { number: '1', page: '第1页', chinese: '第一页', dash: '— 1 —' },
  positions: { left: '底部左侧', center: '底部居中', right: '底部右侧', outside: '底部外侧（奇右偶左）' },
}

export function normalizePageNumber(value) {
  const p = { ...pageNumbers.defaults, ...value }
  if (!Object.hasOwn(pageNumbers.styles, p.style) || !Object.hasOwn(pageNumbers.positions, p.position)
      || typeof p.enabled !== 'boolean' || typeof p.first !== 'boolean') throw new Error('页码设置无效')
  return { enabled: p.enabled, style: p.style, position: p.position, first: p.first }
}
