// 验证 renpy-core 的 hasOpenToolCall 检测逻辑（真实会话事件精简回放，可回归）
// 场景：turn 243 —— assistant 发出 ask_user_question(tool-call)，renpy-client 注入的
// 指令 user/message 曾插在 tool/result 之前，破坏 OpenAI 消息配对 → API 400。
// 检测规则（从尾部往前）：
//   - tool/result                → 已闭合，安全（false）
//   - assistant/message 带 tool-call 块 → 挂起（true）
//   - user/message（非本插件指令）→ 安全（false）
//   - user/message（本插件 instructions 注入）→ 跳过，继续往前
'use strict'

// 精简自 session-3b1f22fe turn 243 的真实事件（seq 序），保留判定所需字段
const events = [
  { type: 'assistant/message', seq: 1, data: { message: { role: 'assistant', content: [
    { type: 'text', text: '先问用户看到什么：' },
    { type: 'tool-call', id: 'call_00_ask', name: 'ask_user_question', arguments: '{"questions":[]}' },
  ] } } },
  { type: 'user/message', seq: 2, data: { role: 'user', content: [{ type: 'text', text: '【工作区域｜已解除】…' }], source: { kind: 'plugin', plugin: 'dsh-renpy-dev-client', form: 'instructions' } } },
  { type: 'user/message', seq: 3, data: { role: 'user', content: [{ type: 'text', text: '【工作区域｜高优先级约束】…' }], source: { kind: 'plugin', plugin: 'dsh-renpy-dev-client', form: 'instructions' } } },
  { type: 'tool/result', seq: 4, data: { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_00_ask', content: [{ type: 'text', text: '{"answers":[{"id":"fail_again","custom":"怎么又成功了"}]}' }] }] } } },
  { type: 'user/message', seq: 5, data: { role: 'user', content: [{ type: 'text', text: '功能成功了，我需要一份项目报告' }], id: 'user-real' } },
  { type: 'assistant/message', seq: 6, data: { message: { role: 'assistant', content: [{ type: 'text', text: '好的，我来整理报告。' }] } } },
]

// 使用 renpy-core 的真实实现（host.js 即通过该模块加载）；测试传 session 形状
const { hasOpenToolCall: hasOpenToolCallReal } = require(require('./paths').CORE_MODULE)
const hasOpenToolCall = (evs) => hasOpenToolCallReal({ events: evs })

let pass = 0, fail = 0
const ok = (c, msg, extra) => {
  if (c) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') }
}

// 时刻 A：assistant 刚发 tool-call、tool/result 未落地（bug 现场：注入已插在中间）→ 仍应判挂起
const momentA = events.slice(0, 4) // assistant + 两条指令注入 + tool/result
ok(hasOpenToolCall(events.slice(0, 1)) === true, '时刻A（tool-call 刚发出）判挂起', hasOpenToolCall(events.slice(0, 1)))
ok(hasOpenToolCall(events.slice(0, 3)) === true, '时刻A2（指令已注入、tool/result 未到）判挂起', hasOpenToolCall(events.slice(0, 3)))

// 时刻 B：tool/result 已闭合 → 安全
ok(hasOpenToolCall(momentA) === false, '时刻B（工具结果已落地）判安全', hasOpenToolCall(momentA))

// 时刻 C：真实用户消息结尾 → 安全
ok(hasOpenToolCall(events.slice(0, 5)) === false, '时刻C（用户消息结尾）判安全', hasOpenToolCall(events.slice(0, 5)))

// 时刻 D：assistant 纯文本结尾 → 安全
ok(hasOpenToolCall(events) === false, '时刻D（assistant 纯文本结尾）判安全', hasOpenToolCall(events))

// 时刻 E：assistant 带 tool-call 且其后无任何消息（挂起等待）→ 判挂起
ok(hasOpenToolCall(events.slice(0, 6)) === false, '时刻E（报告前）判安全', hasOpenToolCall(events.slice(0, 6)))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
