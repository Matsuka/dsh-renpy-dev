# DSH Ren'Py 开发工作台（dsh-renpy-dev）— 术语表

> 本表由 SDK 英文文档（`renpy-8.5.3-sdk/doc/*.html`）与官方中文文档
> （[doc.renpy.cn/zh-CN/](https://doc.renpy.cn/zh-CN/)）页面标题对照生成。
> 状态：**初稿** —— 页面级标题对照，正文级术语（属性/函数/类名）待人工补充。
>
> 用途：英文 README 翻译的术语基准；后续 skill 本地化的依据。
>
> 维护约定：
> - **官方译名**：来自 doc.renpy.cn 页面标题，优先采用。
> - **保留英文**：DSH 生态术语（preset/skill/bundle 等）与专有名词（如 Ren'Py 自身）不做翻译。
> - 术语标注 `(term)` 表示中文标题中保留了原文括号注释，翻译时按此处理。

## 一、核心概念（页面标题对照）

| 英文（SDK 页面） | 官方中文（doc.renpy.cn） | 备注 |
|---|---|---|
| Text | 文本 | |
| Dialogue and Narration | 对话(dialogue)和旁白(narration) | |
| Character Callbacks | 角色回调函数 | |
| Displayables | 可视组件 | |
| Displaying Images | 显示图像 | |
| Transforms | 变换 | |
| Transform Properties | 变换特性 | |
| Transitions | 转场(transition) | |
| ATL (Animation Transformation Language) | — | SDK 页无标题；通用译"动画变换语言"，术语通常保留 ATL |
| Screens and Screen Language | 界面和界面语言 | |
| Screen Actions, Values, and Functions | 界面行为(action)、值(value)和函数 | |
| Screens and Python | 界面与Python | |
| Special Screen Names | 特殊界面名称 | |
| GUI Customization Guide | GUI(图形用户接口)定制化指导 | GUI 保留英文 |
| Styles | 样式(style) | |
| Style Properties | 样式特性(property) | |
| Saving, Loading, and Rollback | 存档、读档和回滚 | |
| Persistent Data | 持久化数据 | |
| Translation | 多语言支持 | 术语 translation 在游戏语境译"翻译/本地化" |
| In-Game Menus | 游戏内菜单 | |
| Labels & Control Flow | 脚本标签(label)和主控流程 | |
| Python Statements | Python语句 | |
| Statement Equivalents | 等效语句 | |
| Store Variables | 存储区配置项 | |
| Text Input | 文本输入 | |
| Movie | 影片 | |
| Audio | 音频 | |
| Voice | 语音 | |
| Sprites | 精灵(sprite) | |
| Layered Images | 层叠式图像 | |
| Matrixcolor | Matrixcolor | 保留英文 |
| Drag and Drop | 拖放组件 | |
| NVL-Mode Tutorial | NVL模式教程 | NVL 保留英文 |
| Speech Bubbles | 气泡式台词 | |
| Dialogue History | 对话历史 | |
| Achievements | 成就 | |
| Automated Testing | 自动化测试 | |
| Building Distributions | 构建发行版 | |
| Preference Variables | 环境设定配置 | |
| Side Images | 头像 | |
| Splashscreen and Presplash | 启动界面和加载等待 | |
| Customizing the Keymap | 定制按键映射 | |
| Image Manipulators | 图像处理器 | |
| Matrix | Matrix | 保留英文 |
| Model-Based Rendering | 基于模型的渲染器 | |
| Image Gallery, Music Room, and Replay Actions | 画廊、音乐空间和场景回放 | |
| Language Basics | 编程语言基础 | |
| Quickstart | 快速入门 | |
| Template Projects | 项目模板 | |
| Script of The Question | “The Question”游戏脚本 | |
| HTTPS/HTTP Updater | HTTPS/HTTP更新器 | |
| Web / HTML5 | Web / HTML5 | |
| Self-Voicing | 自动语音 | |
| Color Class | Color类 | |
| Configuration Variables | 配置项变量 | |
| Reserved Names | 预留名 | |
| Namespaces | 命名空间 | |
| Environment Variables | 环境变量 | |

## 二、DSH 生态术语（建议保留英文）

> 这些不是 Ren'Py 术语，来自 DSH/插件生态，中文社区无统一译法，README 中建议保留英文。

| 术语 | 说明 |
|---|---|
| preset | 代理预设（agent preset） |
| skill | 知识库文件（renpy-* skill） |
| bundle | 插件包 |
| workspace | 工作区 |
| checkpoint | 检查点 |
| lint | 语法检查（保留英文，动词化"lint 检查"） |
| gutter | 编辑器行号侧栏标记 |
| junction | 目录联接（Windows 术语） |
| repo / repository | 仓库 |
| release | 发布（GitHub Release） |

## 三、待补充（正文级术语）

> 以下需从 SDK 英文文档正文与 doc.renpy.cn 对应页面逐条提取，建议按主题分批：

- [ ] 语句/语法术语：label、menu、scene、show、hide、with、call、jump、return、define、default、init、translate
- [ ] 文本标签术语：{b} {i} {size} {color} {font} {cps} 等
- [ ] 函数/类名：renpy.say / renpy.show / Character / Transform / Displayable / Screen
- [ ] 属性术语：transform properties、style properties
- [ ] 存档相关：save / load / rollback / persistent / checkpoint
- [ ] 翻译相关：translation / language / locale

---

*生成时间：2026-08-16。对照来源：SDK 8.5.3 doc + doc.renpy.cn/zh-CN（页面标题级）。*
