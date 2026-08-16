# Ren'Py 知识生产：流程设计与实际做法

> 本文说明本项目 14 个 `renpy-*` skill 是怎么生产的。
> 先说结论：**流程框架是设计的，执行是"AI 生成 + 人工检查 + 验证兜底"**。
> skill 正文大部分由 AI 生成（vibe），只有一部分经过逐条源码核验；
> 但**全部成品都经过人工通读检查**，部分内容来自与开发者的对话要求，
> 且所有内容都经过真实引擎验证（lint / 断言 / 运行）。
> 本文如实区分"设计上应该怎么做"和"实际上做了什么"。

---

## 1. 背景：为什么需要知识库

Ren'Py 在通用模型的训练语料里占比很低，直接让模型写会出现两类错误：

1. **语法记忆错误**：模型把相近语言的写法混进来。
2. **文档误导**：官方文档本身有歧义或过时写法，照搬后运行失败。

开发中实际踩到过三个例子，都是靠"跑引擎"才定位：

- **`has` 语句的缩进**：文档示例把 `has` 放在 screen 顶层，实测 `lint` 报错；
  正确写法是 `has` 必须在容器块（button/frame/fixed/hbox 等）内。
- **`%` 的转义**：文档写"`%%` 转义为 `%`"，实测现代 Ren'Py 里 `50%`、`%%`
  都原样输出，`\%` 才转成 `%`。文档描述的是旧版行为。
- **`init python: import renpy`**：实测 lint 在初始化阶段报 `renpy.music` 属性缺失；
  这个导入既多余又有害。

结论：文档要读，但只读文档不够；模型记忆更不可靠。所以用"验证"兜底——
进入 skill 的写法，至少要在真实引擎上跑过。

---

## 2. 总览：设计的三步流程

设计上，知识生产分三步：

```
官方文档 HTML ──① 提取──> 结构化 JSON ──② 核验──> 知识草案 ──③ 引擎验证──> skill 定稿
引擎源码       ────────┘
```

| 阶段 | 设计意图 | 实际执行程度 |
|---|---|---|
| ① 提取 | 脚本从文档/源码抽结构化数据 | **真实做了**：脚本在，产物在（见 §3） |
| ② 核验 | 每条知识逐条对照源码 | **部分做了**：只对重点主题核验过；**全部成品人工通读过**（见 §4） |
| ③ 验证 | 真实引擎跑通才算数 | **基本做了**：每个 skill 有对应验证项目（见 §5） |

下面按"实际做了什么"来说，不按设计蓝图说。

---

## 3. ① 提取：脚本真实存在，产物可复跑

**实际做了什么**：写了 3 个脚本，把官方文档和源码抽成 JSON。这部分是程序化的，
不依赖模型，是流水线里最扎实的一环。

| 脚本 | 输入 | 产出 |
|---|---|---|
| `extract-text-docs.js` | `doc/text.html`、`dialogue.html`、`custom_text_tags.html` | `text-doc-extract.json` |
| `extract-atl-docs.js` | `doc/transforms.html`、`transform_properties.html`、`transitions.html` | `atl-doc-extract.json` |
| `extract-ast-map.js` | `renpy/ast.py`（源码） | `ast-statement-map.json` |

可复跑：

```powershell
node .preset-staging/extract-text-docs.js <sdk>/doc <out>.json
```

**说明**：这些 JSON 是"骨架"——skill 的覆盖范围来自引擎/文档本身，而不是模型
"觉得应该有哪些"。但骨架 ≠ 成品，正文仍要人来写或 AI 生成。

---

## 4. ② 核验：只对重点主题做过，不是逐条

**设计意图**：每条知识追到源码确认。

**实际做法（诚实版）**：分两个层面——

1. **逐条源码核验**：只有少数重点主题做了（text/ATL/screen/语句映射），
   其余是 AI 生成后抽查或直接靠验证兜底。核验过的主线：

| 主题 | 核验过的源码 | 核验了什么 |
|---|---|---|
| 文本/对话 | `renpy/substitutions.py`、`text.py`、`lexer.py`、`character.py`、`ast.py` | 插值 flags、文本标签分发、转义规则、say execute |
| ATL | `renpy/atl.py`、`common/000atl.rpy` | 语句类语义、warper 公式 |
| screen | `renpy/sl2/*.py` | 关键字默认值、控件解析 |
| 语句↔Python | `renpy/ast.py` | 语句类与公开 API 对应 |

2. **人工通读检查**：每个 skill 成品（14 个）都经过开发者人工通读检查，
   修正明显错误和表述不清处；部分内容（如特定主题的展开、个人项目经验）
   来自开发者在对话中明确要求加入。这一层不是"逐条对源码"式的核验，
   但对成品的整体正确性是有意义的把关。

一个真实核验链条的例子（text）：

- **文档说**：插值 `!q` 只加倍左花括号。
- **源码**：`substitutions.py` 的 `convert` 里 `!q` 分支只对 `{` 做加倍。
- **结论**：转义表以源码为准。

**必须承认的边界**：逐条源码核验是抽查性质的，不是每条 skill 条目都核验过。
skill 里 `（源码 xxx.py 核验）` 的标注只代表"这条核验过"，不代表"所有条目都核验过"。
没核验的条目，靠的是人工通读 + 第 ③ 步的验证兜底 + 后续使用者反馈修正。

---

## 5. ③ 引擎验证：兜底，真实执行

**实际做了什么**：每个 skill 主题都有一个对应验证项目（`verification/projects/demo-script/game/` 下），
跑真实 SDK 验证。这部分是真实的、可复跑的。

三种验证强度：

