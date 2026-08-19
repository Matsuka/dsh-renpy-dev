// 报错落盘文件解析验证（parseTraceback / parseLog / parseErrors）
// 数据来源：verification/projects/demo-script/ 真实报错文件（锁定 Ren'Py 8.5.3 格式）
// 运行：node verification/tests/test-error-parse.js
'use strict'
const { parseTraceback, parseLog, parseErrors } = require(require('./paths').CORE_MODULE)
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++ } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// ── 真实样例：demo-script/traceback.txt（init 期 define 配置错误） ──────────
const TB1 = `I'm sorry, but an uncaught exception occurred.

While running game code:
  File "game/transitions_test.rpy", line 52, in script
    define config.scene_show_hide_transition = Dissolve(0.25)
Exception: config.scene_show_hide_transition is not a known configuration variable.

-- Full Traceback ------------------------------------------------------------

Traceback (most recent call last):
  File "game/transitions_test.rpy", line 52, in script
    define config.scene_show_hide_transition = Dissolve(0.25)
  File "renpy/ast.py", line 2473, in execute
    self.set()
    ~~~~~~~~^^
  File "renpy/ast.py", line 2489, in set
    ns.set(self.varname, value)
    ~~~~~~^^^^^^^^^^^^^^^^^^^^^
  File "renpy/common/000namespaces.rpy", line 34, in set
    setattr(self.nso, name, value)
    ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "renpy/defaultstore.py", line 100, in __setattr__
    raise Exception("config.%s is not a known configuration variable." % (name))
Exception: config.scene_show_hide_transition is not a known configuration variable.

Windows-11-10.0.26200-SP0 AMD64
Ren'Py 8.5.3.26051504
 
Sun Aug 16 21:35:45 2026
`

{
  const r = parseTraceback(TB1)
  ok(r.ok === true, 'traceback ok=true', r.ok)
  ok(r.exception && r.exception.type === 'Exception', '异常类型 Exception', r.exception)
  ok(r.exception.message === 'config.scene_show_hide_transition is not a known configuration variable.', '异常消息完整', r.exception && r.exception.message)
  ok(r.whileRunning && r.whileRunning.file === 'game/transitions_test.rpy' && r.whileRunning.line === 52, 'While 段位置', r.whileRunning)
  ok(r.whileRunning.func === 'script' && /define config\./.test(r.whileRunning.source), 'While 段源码行', r.whileRunning && r.whileRunning.source)
  ok(r.frames.length === 5, '栈帧 5 个', r.frames.length)
  ok(r.frames[1].file === 'renpy/ast.py' && r.frames[1].line === 2473 && r.frames[1].func === 'execute', '引擎帧', r.frames[1])
  ok(r.frames[4].file === 'renpy/defaultstore.py' && r.frames[4].line === 100, '最深引擎帧', r.frames[4])
  ok(r.rootFrame && r.rootFrame.file === 'game/transitions_test.rpy' && r.rootFrame.line === 52, '根因帧=用户脚本帧', r.rootFrame)
  ok(r.version === '8.5.3.26051504', '版本号', r.version)
  ok(r.platform === 'Windows-11-10.0.26200-SP0 AMD64', '平台', r.platform)
  ok(r.time === 'Sun Aug 16 21:35:45 2026', '时间', r.time)
}

// ── 变体：运行时报错，多个 game/ 帧 → 根因 = 最深的用户帧 ─────────────────
const TB2 = `I'm sorry, but an uncaught exception occurred.

While running game code:
  File "game/script.rpy", line 21, in script
    s "对话"
  File "renpy/common/000statements.rpy", line 571, in execute_say
    what = what()
  File "game/script.rpy", line 20, in _call_python
    x = 1 / 0
Exception: ZeroDivisionError: division by zero

-- Full Traceback ------------------------------------------------------------

Traceback (most recent call last):
  File "game/script.rpy", line 21, in script
    s "对话"
  File "renpy/common/000statements.rpy", line 571, in execute_say
    what = what()
  File "game/script.rpy", line 20, in _call_python
    x = 1 / 0
  File "renpy/exports.py", line 1234, in say
    return renpy.exports.say(who, what)
  File "renpy/ast.py", line 1726, in say
    what = what()
ZeroDivisionError: division by zero

Windows-11-10.0.26200-SP0 AMD64
Ren'Py 8.5.3.26051504
 
Sun Aug 16 21:35:45 2026
`
{
  const r = parseTraceback(TB2)
  ok(r.frames.length === 5, 'TB2 栈帧 5 个', r.frames.length)
  ok(r.exception.type === 'ZeroDivisionError' && r.exception.message === 'division by zero', 'TB2 异常', r.exception)
  ok(r.rootFrame.file === 'game/script.rpy' && r.rootFrame.line === 20, 'TB2 根因=最深的 game/ 帧(20 行)', r.rootFrame)
  ok(r.whileRunning.line === 21, 'TB2 While 位置=21', r.whileRunning)
}

