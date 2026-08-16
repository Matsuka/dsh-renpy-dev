// 单次调用 teachFile 的 JSON 解析逻辑验证（模拟 llm 输出的各种形态）
// 解析逻辑与 host.js teachFile 相同：剥 ```json 包裹 → 提取 {...} → JSON.parse → 宽松回退
let p = 0, f = 0
const ok = (c, msg, extra) => { if (c) { p++; } else { f++; console.log('  ✗ FAIL:', msg, extra !== undefined ? '| got ' + JSON.stringify(extra) : '') } }

// 复刻 host.js 解析逻辑（新版：严格 JSON 失败后无条件正则回退）
const parseTeach = (out) => {
  let jsonStr = String(out).trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(jsonStr)
  if (fence) jsonStr = fence[1].trim()
  const brace = jsonStr.indexOf('{')
  const braceEnd = jsonStr.lastIndexOf('}')
  let parsed = null
  if (brace >= 0 && braceEnd > brace) {
    try {
      parsed = JSON.parse(jsonStr.slice(brace, braceEnd + 1))
    } catch (e) { parsed = null }
  }
  if (!parsed || typeof parsed !== 'object') {
    const fallback = {}
    for (const m of jsonStr.matchAll(/"(\d+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      fallback[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, ' ')
    }
    parsed = Object.keys(fallback).length ? fallback : null
  }
  return parsed && typeof parsed === 'object' ? parsed : null
}

// 1. 纯 JSON
ok(JSON.stringify(parseTeach('{"3": "define 定义常量"}')) === '{"3":"define 定义常量"}', '纯 JSON', parseTeach('{"3": "x"}'))

// 2. ```json 包裹
ok(parseTeach('```json\n{"9": "if 判断"}\n```') && parseTeach('```json\n{"9": "if 判断"}\n```')['9'] === 'if 判断', 'json 围栏', parseTeach('```json\n{"9": "if 判断"}\n```'))

// 3. 前后有杂散文字
ok(parseTeach('以下是注释：\n{"5": "scene 清空层"}\n完毕。') && parseTeach('以下是注释：\n{"5": "scene 清空层"}\n完毕。')['5'] === 'scene 清空层', '杂散文字', '')

// 4. 多行 JSON
const multi = '{"1": "a", "2": "b", "3": "c"}'
ok(JSON.stringify(parseTeach(multi)) === '{"1":"a","2":"b","3":"c"}', '多行', parseTeach(multi))

// 5. 宽松回退：不完整 JSON（缺右括号但键值闭合）→ 正则提取
const broken = '{"9": "if 判断", "12": "return 返回"'
ok(parseTeach(broken)['9'] === 'if 判断', '宽松回退提取', parseTeach(broken))
ok(parseTeach(broken)['12'] === 'return 返回', '宽松回退多条', parseTeach(broken))

// 6. 无 JSON → null
ok(parseTeach('什么都没有') === null, '无 JSON 返回 null', parseTeach('什么都没有'))

// 7. 注释含引号/中文
const quotes = '{"3": "他说\\"你好\\"，这是 define"}'
ok(parseTeach(quotes)['3'] === '他说"你好"，这是 define', '引号转义', parseTeach(quotes))

// 8. 空对象
ok(parseTeach('{}') && Object.keys(parseTeach('{}')).length === 0, '空对象', '')

console.log(p + ' passed, ' + f + ' failed')
process.exit(f ? 1 : 0)
