# Pull Request

感谢贡献！请先读 `CONTRIBUTING.md`（三层经验隔离 + 原创代码约束 + 提交规范）。

## 改动类型

- [ ] **知识**（skill 内容：L1 引擎事实 / L2 通用原则）
- [ ] **代码**（renpy-client / agent-presets / 工具）
- [ ] **文档**（README/GUIDE/DEPLOY/模板等）

## 变更内容

简述改了什么、为什么改（关联 issue # 如有）。

## 验证证据

> 知识 PR 必须附；代码 PR 必须跑测试。

- [ ] `node --check` 通过（代码改动）
- [ ] 单测通过：`verification/tests/` 全量（当前 22 个）
- [ ] lint 证据（知识 PR）：最小 .rpy + 输出，或源码行号
- [ ] 手动验证：描述你在什么环境（DSH/SDK/系统）验证了什么

**测试输出摘要**

```
（粘贴关键测试输出）
```

## 知识 PR 附加

- 层级：L1 / L2
- 拟写入 skill：`renpy-___`
- 诚实声明（哪些实测、哪些推断）：___

## 检查清单

- [ ] 未引入开发机绝对路径（路径走 renpy.config.json / 环境变量）
- [ ] 未复制第三方代码（原创实现；借鉴已注明来源）
- [ ] 文档同步（如影响 README/GUIDE/TESTER-GUIDE）
- [ ] i18n：新增 UI 文案已加 `tr()` 并补充 I18N_EN 翻译（`test-i18n.js` 应通过）
