// resolve-folder 测试：按文件夹名 + 特征文件（game/ 或 .rpy）在候选根中定位绝对路径
// 背景：浏览器 <input webkitdirectory> 不暴露绝对路径（fakepath 限制），需 host 解析
const host = require(require('./paths').HOST_MODULE)

const norm = (p) => String(p).replace(/\\/g, '/').replace(/[\\/]+$/, '')
const tree = new Map()
const addDir = (p) => tree.set(norm(p), { type: 'directory' })
const addFile = (p) => tree.set(norm(p), { type: 'file' })

// 树结构（模拟 C:\Users\test 与 D:\work）：
addDir('C:/Users/test')
addDir('C:/Users/test/Documents')
addDir('C:/Users/test/Documents/MyGame')           // 命中候选1：有 game/
addDir('C:/Users/test/Documents/MyGame/game')
addFile('C:/Users/test/Documents/MyGame/game/script.rpy')
addDir('C:/Users/test/Documents/Other')
addDir('C:/Users/test/Documents/Other/MyGame')     // 同名但无特征 → 不命中
addDir('C:/Users/test/AppData')                    // SKIP_DIRS
addDir('C:/Users/test/AppData/MyGame')             // 有 game/ 但父目录被跳过
addDir('C:/Users/test/AppData/MyGame/game')
addFile('C:/Users/test/AppData/MyGame/game/a.rpy')
addDir('D:/work')
addDir('D:/work/proj')                             // 命中候选2（startDirs 下）
addDir('D:/work/proj/game')
addFile('D:/work/proj/game/script.rpy')
addDir('C:')
addDir('D:')

const fsMock = {
  async resolve(p) { return String(p) },
  async stat(p) { return tree.has(norm(p)) ? { size: 1 } : undefined },
  async listDir(p) {
    const base = norm(p)
    const kids = []
    for (const k of tree.keys()) {
      if (k === base) continue
      if (k.startsWith(base + '/')) {
        const rest = k.slice(base.length + 1)
        if (!rest.includes('/')) kids.push({ name: rest, type: tree.get(k).type })
      }
    }
    return kids
  },
  async readText() { throw new Error('no text') },
  async writeText() { /* ignore */ },
  contains() { return true },
}
const fakeSession = { append: () => ({ seq: 1 }) }
const ctx = {
  fs: fsMock,
  sessions: { list: () => [fakeSession], get: () => fakeSession },
  sandboxPolicy: { resolve: () => undefined },
  shell: { resolve: (r) => r, run: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }), start: () => ({}) },
  get: (n) => (n === 'webServer' ? { register: (o) => { handler = o.handler } } : undefined),
}
let handler = null
const oldProfile = process.env.USERPROFILE
process.env.USERPROFILE = 'C:/Users/test'
host.apply(ctx, require('./paths').HOST_CONFIG)

function req(m, u, b) { const l = {}; return { r: { method: m, url: u, on: (ev, cb) => { l[ev] = cb } }, emit: () => { if (b !== undefined) l.data && l.data(JSON.stringify(b)); l.end && l.end() } } }
function res() { let s = 0, d = ''; return { writeHead: (x) => { s = x }, end: (x) => { d = x }, status: () => s, json: () => JSON.parse(d) } }
async function call(m, u, b) { const { r, emit } = req(m, u, b); const s = res(); const p = handler(r, s); setImmediate(emit); await p; return s }

let pass = 0, fail = 0
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

;(async () => {
  console.log('1) startDirs 优先命中（当前工程父目录下）')
  let s = await call('POST', '/renpy-dev/resolve-folder?session=', { name: 'proj', startDirs: ['D:/work'] })
  ok(s.status() === 200 && s.json().path === 'D:/work/proj', '命中 ' + JSON.stringify(s.json().path))

  console.log('2) 用户目录深层命中（Documents 下，特征校验 game/）')
  s = await call('POST', '/renpy-dev/resolve-folder?session=', { name: 'MyGame', startDirs: [] })
  ok(s.json().path === 'C:/Users/test/Documents/MyGame', '命中 Documents/MyGame（非 AppData 副本）')

  console.log('3) 同名无特征目录不命中')
  s = await call('POST', '/renpy-dev/resolve-folder?session=', { name: 'Other', startDirs: [] })
  ok(s.json().path === null, 'Other 无 game/ 无 rpy → path=null')

  console.log('4) 无此名 → null')
  s = await call('POST', '/renpy-dev/resolve-folder?session=', { name: 'NoSuchGame', startDirs: [] })
  ok(s.json().path === null, '未找到 → path=null')

  console.log('5) 缺 name → error')
  s = await call('POST', '/renpy-dev/resolve-folder?session=', { startDirs: [] })
  ok(s.json().error === 'missing folder name', '缺少 name 返回 error')

  console.log(pass + ' passed, ' + fail + ' failed')
  process.env.USERPROFILE = oldProfile
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.env.USERPROFILE = oldProfile; process.exit(1) })
