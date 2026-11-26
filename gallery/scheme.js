// 明暗跟随 dsh：放在 <head> 里同步执行，首帧就是对的颜色。
//   - 嵌在 dsh 里：先读宿主 body 上的 data-ds-dark-theme，之后听 client.js 转发的主题切换
//   - 单独在浏览器里打开：跟随系统
// 字体只用本机字体栈（衬线中文），不引外链 —— 写作台常用在离线环境。
;(() => {
  const root = document.documentElement
  const set = (dark) => {
    root.dataset.scheme = dark ? 'dark' : 'light'
  }
  let host = null
  try {
    if (parent !== window) host = parent.document.body
  } catch {}
  if (host) set(host.hasAttribute('data-ds-dark-theme'))
  else {
    const media = matchMedia('(prefers-color-scheme: dark)')
    set(media.matches)
    media.addEventListener('change', (e) => set(e.matches))
  }
  addEventListener('message', (e) => {
    if (e.source !== parent || e.origin !== location.origin) return
    if (e.data?.type === 'writing-assistant:scheme') set(e.data.scheme === 'dark')
  })
})()
