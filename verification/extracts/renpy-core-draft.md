# Ren'Py 语句 ↔ Python 等价映射（语义层草案，混合流程②）

> 依据：ast-statement-map.json（源码自动提取）+ renpy/ast.py execute() 逐条核验。
> 格式：每条 = Ren'Py 语法 / Python 等价 / 语义 / 注意 / 源码依据。

## say — 对话

- **Ren'Py**: `e "你好"`（角色对话）；`"旁白"`（无角色）
- **Python**: `e("你好")`（Character 对象调用 → `renpy.say(e, "你好")`）；`renpy.say(None, "旁白")`
- **语义**: 显示一句对话并**等待交互**（点击/按键继续）
- **注意**: 谁（who）必须是 Character 对象/可调用/None；`renpy.say` 会经过 say_menu_text_filter
- **依据**: Say.execute → statement_name("say") → renpy.exports.say(who, what)；interact=True

## label / jump / call / return — 流程控制

- **Ren'Py**: `label start:` / `jump start` / `call sub` / `return`
- **Python**: `start: 可跳转代码块` / `renpy.jump("start")` / `renpy.call("sub")` / `renpy.return_()`
- **语义**: label 定义跳转目标；jump 无条件跳转（**不返回**）；call 压栈调用（call 后 return 回到 call 处）；return 弹栈
- **注意**: `jump` 等价 `renpy.jump`（脚本查找 + 直接切换）；`call sub(args)` 带参 → `renpy.call`；`return expr` → `renpy.return_(expr)`（存 _return）
- **依据**: Jump.execute → script.lookup + next_node；Call.execute → context.call；Return.execute → _return = py_eval

## show / scene / hide — 图像

- **Ren'Py**: `show e at right` / `scene bg hall` / `hide e`
- **Python**: `renpy.show("e", at_list=[right])` / `renpy.scene(); renpy.show("bg hall")` / `renpy.hide("e")`
- **语义**: show 在指定层显示图像（tag 替换同名）；scene 清空当前层再显示；hide 隐藏
- **注意**: show 的 imspec 含 名称/表达式/标签/at_list/层/zorder/behind（show_imspec 解析）；scene 先 scene() 再 show
- **依据**: Show.execute → show_imspec → renpy.config.show；Scene.execute → 清层 + show_imspec

## with — 过渡

- **Ren'Py**: `with fade` / `with dissolve`
- **Python**: `renpy.with_statement(fade)` / `renpy.with_statement(dissolve)`
- **语义**: 应用一个过渡（Transition 对象）
- **依据**: With.execute → renpy.exports.with_statement

## menu — 选择菜单

- **Ren'Py**:
  ```
  menu:
      "选项A":
          jump a
      "选项B":
          jump b
  ```
- **Python**: `renpy.menu([("选项A", "a"), ("选项B", "b")])`（返回选中值）
- **语义**: 显示选择菜单，玩家选择后进入对应分支
- **注意**: menu 本质 = 展示 + say 交互；有 caption 时走 menu-with-caption 路径
- **依据**: Menu.execute → renpy.exports.menu / renpy.exports.say

## python / $ / define / default — Python 直接层

- **Ren'Py**: `python:` 块 / `$ x = 1` / `define x = 1` / `default x = 1`
- **Python**: **直接就是 Python**（py_exec_bytecode / py_eval）
- **语义**: python/$ 在运行时执行；define 在 **init 阶段**赋值（常量）；default 在 init 阶段设默认值（可存档覆盖）
- **注意**: define 用于编译期常量；default 用于变量（存档时保存）；两者都在 init 阶段，顺序敏感
- **依据**: Python.execute → py_exec_bytecode；Define/Default 的 execute_init

## image / transform — 定义层

- **Ren'Py**: `image name = "path.png"` / `transform t:`
- **Python**: `renpy.image("name", "path.png")` / ATL transform（编译为变换对象，renpy.exports.pure 装饰）
- **语义**: image 注册图像名→显示对象；transform 定义 ATL 变换（可复用于 show at）
- **依据**: Image.execute → renpy.exports.image；Transform → renpy.exports.pure

## if / while — 条件与循环

- **Ren'Py**: `if x:` / `while x:`
- **Python**: **本身就是 Python 条件/循环**（条件 py_eval）
- **依据**: If.execute / While.execute → py_eval

---

## 自动化 vs 人工边界（混合流程结论）

| 层 | 自动化 | 人工/AI |
|---|---|---|
| 语句类清单 / 属性 / 调用的 API | ✅ 脚本扫 ast.py | |
| 内部函数→公开 API（show_imspec→renpy.show） | ⚠️ 半自动（固定映射表，可脚本对照） | 需要核验链 |
| 语义说明 / Python 等价 / 示例 / 常见坑 | | ✅ 需 AI 解读 + 源码核验 |
| 语法文本形式（parser.py） | ⚠️ 可扫 | 需整理 |

## 验证

- 示例映射（say/menu/show）已与 execute() 源码逐条核验
- 待做：示例进 scaffold 项目 lint/编译验证（下一步）
