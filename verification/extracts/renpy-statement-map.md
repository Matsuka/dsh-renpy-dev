# Ren'Py 语句 → Python/API 映射（源码自动提取初稿）

> 来源：renpy/ast.py 语句类 execute() 静态分析（无 AI）。语义/示例待 AI 解读补全。

| 语句 | AST 类 | 关键属性 | execute 中调用的 API/内部函数 |
|---|---|---|---|
| `Say` | Say | who, who_fast, what, with_, interact, attributes, arguments, temporary_attributes, rollback, identifier, explicit_identifier | renpy.game.context, renpy.config.say_menu_text_filter, renpy.exports.say |
| `init` | Init | block, priority | renpy.execution.not_infinite_loop |
| `label` | Label | block, parameters, hide | renpy.game.context, renpy.exports.dynamic, renpy.easy.run_callbacks |
| `python` | Python | code, store, hide | renpy.python.py_exec_bytecode, renpy.game.context |
| `python early` | EarlyPython | code, store, hide | renpy.execution.not_infinite_loop |
| `image` | Image | imgname, code, atl | renpy.python.py_eval_bytecode, renpy.exports.image |
| `transform` | Transform | varname, atl, parameters, store | renpy.exports.pure |
| `show` | Show | imspec, atl | （内部调用: next_node, show_imspec） |
| `show layer` | ShowLayer | at_list, atl, layer | renpy.python.py_eval, renpy.exports.layer_at_list |
| `show layer` | Camera | at_list, atl, layer | renpy.python.py_eval, renpy.exports.layer_at_list |
| `scene` | Scene | imspec, atl, layer | renpy.config.scene |
| `with` | With | expr, paired | renpy.python.py_eval, renpy.exports.with_statement |
| `call` | Call | label, arguments, expression, global_label | renpy.python.py_eval, renpy.game.context |
| `return` | Return | expression | renpy.python.py_eval, renpy.game.context |
| `Menu` | Menu | items, statement_start, set, with_, has_caption, arguments, item_arguments, rollback | renpy.config.say_menu_text_filter, renpy.exports.say, renpy.exports.menu |
| `jump` | Jump | target, expression, global_label | renpy.python.py_eval, renpy.game.context |
| `while` | While | condition, block | renpy.python.py_eval |
| `if` | If | entries | renpy.python.py_eval |
| `UserStatement` | UserStatement | line, parsed, block, translatable, code_block, translation_relevant, rollback, subparses, atl, init_priority, init_offset | renpy.easy.run_callbacks, renpy.game.context |
| `PostUserStatement` | PostUserStatement | parent | （内部调用: next_node） |
| `define` | Define | varname, code, store, operator, index | renpy.exports.pure |
| `default` | Default | varname, code, store | renpy.python.py_eval_bytecode |
| `rpy` | RPY | rest | （内部调用: next_node） |
| `Translate` | Translate | identifier, alternate, language, block, after, alternate, language | renpy.game.context |
| `TranslateBlock` | TranslateBlock | block, language | （内部调用: next_node） |

## 说明
- statementName = execute 中 statement_name("...") 标记（引擎内部分发名）
- renpyCalls = execute 体中的 renpy.* 顶层调用
- internals = show_imspec / next_node / py_eval 等内部函数（需映射到公开 API）
