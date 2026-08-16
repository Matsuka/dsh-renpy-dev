# 贡献指南（CONTRIBUTING）

感谢你考虑为 Ren'Py 开发模式做贡献。这个项目以**知识质量**为立身之本，
贡献方式与一般代码项目略有不同——请先读下面的分层机制。

---

## 1. 项目结构速览

```
dsh-renpy-dev/
├── agent-presets/renpy/     # agent preset（persona 约束 + 9 个开发工具）
├── renpy-client/            # web 插件（编辑器 UI + /renpy-dev 宿主服务）
├── skills/                  # 14 个 renpy-* 知识库（核心资产）
├── verification/            # 验证资产（提取脚本/引擎验证项目/单测）
└── docs/                    # 方法论文档（知识流水线等）
```

## 2. 知识贡献：三层经验隔离

项目把 skill 内容分为三层（`renpy-practices` 顶部有完整声明）：

| 层 | 内容 | 归属 |
|---|---|---|
| **L1 引擎事实** | 语法/语义/API 的确定性结论 | 开源 skill（本仓库） |
| **L2 通用原则** | 组织/命名/性能的"道理"，不绑定具体项目 | 开源 skill（本仓库） |
| **L3 个人经验** | 个人项目/习惯 | **你的私有文件**（不进本仓库） |

优先级：`L1 > L2 > L3 > 模型常识`。

### 提交一条知识（L1/L2）

1. **判定层级**：是引擎事实（L1）还是通用原则（L2）？
2. **附验证证据**（L1 必须，L2 建议）：
   - 源码位置：如 `renpy/substitutions.py` 的哪一行
   - lint/运行证据：最小 `.rpy` 示例 + `renpy_lint` 输出，或 `verify-text.py` 风格断言
   - 参考 `verification/projects/demo-script/` 里的现有验证文件怎么写
3. **写进对应 skill**：按主题放进 `skills/renpy-*.md`（core/text/atl/screen/api/l10n/…）
4. **保持格式**：与现有条目一致（速查条目，非长篇教程；标注来源）

### L3 经验（不需要提交）

个人项目经验请写入你自己的私有文件：
`~/.dsh/skills/renpy-practices-personal.md`——随机器积累，不进本仓库。

> 为什么这样隔离：开源内容要可审阅、可积累。L3 带个人色彩的内容进公共
> 仓库会污染知识质量；L1/L2 经过核验后，所有使用者（和他们的 AI）都受益。

## 3. 代码贡献

- **host 侧**（`renpy-client/lib/host.js`、`renpy-core.js`）：CJS，改后需重启 dsh 生效
- **client 侧**（`renpy-client/lib/client.js`）：浏览器 bundle 格式，**不支持相对 require**
  ——纯函数放 `renpy-core.js`（host 侧）或留待构建脚本内联方案；刷新页面生效
- **验证**：改代码后运行 `verification/tests/` 下全部测试（需先装 Ren'Py SDK）
- **不要硬编码开发机路径**：路径应从 `renpy.config.json` / 环境变量 / config 解析

## 4. 验证资产

`verification/` 含项目可信度的全部证据：
- `scripts/`：提取脚本（extract-*.js）与引擎断言（verify-text.py）
- `extracts/`：结构化提取产物（*-extract.json）
- `projects/`：17 个引擎验证项目（demo-script）+ Python 等价验证（eq-test）
- `tests/`：15 个单测（274 断言）

复跑需要先安装 Ren'Py SDK（`deploy.ps1` 会引导），详见 `docs/knowledge-pipeline.md`。

## 5. 提交规范

- **PR 描述**：说明改动类型（知识/代码/文档）+ 验证证据
- **知识 PR**：附 L1/L2 判定 + 验证证据（lint 输出或源码行号）
- **保持诚实**：本项目明确区分"设计意图"与"实际执行"，贡献时如实标注哪些核验过、哪些是经验