// ── 空输入 / 无异常文本 ─────────────────────────────────────────────────────
{
  const r = parseTraceback('')
  ok(r.ok === false && r.frames.length === 0 && r.exception === null, '空输入 ok=false', r)
}

// ── log.txt：头部 + timing/info 条目 + 内嵌报错段 ─────────────────────────
const LOG1 = `2026-08-16 13:35:44 UTC
Windows-11-10.0.26200-SP0
Ren'Py 8.5.3.26051504

Early init took 25 ms
Loading error handling took 19 ms
Loading script took 524 ms
=== AUTOIMAGE-DEBUG all keys ===
    ('black',) -> Solid
    ('eileen', 'happy') -> Image

Full traceback:
  File "game/transitions_test.rpy", line 52, in script
    define config.scene_show_hide_transition = Dissolve(0.25)
  File "renpy/ast.py", line 2473, in execute
    self.set()
Exception: config.scene_show_hide_transition is not a known configuration variable.

While running game code:
  File "game/transitions_test.rpy", line 52, in script
    define config.scene_show_hide_transition = Dissolve(0.25)
Exception: config.scene_show_hide_transition is not a known configuration variable.
Running init code took 49 ms
`
{
  const r = parseLog(LOG1)
  ok(r.header.time === '2026-08-16 13:35:44 UTC', 'log 时间', r.header.time)
  ok(r.header.platform === 'Windows-11-10.0.26200-SP0', 'log 平台', r.header.platform)
  ok(r.header.version === '8.5.3.26051504', 'log 版本', r.header.version)
  const timings = r.entries.filter((e) => e.kind === 'timing')
  ok(timings.length === 4, 'timing 条目 4 个', timings.length)
  ok(timings[0].text === 'Early init took 25 ms', 'timing 文本', timings[0])
  ok(r.entries.some((e) => e.kind === 'info' && /AUTOIMAGE-DEBUG/.test(e.text)), 'info 条目', r.entries)
  ok(r.errors.length === 2, 'log 内嵌错误 2 段', r.errors.length)
  ok(r.errors[0].kind === 'Exception' && /known configuration variable/.test(r.errors[0].message), 'log 错误消息', r.errors[0])
  ok(r.errors[0].frames.length === 2 && r.errors[0].frames[0].file === 'game/transitions_test.rpy', 'log 错误帧', r.errors[0].frames)
}

// ── errors.txt：lint 脚本错误段落 ─────────────────────────────────────────
const ERR1 = `I'm sorry, but errors were detected in your script. Please correct the
errors listed below, and try again.


The label start is defined twice, at File "game/learn_comment_test.rpy", line 3:
label start:
and File "game/script.rpy", line 21:
label start:


Ren'Py Version: Ren'Py 8.5.3.26051504
Sun Aug 16 17:02:26 2026
`
{
  const r = parseErrors(ERR1)
  ok(r.errors.length === 1, 'errors 条目 1 个', r.errors.length)
  ok(r.errors[0].message === 'The label start is defined twice', 'errors 消息', r.errors[0])
  ok(r.errors[0].file === 'game/learn_comment_test.rpy' && r.errors[0].line === 3, 'errors 定位', r.errors[0])
  ok(r.version === '8.5.3.26051504', 'errors 版本', r.version)
  ok(r.time === 'Sun Aug 16 17:02:26 2026', 'errors 时间', r.time)
}

// ── errors.txt 变体：行级格式兜底（部分 lint 输出） ───────────────────────
const ERR2 = `game/script.rpy:12: expected statement.
game/other.rpy:5: 未定义的变量 x
`
{
  const r = parseErrors(ERR2)
  ok(r.errors.length === 2, '行级 errors 2 个', r.errors.length)
  ok(r.errors[0].file === 'game/script.rpy' && r.errors[0].line === 12 && r.errors[0].message === 'expected statement.', '行级 errors[0]', r.errors[0])
  ok(r.errors[1].line === 5, '行级 errors[1] 行号', r.errors[1])
}

// ── 空输入 ────────────────────────────────────────────────────────────────
{
  const r = parseErrors('')
  ok(r.errors.length === 0 && r.version === '' && r.time === '', 'errors 空输入', r)
  const r2 = parseLog('')
  ok(r2.entries.length === 0 && r2.errors.length === 0, 'log 空输入', r2)
}

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