| 强度 | 方式 | 实例 |
|---|---|---|
| lint | `renpy.py <项目> lint`，exit=0 | 17 个 `*_test.rpy` 全部 lint 通过 |
| 断言脚本 | SDK 内置 Python 无头运行 | `verify-text.py`：**83/83 通过**（插值/标签/转义） |
| 行为测试 | rpytest（`testsuite/testcase`） | `testcase_test.rpy`：2 个用例 |

验证项目清单（`verification/projects/demo-script/game/`）：

```
api_test.rpy  atl_test.rpy  auto_image_test.rpy  build_test.rpy
gallery_test.rpy  gui_test.rpy  l10n_test.rpy  layeredimage_test.rpy
save_test.rpy  screen_basic_test.rpy  screen_controls_test.rpy
screen_actions_test.rpy  screen_control_test.rpy  sprites_test.rpy
testcase_test.rpy  text_style_test.rpy  transitions_test.rpy
```

另有 `verification/projects/eq-test/`（Python 等价形式：`renpy.say/renpy.scene/renpy.show/renpy.menu/
renpy.jump` lint 通过）。

**依赖说明（重要）**：以下验证**需要先安装 Ren'Py SDK**（发布包不包含 SDK，
deploy.ps1 会引导下载；提取的原材料——官方文档与引擎源码——也都来自 SDK）。
将 `<sdk>` 替换为实际 SDK 路径（如 `D:\renpy-8.5.3-sdk`）。

复跑（验证资产在发布包的 `verification/` 下）：

```powershell
# lint
& <sdk>/lib/py3-windows-x86_64/python.exe <sdk>/renpy.py verification/projects/demo-script lint

# 断言（83 项）
& <sdk>/lib/py3-windows-x86_64/python.exe verification/scripts/verify-text.py <sdk>

# 行为测试
& <sdk>/lib/py3-windows-x86_64/python.exe <sdk>/renpy.py verification/projects/demo-script test
```

**验证能保证什么、不能保证什么**（重要）：

- 能保证：skill 里的写法**语法正确、能跑通**（lint 通过）或**行为符合断言**。
- 不能保证：覆盖全面、语义最优、没有遗漏的边界情况——这些仍需人工/AI 审阅
  和使用者反馈。

换句话说：**验证是"最后防线"，不是"质量证明"**。它证明"跑过没错"，
不证明"所有内容都对"。

---

## 6. 经验隔离：L1/L2/L3

skill 内容按可信度分层（`renpy-practices` 顶部有完整声明）：

| 层 | 内容 | 要求 | 归属 |
|---|---|---|---|
| **L1 引擎事实** | 语法/语义/API 的确定性结论 | 最好有验证证据 | 开源 skill |
| **L2 通用原则** | 组织/命名/性能的"道理" | 不绑定具体项目 | 开源 skill |
| **L3 个人经验** | 个人项目/习惯 | 无要求 | 使用者私有文件 |

优先级：`L1 > L2 > L3 > 模型常识`。

实际状态：L1 条目多数经过了第 5 节的验证（能跑通），少数经过第 4 节核验；
L2 是社区共识性质；L3 明确不进开源包。贡献者提交新条目时，希望附验证证据
（lint 输出或源码行号），但不强制——验证证据越多，可信度越高，越容易被采用。

---

## 7. 局限与适用范围

**这套方法只适用于"有可执行引擎的领域"**：能 lint、能运行、能写断言的项目。
因为兜底依赖真实引擎。

没有可执行引擎的知识领域（法律、医学、历史）无法用引擎验证，只能用评测题
（benchmark）间接评估——那是另一条路线，验证强度弱于引擎实测。

**本方法的适用条件**：

- 有可运行的引擎/解释器 ✓ Ren'Py 满足
- 有官方文档 + 源码可对照 ✓ Ren'Py 满足
- 验证成本可控（lint/运行开销不大）✓ Ren'Py 满足

**推广**：对同类 DSL（RPG Maker 脚本、Twine、Ink）可复用"验证兜底"的思路——
生成的内容用真实引擎跑一遍。脚本提取部分需要改解析目标，但"生成 + 验证"的
框架不变。

---

## 附录：产物与脚本索引

> 验证资产随发布包分发（`verification/` 目录，不含 SDK；复跑需先安装 SDK）。

| 类别 | 位置 | 说明 |
|---|---|---|
| 提取脚本 | `verification/scripts/extract-text-docs.js` / `extract-atl-docs.js` / `extract-ast-map.js` | 文档/源码 → JSON |
| 渲染脚本 | `verification/scripts/render-text-preview.js` / `render-atl-preview.js` / `render-statement-md.js` | JSON → 可读预览 |
| 验证脚本 | `verification/scripts/verify-text.py` | 引擎断言（83/83） |
| 提取产物 | `verification/extracts/*-extract.json`（atl/build/disp/gui/l10n/layered/mc/save/screen/test/text-doc/vis）+ preview.md | 各主题结构化提取 |
| 中间产物 | `verification/extracts/ast-statement-map.json` / `renpy-statement-map.md` / `renpy-core-draft.md` | 语句映射与草案 |
| 验证项目 | `verification/projects/demo-script/`（17 个 `*_test.rpy` + testsuite） | lint/行为验证 |
| | `verification/projects/eq-test/` | Python 等价形式验证 |
| 单测 | `verification/tests/test-*.js` + `host-*-test.js` + `smoke-sidebar.js` | 编辑器/解析器逻辑回归 |

> 这些资产在工作区的 `.preset-staging/` 下开发维护，发布时整理进 `verification/` 随包分发。
> 复跑全部验证需要 Ren'Py SDK（见 §5 依赖说明）。
