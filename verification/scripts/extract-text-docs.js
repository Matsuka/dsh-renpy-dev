// 混合流程①：程序化提取 renpy-text 相关文档（text/dialogue/custom_text_tags）
// 处理 Sphinx 8 结构：<section id> + <dl> 定义列表 + <table> + <pre> 代码
// 用法: node extract-text-docs.js <sdk-doc-dir> <out.json>
const fs = require('fs');
const path = require('path');

const clean = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&#160;/g, ' ')
  .replace(/\u00a0/g, ' ')
  .replace(/^\s+|\s+$/g, '')
  .replace(/[ \t]+/g, ' ');

function extractDl(html) {
  const items = [];
  const re = /<dl[^>]*>([\s\S]*?)<\/dl>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    // 只处理顶层 dt/dd 对（忽略嵌套 dl 内层）
    const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>/g;
    const ddRe = /<dd[^>]*>([\s\S]*?)<\/dd>/g;
    const dts = [];
    let x;
    while ((x = dtRe.exec(body)) !== null) dts.push(clean(x[1]));
    const dds = [];
    while ((x = ddRe.exec(body)) !== null) dds.push(clean(x[1]));
    for (let i = 0; i < dts.length; i++) {
      items.push({ k: dts[i], v: dds[i] !== undefined ? dds[i] : '' });
    }
  }
  return items;
}

function extractTables(html) {
  const tables = [];
  const re = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rm;
    while ((rm = rowRe.exec(m[1])) !== null) {
      const cells = [];
      const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) cells.push(clean(cm[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function extractCode(html) {
  const blocks = [];
  const re = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = clean(m[1]).replace(/\n ?/g, '\n');
    if (t) blocks.push(t);
  }
  return blocks;
}

function extractLis(html) {
  const out = [];
  const re = /<li><p>([\s\S]*?)<\/p><\/li>|<li>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = clean(m[1] || m[2]);
    if (t) out.push(t);
  }
  return out;
}

// 按 <section id> 切分
function sections(html) {
  const out = {};
  const re = /<section id="([^"]+)">([\s\S]*?)(?=<section id=|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

const docDir = process.argv[2];
const outFile = process.argv[3];
const result = {};

for (const name of ['text', 'dialogue', 'custom_text_tags']) {
  const html = fs.readFileSync(path.join(docDir, name + '.html'), 'utf8');
  const secs = sections(html);
  const out = {};
  for (const [id, body] of Object.entries(secs)) {
    const dl = extractDl(body);
    const tables = extractTables(body);
    const code = extractCode(body);
    const lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) {
      out[id] = { dl, tables, code, lis };
    }
  }
  result[name] = out;
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log('written', outFile);
for (const n of Object.keys(result)) {
  console.log(n, Object.keys(result[n]).length, 'sections');
}
