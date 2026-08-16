// feed reasoning 提取测试
const host = require(require('./paths').HOST_MODULE)
const fsMock = {
  async resolve(p) { return String(p) },
  async stat() { return undefined },
  async readText(t) { throw new Error('ENOENT ' + t) },
  async writeText() {},
  async listDir() { return [] },
  contains() { return true },
}
let handler = null
const ctx = {
  fs: fsMock,
  sessions: {
    list: () => [fakeSession],
    get: (id) => (id === 's1' ? fakeSession : undefined),
  },
  sandboxPolicy: { resolve: () => undefined },
  shell: { resolve: (r) => r, run: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }), start: () => ({}) },
  get: (n) => (n === 'webServer' ? { register: (o) => { handler = o.handler } } : undefined),
}
// 会话：含 reasoning + 文本的助手消息、含工具调用的消息
const fakeSession = {
  deriveMessages: () => [
    { id: 'm1', role: 'user', content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } },
    { id: 'm2', role: 'assistant', content: [{ type: 'reasoning', text: '思考过程：需要先检查脚本。\n第二步……' }, { type: 'text', text: '已检查，结论如下。' }], source: { kind: 'model', provider: 'x', model: 'y' } },
    { id: 'm3', role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'renpy_lint', arguments: '{"project":"x"}' }], source: { kind: 'model', provider: 'x', model: 'y' } },
    { id: 'm4', role: 'assistant', content: [{ type: 'tool-call', id: 'c2', name: 'edit', arguments: '{"file_path":"game/script.rpy","old_string":"label start:","new_string":"label start2:"}' }, { type: 'text', text: '改好了' }], source: { kind: 'model', provider: 'x', model: 'y' } },
  ],
}
host.apply(ctx, require('./paths').HOST_CONFIG)
function req(m, u, b) { const l = {}; return { r: { method: m, url: u, on: (ev, cb) => { l[ev] = cb } }, emit: () => { if (b !== undefined) l.data && l.data(JSON.stringify(b)); l.end && l.end() } } }
function res() { let s = 0, d = ''; return { writeHead: (x) => { s = x }, end: (x) => { d = x }, status: () => s, json: () => JSON.parse(d) } }
async function call(m, u, b) { const { r, emit } = req(m, u, b); const s = res(); const p = handler(r, s); setImmediate(emit); await p; return s }

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

;(async () => {
  const s = await call('POST', '/renpy-dev/feed?session=s1', {})
  const f = s.json()
  ok(f.chat.length === 3, '3 条对话消息（用户+2 助手），工具调用进 trail')
  const m2 = f.chat.find((c) => c.id === 'm2')
  ok(m2 && m2.r === 1, '助手消息带思考标记 r=1')
  ok(m2 && m2.rText && m2.rText.indexOf('思考过程') >= 0, 'rText 含推理内容')
  ok(m2 && m2.text.indexOf('已检查') >= 0, '正文正常（不含推理）')
  const u1 = f.chat.find((c) => c.id === 'm1')
  ok(u1 && u1.r === 0, '用户消息无思考标记')
  ok(f.trail.length === 2 && f.trail[0].name === 'renpy_lint' && f.trail[0].done === false, '工具调用在 trail')
  const ed = f.trail.find((t) => t.name === 'edit')
  ok(!!ed && ed.kind === 'edit' && ed.file === 'game/script.rpy', '编辑类工具提取 kind=edit 与 file')
  console.log(pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
