// 写作助手 · DeepSeek Harness 插件：Host 半边
// 1. 把插件自带的两个 skill（skills/）注册进 ctx.skills
//    research-writing            研究型写作：语料 → 语气档案、资料 / 描述 → 成文、预览选区改稿
//    official-document-drafting  公文起草：8 个文种、GB/T 9704-2012、导出 Word
// 2. 给模型八个工具（lib/tools.js）：提纲、存稿、改块、建议、读稿、看稿库、语气档案、机检
// 3. 后台执行器（lib/jobs.js）：页面里点「开始写作」「开始起草」「让模型改」直接在 Host 进程起一个
//    agent 跑完，不跳对话、不用手动发送；结果由上面的工具写进稿库，页面轮询任务状态看进度。
// 4. /writing-assistant/            插件页面（gallery/，侧栏「写作助手」打开的就是它）
//    /writing-assistant/api/...      稿库 / 语气档案 / 后台任务 / 导出 / 机检
//    /writing-assistant/files/...    导出的 .docx、稿件 Markdown
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE, createHandler } from './http.js'
import { createRunner } from './jobs.js'
import { createSkillProvider } from './skills.js'
import { TOOLS } from './tools.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILL_DIR = join(ROOT, 'skills')

export const name = 'writing-assistant'
export const inject = ['webServer', 'skills', 'tools']

export function apply(ctx) {
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(SKILL_DIR)))
  const runner = createRunner(ctx)
  const taskTools = new Set(['writing_save_work', 'writing_save_outline', 'writing_patch_blocks', 'writing_voice'])
  for (const tool of TOOLS) {
    if (!taskTools.has(tool.name)) ctx.tools.register(tool)
    else ctx.tools.register({ ...tool, execute: (args, execution, job) =>
      tool.execute(args, execution, job || runner.forSession(execution?.agent?.session?.id)) })
  }
  ctx.effect(() => () => runner.close())
  ctx.inject?.(['agents', 'sessions', 'agentPresets', 'agentDefaultModel'], () => { runner.recover() })
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: BASE,
      handler: createHandler(ROOT, runner),
    }),
  )
}
