// 检查点功能测试：lineDiff 单测 + mock fs 全链路（创建→修改→diff→接受/撤回）
const host = require(require('./paths').HOST_MODULE)
const { lineDiff } = host

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

// ── lineDiff 单测 ──
console.log('0) lineDiff 正确性')
{
  const base = ['a', 'b', 'c', 'd', 'e']
  let r = lineDiff(base, base)
  ok(r.hunks.length === 0 && r.added === 0 && r.removed === 0, '无改动 → 空 hunks')

  r = lineDiff(base, ['a', 'b', 'X', 'c', 'd', 'e'])
  ok(r.hunks.length === 1 && r.hunks[0].type === 'add' && r.hunks[0].newStart === 3 && r.added === 1, '中间新增 1 行 → add hunk @3')

  r = lineDiff(base, ['a', 'c', 'd', 'e'])
  ok(r.hunks.length === 1 && r.hunks[0].type === 'del' && r.hunks[0].newStart === 2 && r.removed === 1, '删除 b → del hunk @2')

  r = lineDiff(base, ['a', 'b', 'X', 'Y', 'e'])
  ok(r.added === 2 && r.removed === 2, '修改 c,d → mod（+2 -2）')
  const mod = r.hunks.find((h) => h.type === 'mod')
  ok(!!mod && mod.newStart === 3 && mod.oldStart === 3, 'mod hunk 行号正确')

  r = lineDiff([], ['x', 'y'])
  ok(r.added === 2 && r.hunks[0].type === 'add', '空→新增')

  r = lineDiff(['x', 'y'], [])
  ok(r.removed === 2 && r.hunks[0].type === 'del', '→空 全删')

  r = lineDiff(['a\n', 'b\n'], ['a\n', 'b\n', 'c\n'])
  ok(r.added === 1 && r.hunks[0].newStart === 3, '末尾新增（公共后缀裁剪不误伤）')
}

// ── mock fs + 全链路 ──
const files = new Map()
const fsMock = {
  async resolve(p) { return String(p) },
  async stat(target) { const v = files.get(String(target)); return v === undefined ? undefined : { size: v.length, version: 1 } },
  async readText(target) { const v = files.get(String(target)); if (v === undefined) throw new Error('ENOENT ' + target); return v },
  async writeText(target, content) { files.set(String(target), content) },
  async listDir(target) {
    const prefix = String(target) + '/'
    const names = new Set(); const direct = []
    for (const k of files.keys()) {
      if (!k.startsWith(prefix)) continue
      const rest = k.slice(prefix.length); const seg = rest.split('/')[0]
      if (rest.indexOf('/') >= 0) names.add(seg); else direct.push(seg)
    }
    const entries = []
    for (const n of names) entries.push({ name: n, type: 'directory', target: prefix + n })
    for (const n of direct) { const t = prefix + n; const st = await fsMock.stat(t); entries.push({ name: n, type: 'file', target: t, size: st ? st.size : 0 }) }
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
ctx.get = (n) => (n === 'webServer' ? { register: (o) => { handler = o.handler } } : undefined)
host.apply(ctx, require('./paths').HOST_CONFIG)

function req(method, url, body) { const l = {}; return { r: { method, url, on: (ev, cb) => { l[ev] = cb } }, emit: () => { if (body !== undefined) l.data && l.data(JSON.stringify(body)); l.end && l.end() } } }
function res() { let status = 0, data = ''; return { writeHead: (s) => { status = s }, end: (d) => { data = d }, status: () => status, json: () => JSON.parse(data) } }
async function call(method, url, body) { const { r, emit } = req(method, url, body); const s = res(); const p = handler(r, s); setImmediate(emit); await p; return s }

;(async () => {
  const PROJ = 'D:/cp'
  files.set(PROJ + '/game/script.rpy', 'label start:\n    "v1"\nlabel next:\n    "x"\n')
  files.set(PROJ + '/game/chars/e.rpy', 'define e = Character("E")\n')

  console.log('1) 创建检查点（快照 2 个文件）')
  let s = await call('POST', '/renpy-dev/checkpoint-create?session=', { project: PROJ })
  ok(s.status() === 200 && s.json().files === 2, '创建成功，快照 2 文件，id=' + s.json().id)
  const cpId = s.json().id

  console.log('2) 列表包含该检查点')
  s = await call('POST', '/renpy-dev/checkpoint-list?session=', { project: PROJ })
  ok(s.json().length >= 1 && s.json()[0].id === cpId, '列表倒序且含新检查点')

  console.log('3) 未修改 → diff 为空')
  s = await call('POST', '/renpy-dev/checkpoint-diff?session=', { project: PROJ, id: cpId })
  ok(s.json().summary.files === 0, '无改动 summary.files=0')

  console.log('4) 修改 script.rpy（加 2 行、删 1 行）→ diff 显示')
  files.set(PROJ + '/game/script.rpy', 'label start:\n    "v1"\nlabel next:\n    "y"\n    "z"\n    "w"\n')
  s = await call('POST', '/renpy-dev/checkpoint-diff?session=', { project: PROJ, id: cpId })
  const d = s.json()
  ok(d.summary.files === 1, '1 个文件改动')
  const f = d.files.find((x) => x.rel === 'script.rpy')
  // 基线 4 行；"x" 行被替换为 y,z,w（LCS 视为 +3 -1，行级 diff 不做相似度合并）
  ok(f && f.added === 3 && f.removed === 1, 'script.rpy +3 -1，实际 +' + (f ? f.added : '?') + ' -' + (f ? f.removed : '?'))
  ok(f && f.lineTypes[4] === 'mod' && f.lineTypes[5] === 'mod' && f.lineTypes[6] === 'mod', 'lineTypes 行标记正确（4-6=mod）')

  console.log('5) 新文件 → 全部新增')
  files.set(PROJ + '/game/new.rpy', 'label new:\n    "n"\n')
  s = await call('POST', '/renpy-dev/checkpoint-diff?session=', { project: PROJ, id: cpId })
  const f2 = s.json().files.find((x) => x.rel === 'new.rpy')
  ok(f2 && f2.added === 3 && f2.hunks[0].type === 'add', 'new.rpy 全新增（3 行含尾空串）')

  console.log('6) 个别接受 new.rpy → diff 中消失')
  s = await call('POST', '/renpy-dev/checkpoint-accept?session=', { project: PROJ, id: cpId, rel: 'new.rpy' })
  ok(s.json().ok === true && s.json().rel === 'new.rpy', 'accept 返回 ok')
  s = await call('POST', '/renpy-dev/checkpoint-diff?session=', { project: PROJ, id: cpId })
  ok(!s.json().files.some((x) => x.rel === 'new.rpy'), 'new.rpy 不再出现在 diff')

  console.log('7) 个别撤回 script.rpy → 内容恢复基线')
  s = await call('POST', '/renpy-dev/checkpoint-revert?session=', { project: PROJ, id: cpId, rel: 'script.rpy' })
  ok(s.json().ok === true, 'revert 返回 ok')
  ok(files.get(PROJ + '/game/script.rpy').indexOf('"x"') >= 0 && files.get(PROJ + '/game/script.rpy').indexOf('"y"') < 0, 'script.rpy 已恢复基线内容')

  console.log('8) 全部撤回后 diff 为空')
  s = await call('POST', '/renpy-dev/checkpoint-diff?session=', { project: PROJ, id: cpId })
  ok(s.json().summary.files === 0, '撤回后无改动')

  console.log(pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
