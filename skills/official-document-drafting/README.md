# 公文起草（official-document-drafting）

从「政策工作助手」插件中提炼出的独立公文起草技能。给 Agent 用，也可以直接在命令行导出 Word。

覆盖 8 个文种入口：4 种法定公文（通告、函、纪要、通报）+ 4 类常见正式材料（情况专报、讲话稿、工作总结、危机处置报告）。按 GB/T 9704-2012 的版式口径输出，内置 Markdown → `.docx` 渲染器和成稿校验器，支持页眉/页脚图片自动保存与复用。

## 安装

把整个目录复制到 Agent 的技能目录即可：

```powershell
# DeepSeek Harness / 兼容 ~/.agents/skills 的宿主
Copy-Item -Recurse -Force .\official-document-drafting "$env:USERPROFILE\.agents\skills\official-document-drafting"
```

或复制到 Claude Code / Codex 的技能目录（`~/.claude/skills/`、`~/.codex/skills/`）。重启会话后，技能出现在技能列表中。

## 使用

对 Agent 说：

- “根据这份会议记录整理一份会议纪要，导出 Word。”
- “起草一份向主管部门报送的情况专报，数据没有的先留空。”
- “把这次安全事件整理成危机处置报告，写清事件情况、处置经过和整改情况。”
- “检查这份通报的章节和格式有没有问题。”

Agent 会按 `SKILL.md` 的流程读取 `references/rules.md` 和对应的文种参考。当前只保留 8 个模板（决议已按用户要求移除）；如果用户要通知、报告、请示、方案等已移除的文种，Agent 应明确说明当前模板列表没有该文种，而不是套用其他模板硬写。

### 命令行导出

```bash
# 按文种自动套字体与版式
python scripts/generate_docx.py 成稿.md --doc-type 纪要

# 指定输出、字体替代、电子版（不加盖印章）
python scripts/generate_docx.py 成稿.md -o 成稿.docx --doc-type 通报 --font-preset noto-cjk
python scripts/generate_docx.py 成稿.md --doc-type 函 --unsealed

# 只看解析出的字体/版式，不导出
python scripts/generate_docx.py --doc-type 纪要 --show-font-plan
```

只依赖 Python 3.11+ 标准库，不需要 `python-docx`、不需要联网。

### 页眉 / 页脚图片

图片第一次导入后自动保存到 DSH 数据目录的 `doc-images/`（`$DSH_HOME/writing-assistant/doc-images`），之后按名称复用：

```bash
python scripts/image_library.py add ./单位页眉.png --name 单位页眉
python scripts/image_library.py add ./单位页脚.png --name 单位页脚
python scripts/image_library.py list

python scripts/generate_docx.py 成稿.md --doc-type 危机处置报告 \
  --header-image 单位页眉 --footer-image 单位页脚
```

导出时直接传本地图片路径也可以，会自动入库。页眉默认宽 35mm、页脚默认宽 30mm，可用 `--header-image-width-mm` / `--footer-image-width-mm` 调整。

### 成稿校验

```bash
python scripts/check_draft.py 纪要 成稿.md
python scripts/check_draft.py 函 成稿.md --strict
python scripts/check_draft.py 情况专报 成稿.md --facts

# 技能自检：8 个文种模板导出 + XML 解析 + 校验
python scripts/selftest.py
```

## 目录

```
official-document-drafting/
├── SKILL.md                    # Agent 入口：何时用、流程、文种路由、约定
├── references/
│   ├── rules.md                # 共享规则：事实边界、行文、结构、语言、版式、自检
│   ├── examples.md             # 3 个通用示例（纪要/讲话稿/情况专报）
│   └── doc-types/<id>.md       # 8 个文种：起草前确认、思路、规则、误写、模板（resolution.md 留档）
├── assets/
│   ├── registry.toml           # 文种注册表（id/别名/字体版式/必备章节）
│   ├── font-profiles.toml      # 3 套字体方案
│   ├── layout-profiles.toml    # 3 套版式方案（含页边距）
│   └── fonts/README.md         # 字体安装与授权说明（不含字体二进制）
├── scripts/
│   ├── generate_docx.py        # Markdown → Word
│   ├── check_draft.py          # 成稿校验
│   ├── image_library.py        # 页眉/页脚图片库
│   ├── selftest.py             # 9 文种自检
│   └── docgen/                 # 渲染引擎
└── LICENSE
```

## 相对来源项目的改动

来源项目是一套「prompts 主源 + 构建产物 + 测试 + 样例 + 字体」的仓库结构。提炼时做了四类处理：

1. **去掉项目耦合**：移除来源项目里的固定单位问答、对其他技能的引用、项目内部的附注/版记默认值。
2. **修正规则冲突**：默认正式度改为单位正式级；删除“每点 5—7 句”的凑句数要求；统一标题层级口径。
3. **修正导出缺陷**：行内一级标题不再整段变黑体；落款不跨页；称谓/报送对象/会议信息/附件（可选）等结构标签不再打印；页码改为单页居右、双页居左；图片不再强制放大。
4. **工程收敛**：文种与版式改为单一注册表；删除失效的构建脚本和 `dist/` 依赖；字体二进制不随包分发；补上可运行的成稿校验器。
5. **按需精简**：按用户指定只保留 8 个文种（通告、函、纪要、通报、情况专报、讲话稿、工作总结、危机处置报告），决议随后也按用户要求移出模板列表（参考文件留档），其余从注册表和参考文件中删除。

详细的问题清单、证据和修复说明见工作目录下的《公文起草技能_问题清单与优化说明.md》。

## 已知边界

- 导出的是**排版初稿**：红头、发文机关标志、印章、完整版记仍需本单位 Word 模板套版。
- 只写字体名、不嵌入字体；目标机器需安装仿宋_GB2312、黑体、楷体_GB2312、方正小标宋，或用 `--font-preset` 选择开源替代。
- 公文表单的「更多 → 页码」可选择开启、样式、底部位置及首页是否显示。默认从首页显示纯数字并居中。已有稿件可在预览的「更多 → 页码」中重新设置并导出。
- 图片仅支持本地 png/jpg/jpeg，且必须与成稿 Markdown 同目录或位于其子目录。
- 机器校验只做结构和格式提示，不能判断事实真假；正式发文必须人工审核。

## 许可

代码与文档沿用上游 MIT 许可，见 `LICENSE`。上游：https://github.com/zhaohui-yang/official-document-drafting

字体不随包分发；`方正小标宋简体` 等商用字体请自行确认授权。
