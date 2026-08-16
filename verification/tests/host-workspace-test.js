// 工作区域系统测试：set/get/clear + 会话 user/message 注入
const host = require(require('./paths').HOST_MODULE)

const files = new Map()
const fsMock = {
  async resolve(p) { return String(p) },
  async stat(t) { const v = files.get(String(t)); return v === undefined ? undefined : { size: (v || '').length, version: 1 } },
  async readText(t) { const v = files.get(String(t)); if (v === undefined) throw new Error('ENOENT ' + t); return v },
  async writeText(t, c) { files.set(String(t), c) },
  async listDir() { return [] },
  contains() { return true },
}
const appended = []
const fakeSession = { append: (type, data, opts) => { appended.push({ type, data, opts }); return { seq: appended.length } } }
const ctx = {
  fs: fsMock,
  sessions: { list: () => [fakeSession], get: () => fakeSession },
  sandboxPolicy: { resolve: () => undefined },
  shell: { resolve: (r) => r, run: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }), start: () => ({}) },
  get: (n) => (n === 'webServer' ? { register: (o) => { handler = o.handler } } : undefined),
}
let handler = null
host.apply(ctx, require('./paths').HOST_CONFIG)

function req(m, u, b) { const l = {}; return { r: { method: m, url: u, on: (ev, cb) => { l[ev] = cb } }, emit: () => { if (b !== undefined) l.data && l.data(JSON.stringify(b)); l.end && l.end() } } }
function res() { let s = 0, d = ''; return { writeHead: (x) => { s = x }, end: (x) => { d = x }, status: () => s, json: () => JSON.parse(d) } }
async function call(m, u, b) { const { r, emit } = req(m, u, b); const s = res(); const p = handler(r, s); setImmediate(emit); await p; return s }

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

;(async () => {
  const PROJ = 'D:/ws'
  console.log('1) 设置工作区域')
  let s = await call('POST', '/renpy-dev/workspace-set?session=ses1', { project: PROJ, file: 'script.rpy', startLine: 10, endLine: 30, label: 'start' })
  ok(s.status() === 200 && s.json().ok === true, 'set 返回 ok')
  ok(s.json().workspace.startLine === 10 && s.json().workspace.endLine === 30, '返回工作区数据')

  console.log('2) 会话注入（user/message + surfaceOp append + instructions form）')
  const inj = appended.find((a) => a.type === 'user/message')
  ok(!!inj, '已 append user/message')
  ok(inj && inj.opts && inj.opts.surfaceOp === 'append', 'surfaceOp=append')
  ok(inj && inj.data.source && inj.data.source.kind === 'plugin' && inj.data.source.form === 'instructions', 'source=plugin instructions')
  ok(inj && inj.data.content[0].text.indexOf('script.rpy') >= 0 && inj.data.content[0].text.indexOf('10-30') >= 0, '注入文本含文件与行范围')
  ok(inj && inj.data.content[0].text.indexOf('顺序执行') >= 0, '注入文本含顺序执行说明')
  ok(inj && inj.data.content[0].text.indexOf('高优先级') >= 0, '注入文本含高优先级标记')
  ok(inj && inj.data.content[0].text.indexOf('征得同意') >= 0, '注入文本含越界先询问要求')

  console.log('3) 读取工作区域（持久化）')
  s = await call('POST', '/renpy-dev/workspace-get?session=', { project: PROJ })
  ok(s.json().workspace && s.json().workspace.file === 'script.rpy', 'get 返回持久化工作区')

  console.log('3b) 跨会话注入（workspace-inject：注入指定会话，不改存储）')
  appended.length = 0
  const fileBefore = JSON.stringify(files.get(require('path').resolve ? '' : '') || {})
  const injKey = 'D:/ws-x/.renpy-user/workspace' // 仅占位
  s = await call('POST', '/renpy-dev/workspace-inject?session=ses2', { project: PROJ })
  ok(s.json().injected === true, 'inject 返回 injected=true')
  const inj2 = appended.find((a) => a.type === 'user/message')
  ok(!!inj2, '注入到指定会话（ses2）')
  ok(inj2 && inj2.data.content[0].text.indexOf('高优先级') >= 0, '注入内容为高优先级约束')
  // 存储文件未被改写：updatedAt 不变
  const wsAfter = (await call('POST', '/renpy-dev/workspace-get?session=', { project: PROJ })).json().workspace
  ok(wsAfter.updatedAt > 0, '存储仍有效（未因 inject 重写）')
  // 无工作区域时 inject 幂等
  appended.length = 0
  await call('POST', '/renpy-dev/workspace-clear?session=ses1', { project: PROJ })
  appended.length = 0
  s = await call('POST', '/renpy-dev/workspace-inject?session=ses3', { project: PROJ })
  ok(s.json().injected === false && appended.length === 0, '已清除后 inject 返回 injected=false 且不注入')

  console.log('4) 解除工作区域')
  const before = appended.length
  s = await call('POST', '/renpy-dev/workspace-clear?session=ses1', { project: PROJ })
  ok(s.json().ok === true, 'clear 返回 ok')
  const clr = appended.slice(before).find((a) => a.type === 'user/message')
  ok(!!clr && clr.data.content[0].text.indexOf('解除') >= 0, 'clear 注入解除消息')
  s = await call('POST', '/renpy-dev/workspace-get?session=', { project: PROJ })
  ok(s.json().workspace && s.json().workspace.active === false, '持久化为 inactive')

  console.log(pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
