// 渲染 atl-doc-extract.json 为可读预览
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = (process.argv[3] || '').split(',').filter(Boolean);
const lines = [];
for (const [doc, sections] of Object.entries(j)) {
  for (const [id, s] of Object.entries(sections)) {
    if (only.length && !only.includes(doc + '.' + id)) continue;
    lines.push(`\n## ${doc} / ${id}`);
    for (const it of s.dl || []) lines.push(`- **${it.k}**: ${it.v}`);
    for (const t of s.tables || []) lines.push('| ' + t.map(c => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
    for (const c of (s.code || []).slice(0, 6)) lines.push('```\n' + c + '\n```');
    for (const li of (s.lis || []).slice(0, 10)) lines.push(`- ${li}`);
  }
}
fs.writeFileSync(process.argv[2].replace('.json', '.preview.md'), lines.join('\n'));
console.log('preview written,', lines.length, 'lines');
