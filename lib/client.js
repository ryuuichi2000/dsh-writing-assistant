// 写作助手 · DeepSeek Harness 插件：浏览器半边
//   - 侧栏加一个「写作助手」入口，主区域是插件页面（/writing-assistant/，iframe）
//   - 页面里点「复制 prompt 到对话」时，postMessage 一段 prompt，这里开一个新对话并填进输入框
//     （不直接发送，用户可以改完再发）——后台执行不可用时的降级路径
//   - 明暗跟随 dsh：主题服务在的话，把当前配色转发给 iframe
window.__ModuleLoader__.load({
  id: 'dsh-writing-assistant',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const PANEL = 'writing-assistant'
    const SRC = '/writing-assistant/'

    // 侧栏图标：一支笔 + 一页稿纸
    function WriteIcon(props) {
      const s = (props && props.size) || 18
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square', strokeLinejoin: 'round' },
        h('path', { d: 'M4 4.5h11l4 4v11H4z' }),
        h('path', { d: 'M15 4.5v4h4' }),
        h('path', { d: 'M7.5 12h8M7.5 15.5h5' }),
      )
    }

    function apply(ctx) {
      const frames = new Set()
      let scheme = null
      const post = (frame) => scheme && frame.contentWindow && frame.contentWindow.postMessage({ type: 'writing-assistant:scheme', scheme }, location.origin)
      ctx.inject(['theme'], (c) => {
        const push = (snap) => {
          scheme = snap.active.colorScheme
          frames.forEach(post)
        }
        push(c.theme.getTheme())
        c.on('theme/change', push)
      })

      function WritingPanel() {
        const ref = React.useRef(null)
        React.useEffect(() => {
          const self = ref.current
          if (self) frames.add(self)
          function onMessage(e) {
            const frame = ref.current
            if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
            const m = e.data
            if (!m || m.type !== 'writing-assistant:start' || typeof m.prompt !== 'string') return
            try {
              ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
            } catch (err) {
              console.error('[writing-assistant] 开新对话失败', err)
              frame.contentWindow.postMessage({ type: 'writing-assistant:start-failed', message: String((err && err.message) || err) }, location.origin)
            }
          }
          addEventListener('message', onMessage)
          return () => {
            removeEventListener('message', onMessage)
            frames.delete(self)
          }
        }, [])
        return h('iframe', {
          ref,
          src: SRC,
          title: '写作助手',
          allow: 'fullscreen',
          onLoad: (e) => post(e.currentTarget),
          style: { width: '100%', height: '100%', border: 0, display: 'block' },
        })
      }

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 8, label: () => '写作助手' }, WriteIcon),
      )
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, WritingPanel))
    }

    exports.isPlugin = true
    exports.inject = ['slots', 'uiWorkspace']
    exports.apply = apply
    return module.exports
  },
})
