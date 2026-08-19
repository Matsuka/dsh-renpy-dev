// pick-folder 端点测试：命令生成（-STA 重入 + FolderBrowserDialog 脚本）+ 输出解析（不实际弹对话框）
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
const fakeSession = { append: () => ({ seq: 1 }) }
let lastCmd = ''
const ctx = {
  fs: fsMock,
  sessions: { list: () => [fakeSession], get: () => fakeSession },
  sandboxPolicy: { resolve: () => undefined },
  shell: {
    resolve: (r) => r,
    run: async (spec) => { lastCmd = spec.command; return { exitCode: 0, stdout: { text: 'D:\\picked\\workspace\r\n' }, stderr: { text: '' } } },
    start: () => ({}),
  },
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
  console.log('1) pick-folder 成功返回路径')
  let s = await call('POST', '/renpy-dev/pick-folder?session=ses1', { startPath: 'D:/ws' })
  ok(s.status() === 200 && s.json().path === 'D:\\picked\\workspace', '解析出选中的文件夹路径')

  console.log('2) 生成的命令（STA 重入 + 脚本落盘）')
  ok(lastCmd.indexOf('-STA') >= 0, '以 -STA 重入执行')
  ok(lastCmd.indexOf('-File') >= 0 && lastCmd.indexOf('pick-folder.ps1') >= 0, '脚本落盘后 -File 执行')
  ok(lastCmd.indexOf('Get-Command pwsh') >= 0 && lastCmd.indexOf('Get-Command powershell') >= 0, 'pwsh 缺失时回退 powershell')
  const ps1 = [...files.keys()].find((k) => String(k).endsWith('pick-folder.ps1'))
  ok(!!ps1, '已写入 pick-folder.ps1')
  ok(ps1 && files.get(ps1).indexOf('FolderBrowserDialog') >= 0, '脚本含 FolderBrowserDialog')
  ok(ps1 && files.get(ps1).indexOf('ShowNewFolderButton') >= 0, '允许新建文件夹')
  ok(ps1 && files.get(ps1).indexOf('"D:/ws"') >= 0, '起始路径注入脚本（JSON 字符串）')
  ok(lastCmd.indexOf('Remove-Item') >= 0, '结束后清理脚本文件')

  console.log('3) 用户取消（无输出）→ path null')
  ctx.shell.run = async () => ({ exitCode: 0, stdout: { text: '\r\n' }, stderr: { text: '' } })
  s = await call('POST', '/renpy-dev/pick-folder?session=', { startPath: '' })
  ok(s.json().path === null, '无输出视为取消，path=null')

  console.log('4) 无可用 shell → ERR 行被过滤，path null')
  ctx.shell.run = async () => ({ exitCode: 0, stdout: { text: 'ERR:NO_SHELL\r\n' }, stderr: { text: '' } })
  s = await call('POST', '/renpy-dev/pick-folder?session=', {})
  ok(s.json().path === null, 'ERR 行不当作路径')

  console.log('5) 执行失败 → error 字段')
  ctx.shell.run = async () => ({ exitCode: 1, stdout: { text: '' }, stderr: { text: 'boom' } })
  s = await call('POST', '/renpy-dev/pick-folder?session=', {})
  ok(s.json().error && s.json().error.indexOf('boom') >= 0, 'exitCode!=0 返回 error')

  console.log(pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
