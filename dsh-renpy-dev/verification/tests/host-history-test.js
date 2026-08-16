// host.js 保存历史/回滚全链路测试：mock fs + sessions + webServer
const host = require(require('./paths').HOST_MODULE)

// ── mock fs（内存） ──
const files = new Map() // absKey -> content
const fsMock = {
  async resolve(p) { return String(p) },
  async stat(target) {
    const v = files.get(String(target))
    if (v === undefined) return undefined
    return { size: v.length, version: 1 }
  },
  async readText(target) {
    const v = files.get(String(target))
    if (v === undefined) throw new Error('ENOENT ' + target)
    return v
  },
  async writeText(target, content) { files.set(String(target), content) },
  async listDir(target) {
    const prefix = String(target) + '/'
    const names = new Set()
    const direct = []
    for (const k of files.keys()) {
      if (!k.startsWith(prefix)) continue
      const rest = k.slice(prefix.length)
      const seg = rest.split('/')[0]
      if (rest.indexOf('/') >= 0) names.add(seg)
      else direct.push(seg)
    }
    const entries = []
    for (const n of names) entries.push({ name: n, type: 'directory', target: prefix + n })
    for (const n of direct) {
      const t = prefix + n
      const st = await fsMock.stat(t)
      entries.push({ name: n, type: 'file', target: t, size: st ? st.size : 0 })
    }
    return entries
  },
  contains() { return true },
}
const ctx = {
  fs: fsMock,
  sessions: { list: () => [], get: () => undefined },
  sandboxPolicy: { resolve: () => undefined },
  shell: { resolve: (r) => r, run: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }), start: () => ({}) },
  get: () => undefined,
}
let handler = null
const webServerMock = { register: (o) => { handler = o.handler } }
ctx.get = (n) => (n === 'webServer' ? webServerMock : undefined)

host.apply(ctx, require('./paths').HOST_CONFIG)

function req(method, url, body) {
  const l = {}
  const r = { method, url, on: (ev, cb) => { l[ev] = cb } }
  return { r, emit: () => { if (body !== undefined) l.data && l.data(JSON.stringify(body)); l.end && l.end() } }
}
function res() {
  let status = 0, data = ''
  return { writeHead: (s) => { status = s }, end: (d) => { data = d }, status: () => status, json: () => JSON.parse(data) }
}
async function call(method, url, body) {
  const { r, emit } = req(method, url, body)
  const s = res()
  const p = handler(r, s) // async 同步段会注册 readBody 监听
  setImmediate(emit) // 下一轮事件循环触发 data/end
  await p
  return s
}

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

;(async () => {
  const PROJ = 'D:/proj'
  const rel = 'script.rpy'
  files.set(PROJ + '/game/' + rel, 'label start:\n    "v1"\n')

  console.log('1) 保存 v2（应备份 v1）')
  let s = await call('POST', '/renpy-dev/write-file?session=', { path: PROJ + '/game/' + rel, content: 'label start:\n    "v2"\n' })
  ok(s.status() === 200, 'write-file 返回 200')
  ok(files.get(PROJ + '/game/' + rel).indexOf('"v2"') >= 0, '文件已更新为 v2')

  console.log('2) 历史列表（应有 1 个版本 = v1）')
  s = await call('POST', '/renpy-dev/history?session=', { project: PROJ, rel })
  ok(s.status() === 200, 'history 200')
  const v1 = s.json().versions
  ok(v1.length === 1, '1 个版本，实际 ' + v1.length)
  ok(v1[0].size > 0, '版本带 size')

  console.log('3) 预览备份内容（应为 v1）')
  s = await call('POST', '/renpy-dev/history-read?session=', { project: PROJ, rel, time: v1[0].time })
  ok(s.status() === 200 && s.json().content.indexOf('"v1"') >= 0, '预览内容为 v1')

  console.log('4) 再保存 v3（应产生第 2 个版本）')
  await call('POST', '/renpy-dev/write-file?session=', { path: PROJ + '/game/' + rel, content: 'label start:\n    "v3"\n' })
  s = await call('POST', '/renpy-dev/history?session=', { project: PROJ, rel })
  ok(s.json().versions.length === 2, '2 个版本')

  console.log('5) 恢复到 v1')
  s = await call('POST', '/renpy-dev/restore?session=', { project: PROJ, rel, time: v1[0].time })
  ok(s.status() === 200 && s.json().ok === true, 'restore 200 ok')
  ok(files.get(PROJ + '/game/' + rel).indexOf('"v1"') >= 0, '文件已恢复为 v1')

  console.log('6) 无历史文件时返回空列表')
  s = await call('POST', '/renpy-dev/history?session=', { project: PROJ, rel: 'none.rpy' })
  ok(Array.isArray(s.json().versions) && s.json().versions.length === 0, '空列表')

  console.log(pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
