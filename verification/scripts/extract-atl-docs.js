// 混合流程①：程序化提取 ATL 相关文档（transforms.html ATL 节 + transform_properties.html 属性表）
// 用法: node extract-atl-docs.js <sdk-doc-dir> <out.json>
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
    const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>/g;
    const ddRe = /<dd[^>]*>([\s\S]*?)<\/dd>/g;
    const dts = [], dds = [];
    let x;
    while ((x = dtRe.exec(body)) !== null) dts.push(clean(x[1]));
    while ((x = ddRe.exec(body)) !== null) dds.push(clean(x[1]));
    for (let i = 0; i < dts.length; i++) items.push({ k: dts[i], v: dds[i] !== undefined ? dds[i] : '' });
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

function sections(html) {
  const out = {};
  const re = /<section id="([^"]+)">([\s\S]*?)(?=<section id=|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) out[m[1]] = m[2];
  return out;
}

const docDir = process.argv[2];
const outFile = process.argv[3];
const result = {};

// transforms.html：全节提取（ATL 是核心）
{
  const html = fs.readFileSync(path.join(docDir, 'transforms.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.transforms = out;
}
// transform_properties.html：只取属性定义表（dl）
{
  const html = fs.readFileSync(path.join(docDir, 'transform_properties.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.properties = out;
}
// transitions.html：预定义转场表
{
  const html = fs.readFileSync(path.join(docDir, 'transitions.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.transitions = out;
}
// matrixcolor.html：矩阵色彩
{
  const html = fs.readFileSync(path.join(docDir, 'matrixcolor.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.matrixcolor = out;
}
// screens.html：screen 语言（用户界面）
{
  const html = fs.readFileSync(path.join(docDir, 'screens.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.screens = out;
}
// style.html：样式基础
{
  const html = fs.readFileSync(path.join(docDir, 'style.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.style = out;
}
// screen_actions.html：action / values / functions
{
  const html = fs.readFileSync(path.join(docDir, 'screen_actions.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.actions = out;
}
// screen_special.html：特殊 screen（say/menu/input/choice）
{
  const html = fs.readFileSync(path.join(docDir, 'screen_special.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.special = out;
}
// translation.html：本地化/翻译
{
  const html = fs.readFileSync(path.join(docDir, 'translation.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.translation = out;
}
// layeredimage.html：分层图像
{
  const html = fs.readFileSync(path.join(docDir, 'layeredimage.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.layeredimage = out;
}
// transitions.html：转场
{
  const html = fs.readFileSync(path.join(docDir, 'transitions.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.transitions = out;
}
// displaying_images.html：图像显示 + im 操作
{
  const html = fs.readFileSync(path.join(docDir, 'displaying_images.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.displaying_images = out;
}
// save_load_rollback.html：存档/读档/回滚
{
  const html = fs.readFileSync(path.join(docDir, 'save_load_rollback.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.saveload = out;
}
// sprites.html / drag_drop.html / movie.html：特殊显示对象
for (const [name, file] of [['sprites', 'sprites.html'], ['dragdrop', 'drag_drop.html'], ['movie', 'movie.html']]) {
  const html = fs.readFileSync(path.join(docDir, file), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result[name] = out;
}
// gui.html：GUI 定制指南
{
  const html = fs.readFileSync(path.join(docDir, 'gui.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.gui = out;
}
// testcases.html：自动化测试
{
  const html = fs.readFileSync(path.join(docDir, 'testcases.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.testcases = out;
}
// build.html：构建发布
{
  const html = fs.readFileSync(path.join(docDir, 'build.html'), 'utf8');
  const out = {};
  for (const [id, body] of Object.entries(sections(html))) {
    const dl = extractDl(body), tables = extractTables(body), code = extractCode(body), lis = extractLis(body);
    if (dl.length || tables.length || code.length || lis.length) out[id] = { dl, tables, code, lis };
  }
  result.build = out;
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log('written', outFile);
for (const n of Object.keys(result)) console.log(n, Object.keys(result[n]).length, 'sections');
