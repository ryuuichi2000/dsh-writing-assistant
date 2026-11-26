# vendor：综合提炼的原始材料

这里只做留档，**运行时不需要加载**。`SKILL.md` 与 `references/` 里的规则是从这些材料综合重写的；遇到分歧或想追溯某条规则的出处时看这里。

## humanizer-zh/

- 来源：[ai-zixun/humanizer-zh](https://github.com/ai-zixun/humanizer-zh)
- 版本：1.3.0
- 提交：`f75f1ac9735c4f10da1bba0148e0ea7228c5c3b3`（2026-05-22）
- 许可：MIT（见 `LICENSE`）
- 文件：`SKILL.md`（入口、Core Rules、Voice Adoption、Final Check）、`references/patterns.md`（13 类模式与示例）
- 没收录：`references/voices/*`（8 位中文作者人格档案）、`references/corpus*.md`。本模块学的是**用户自己的**语气，不套用外部作者人格；语料参照由用户上传的样本提供。

## research-writer/

- 来源：一份外部提供的《研究型写作》材料，origin 标为 ComposioHQ/awesome-claude-skills 的 `content-research-writer`。
- 许可未明确，因此**不随包分发**；本模块只保留重写后的规则，见 `references/drafting.md`。

## 本模块做了哪些改动

| 原材料的做法 | 本模块的处理 | 原因 |
|---|---|---|
| humanizer-zh 把「模式」当检查线索 | 保留，并给每条补「什么时候保留」 | 原技能已强调不是黑名单；补上保留条件后更不容易误删作者本人的习惯 |
| humanizer-zh 的可选作者人格（8 位作者） | 去掉，换成用户自己的语气档案 | 用户要的是「像本人」，不是扮演某位作家 |
| humanizer-zh 默认引号 `“”`，项目可声明 `「」` | 保留；档案里明确写就用档案的 | 与语气档案的优先级一致 |
| 研究型写作的交互式访谈 | 压到最多 3 个问题，其余按假设写 | 插件里用户要的是成稿，不是长问卷 |
| 研究型写作的引用管理 | 保留，并加「来源台账 + 停车条件 + 失败处理」 | 中文检索常遇到打不开、没日期、只有二手，需要明确处理 |
| 研究型写作的目录创建 / `touch` 步骤 | 换成 `writing.py init` 的项目脚手架 | 跨平台，且和预览、修改记录绑定 |
| 研究型写作按节反馈 | 保留为「用户自己写、你给反馈」模式 | 写作伙伴场景仍然有用 |

## 许可

- `humanizer-zh/` 按 MIT 保留版权与许可声明。
- `research-writer/` 原文未随包分发；需要原文时请从原始来源获取并自行确认许可。
