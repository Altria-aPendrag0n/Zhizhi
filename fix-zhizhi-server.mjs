/**
 * Zhizhi-Server 页面修复脚本（在用户终端运行，绕过 TRAE 沙箱限制）
 * 用法：node D:\work\Zhizhi\fix-zhizhi-server.mjs
 * 功能：恢复被损坏的 db-ui-page.ts → 补回 4 处加载失败兜底 → 重新构建 → 语法验证
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = 'd:/work/Zhizhi-Server';
const page = root + '/src/db-ui-page.ts';

console.log('[1/4] git checkout 恢复干净页面...');
execSync('git checkout -f -- src/db-ui-page.ts', { cwd: root, stdio: 'inherit' });

console.log('[2/4] 应用 4 处加载失败兜底...');
let t = readFileSync(page, 'utf8');
const err = "catch(e){document.getElementById('gridWrap').innerHTML='<div class=\"empty\">加载失败，请点击「刷新」重试（错误详情见通知）</div>';return}";
const anchors = [
  "try{d=await api('/api/admin/overview?days='+S.ovDays)}",
  "try{r=await api('/api/admin/channels')}",
  "try{r=await api('/api/admin/users'+(S.usSearch?'?search='+encodeURIComponent(S.usSearch):''))}",
  "try{r=await api('/api/admin/keys'+(q.length?'?'+q.join('&'):''))}",
];
let n = 0;
for (const a of anchors) {
  if (!t.includes(a)) throw new Error('anchor missing: ' + a);
  if (t.includes(a + err)) { n++; continue; }
  t = t.replace(a, a + err);
  n++;
}
writeFileSync(page, t);
console.log('  已兜底 ' + n + '/4 处');

console.log('[3/4] 重新构建 dist...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('[4/4] 验证页面脚本语法...');
const { DB_UI_HTML } = await import(pathToFileURL(root + '/dist/db-ui-page.js'));
const vm = await import('node:vm');
const m = DB_UI_HTML.match(/<script>([\s\S]*?)<\/script>/);
new vm.Script(m[1]);

console.log('\n全部完成：页面脚本语法 OK。');
console.log('提交修复：cd D:\\work\\Zhizhi-Server; git add -A; git commit -m "fix: 管理台加载失败兜底"; git push');
console.log('然后运行 npm start，打开 http://127.0.0.1:8790 即可。');
