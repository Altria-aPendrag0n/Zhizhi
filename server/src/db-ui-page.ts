export const DB_UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>知枝 · SQLite 控制台</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#131311;--panel:#1a1a17;--panel2:#21211d;--line:#2c2c27;--line2:#3a3a33;
  --text:#ddd9cb;--dim:#94907f;--faint:#6b6858;
  --accent:#e6b450;--accent-ink:#1a1503;--teal:#8fc0ae;--danger:#d97757;--danger-ink:#2a0f06;
  --mono:"Cascadia Code","JetBrains Mono","Fira Code",Consolas,"Courier New",monospace;
}
html,body{height:100%}
body{font:13px/1.6 var(--mono);color:var(--text);background:radial-gradient(1100px 700px at 75% -20%,#1d1c16 0%,var(--bg) 55%) fixed}
button{font-family:inherit}
::selection{background:rgba(230,180,80,.28)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#35352d;border-radius:6px;border:2px solid var(--bg)}
::-webkit-scrollbar-thumb:hover{background:#45453a}

#app{display:grid;grid-template-columns:236px 1fr;grid-template-rows:1fr auto;grid-template-areas:"side main" "drawer drawer";height:100vh;animation:rise .4s ease}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes slide-up{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}

#side{grid-area:side;display:flex;flex-direction:column;background:var(--panel);border-right:1px solid var(--line);min-height:0}
.side-head{padding:16px 14px 12px;border-bottom:1px solid var(--line)}
.brand{font-size:14px;font-weight:700;letter-spacing:.5px}
.brand-mark{color:var(--accent)}
.brand-sub{margin-left:6px;font-size:11px;font-weight:400;color:var(--faint);letter-spacing:1px}
.db-path{margin-top:8px;font-size:10.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px dashed var(--line2);border-radius:4px;padding:3px 7px}
.side-tables{flex:1;overflow-y:auto;padding:8px 0;min-height:0}
.tbl-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 14px 7px 12px;cursor:pointer;border-left:2px solid transparent;color:var(--dim);font-size:12.5px;animation:pop .3s both;user-select:none}
.tbl-item:hover{color:var(--text);background:var(--panel2)}
.tbl-item.active{color:var(--accent);border-left-color:var(--accent);background:var(--panel2)}
.tbl-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl-count{flex:none;font-size:10.5px;color:var(--faint);background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:0 7px;line-height:17px}
.tbl-item.active .tbl-count{color:var(--accent);border-color:rgba(230,180,80,.35)}
.side-empty{padding:24px 16px;color:var(--faint);font-size:12px;line-height:2;text-align:center}
.side-foot{padding:10px 14px;border-top:1px solid var(--line);font-size:10.5px;color:var(--faint)}

#main{grid-area:main;display:flex;flex-direction:column;min-width:0;min-height:0}
.toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:rgba(26,26,23,.6)}
.tbl-title{font-size:14px;font-weight:700;color:var(--accent)}
.tbl-title::before{content:"▦ ";color:var(--faint);font-weight:400}
#search{flex:1;max-width:340px;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;color:var(--text);font:12.5px var(--mono);padding:7px 11px;outline:none;transition:border-color .15s}
#search:focus{border-color:var(--accent)}
#search::placeholder{color:var(--faint)}
#pageSize{background:var(--panel2);border:1px solid var(--line2);border-radius:6px;color:var(--text);font:12.5px var(--mono);padding:6px 8px;outline:none;cursor:pointer}
.toolbar-spacer{flex:1}
.btn{background:var(--panel2);border:1px solid var(--line2);color:var(--text);font:12px var(--mono);padding:7px 13px;border-radius:6px;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-accent{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}
.btn-accent:hover{background:#f0c268;color:var(--accent-ink);border-color:#f0c268}
.btn-accent.on{outline:2px solid rgba(230,180,80,.35)}
.btn-ghost{background:transparent;border-color:transparent;color:var(--dim)}
.btn-ghost:hover{color:var(--text);border-color:var(--line2)}
.btn-danger{background:var(--danger);border-color:var(--danger);color:var(--danger-ink);font-weight:700}
.btn-danger:hover{background:#e68a6d;color:var(--danger-ink);border-color:#e68a6d}

.grid-wrap{flex:1;overflow:auto;min-height:0}
table{border-collapse:collapse;width:100%;font-size:12.5px}
thead th{position:sticky;top:0;z-index:2;background:var(--panel2);color:var(--dim);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--line2);white-space:nowrap;cursor:pointer;user-select:none}
thead th:hover{color:var(--accent)}
thead th .mark{color:var(--accent);font-size:10px}
tbody td{padding:7px 12px;border-bottom:1px solid var(--line);white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
tbody tr{transition:background .1s}
tbody tr:hover td{background:#23231e}
tbody tr:hover .btn-del{opacity:1}
.null{color:var(--faint);font-style:italic}
.cell-epoch{margin-left:8px;color:var(--teal);opacity:.75;font-size:11px}
.td-op{width:44px;text-align:right;cursor:default}
.th-op{cursor:default;width:44px}
.th-op:hover{color:var(--dim)}
.btn-del{opacity:0;background:transparent;border:1px solid transparent;color:var(--faint);font-size:11px;width:24px;height:22px;border-radius:5px;cursor:pointer;transition:all .12s}
.btn-del:hover{color:var(--danger);border-color:var(--danger);background:rgba(217,119,87,.1)}
.empty{padding:48px 20px;text-align:center;color:var(--faint);font-size:13px;line-height:2.2}
.empty code{color:var(--accent);background:var(--panel2);padding:2px 8px;border-radius:5px;border:1px solid var(--line2)}
.empty-cell{text-align:center;color:var(--faint);cursor:default}

.pager{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--line);background:rgba(26,26,23,.6)}
.pager-info{color:var(--faint);font-size:12px}
.pager .btn{padding:5px 11px}

.sql-drawer{grid-area:drawer;display:flex;flex-direction:column;border-top:1px solid var(--line2);background:var(--panel);height:320px;animation:slide-up .22s ease}
.sql-drawer.hidden{display:none}
.sql-head{display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid var(--line)}
.sql-head span:first-child{font-weight:700;color:var(--accent)}
.sql-hint{flex:1;color:var(--faint);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sqlInput{flex:1;resize:none;background:var(--bg);border:none;border-bottom:1px solid var(--line);color:var(--text);font:12.5px/1.7 var(--mono);padding:12px 16px;outline:none}
#sqlInput::placeholder{color:var(--faint)}
.sql-actions{display:flex;align-items:center;gap:14px;padding:8px 16px;border-bottom:1px solid var(--line)}
.sql-meta{color:var(--teal);font-size:12px}
.sql-result{flex:1;overflow:auto;min-height:0}
.sql-result table td{cursor:default}
.sql-ok{padding:14px 16px;color:var(--teal)}
.sql-err{padding:14px 16px;color:var(--danger)}

.modal-back{position:fixed;inset:0;background:rgba(10,10,8,.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:50;animation:pop .15s ease}
.modal-back.hidden{display:none}
.modal{width:min(680px,92vw);max-height:80vh;display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line2);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden;animation:slide-up .2s ease}
.modal-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
.modal-title{flex:1;font-weight:700;color:var(--accent);font-size:13px}
.modal-val{flex:1;overflow:auto;padding:16px;font:12.5px/1.7 var(--mono);white-space:pre-wrap;word-break:break-all}
.modal-body{padding:18px 16px;line-height:1.9}
.modal-body b{color:var(--accent)}
.modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 16px;border-top:1px solid var(--line)}

.toast{position:fixed;right:18px;bottom:18px;z-index:60;background:var(--panel2);border:1px solid var(--line2);border-left:3px solid var(--accent);border-radius:8px;padding:10px 16px;font-size:12.5px;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:pop .2s ease}
.toast.err{border-left-color:var(--danger);color:#f0b3a0}
.toast.hidden{display:none}
</style>
</head>
<body>
<div id="app">
  <aside id="side">
    <div class="side-head">
      <div class="brand"><span class="brand-mark">◆</span> 知枝<span class="brand-sub">SQLITE CONSOLE</span></div>
      <div class="db-path" id="dbPath">—</div>
    </div>
    <div class="side-tables" id="tableList"></div>
    <div class="side-foot">仅监听 127.0.0.1 · 本地开发工具</div>
  </aside>
  <main id="main">
    <div class="toolbar">
      <div class="tbl-title" id="tblTitle">加载中…</div>
      <input id="search" type="search" placeholder="搜索所有列（LIKE %…%）" autocomplete="off">
      <div class="toolbar-spacer"></div>
      <select id="pageSize"><option value="20">20 / 页</option><option value="50" selected>50 / 页</option><option value="100">100 / 页</option></select>
      <button class="btn" id="btnRefresh">刷新</button>
      <button class="btn btn-accent" id="btnSql">SQL 控制台</button>
    </div>
    <div class="grid-wrap" id="gridWrap"></div>
    <div class="pager" id="pager"></div>
  </main>
  <section class="sql-drawer hidden" id="sqlDrawer">
    <div class="sql-head">
      <span>SQL 控制台</span>
      <span class="sql-hint">单条语句 · Ctrl+Enter 执行 · SELECT / PRAGMA 返回结果集，其余语句返回影响行数</span>
      <button class="btn btn-ghost" id="btnSqlClose">收起</button>
    </div>
    <textarea id="sqlInput" spellcheck="false" placeholder="SELECT * FROM users;"></textarea>
    <div class="sql-actions">
      <button class="btn btn-accent" id="btnRun">执行 (Ctrl+Enter)</button>
      <span class="sql-meta" id="sqlMeta"></span>
    </div>
    <div class="sql-result" id="sqlResult"></div>
  </section>
</div>
<div class="modal-back hidden" id="modalBack"><div class="modal" id="modal"></div></div>
<div class="toast hidden" id="toast"></div>
<script>
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var S={tables:[],table:null,rows:[],search:'',order:null,dir:'asc',page:1,size:50,total:0,pages:1};

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function isObj(v){return v!==null&&typeof v==='object'}

function epochText(col,v){
  if(typeof v!=='number'||!/_at$|^expires/.test(col))return '';
  var ms=null;
  if(v>1e12&&v<1e14)ms=v;else if(v>1e9&&v<1e11)ms=v*1000;
  if(ms===null)return '';
  var d=new Date(ms);function p(x){return(x<10?'0':'')+x}
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}

var toastTimer=null;
function toast(msg,err){
  var t=$('toast');t.textContent=msg;t.className='toast'+(err?' err':'');
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.className='toast hidden'},2600);
}

async function api(path,opt){
  var res;
  try{res=await fetch(path,opt)}catch(e){toast('网络错误：'+e.message,true);throw e}
  var body=null;
  try{body=await res.json()}catch(e){}
  if(!res.ok){var msg=(body&&body.error)?body.error:('HTTP '+res.status);toast(msg,true);throw new Error(msg)}
  return body;
}

function cellHtml(col,v){
  if(v===null||v===undefined)return '<span class="null">NULL</span>';
  var text=isObj(v)?JSON.stringify(v):v;
  var ep=epochText(col,v);
  return '<span class="cell-main">'+esc(text)+'</span>'+(ep?'<span class="cell-epoch">'+ep+'</span>':'');
}

function tableHtml(cols,rows,sortable){
  var h='<table><thead><tr>';
  cols.forEach(function(c){
    var mark='';
    if(sortable&&S.order===c.name)mark=(S.dir==='asc')?' <span class="mark">▲</span>':' <span class="mark">▼</span>';
    h+='<th'+(sortable?' data-col="'+esc(c.name)+'"':'')+' title="'+esc(c.type||'')+'">'+esc(c.name)+mark+'</th>';
  });
  h+=(sortable?'<th class="th-op"></th>':'')+'</tr></thead><tbody>';
  if(!rows.length){
    h+='<tr><td class="empty-cell" colspan="'+(cols.length+(sortable?1:0))+'">没有匹配的行</td></tr>';
  }
  rows.forEach(function(row){
    h+='<tr'+(sortable?' data-rid="'+esc(row.__rid)+'" data-i="'+esc(rows.indexOf(row))+'"':'')+'">';
    cols.forEach(function(c){h+='<td'+(sortable?' data-col="'+esc(c.name)+'"':'')+'>'+cellHtml(c.name,row[c.name])+'</td>'});
    h+=(sortable?'<td class="td-op"><button class="btn-del" title="删除该行">✕</button></td>':'')+'</tr>';
  });
  h+='</tbody></table>';
  return h;
}

function renderTables(){
  var el=$('tableList');el.innerHTML='';
  if(!S.tables.length){
    el.innerHTML='<div class="side-empty">数据库为空<br><span>请先在 server/ 目录运行<br><br>npm run db:migrate</span></div>';
    return;
  }
  S.tables.forEach(function(t,i){
    var d=document.createElement('div');
    d.className='tbl-item'+(t.name===S.table?' active':'');
    d.style.animationDelay=(i*30)+'ms';
    d.innerHTML='<span class="tbl-name">'+esc(t.name)+'</span><span class="tbl-count">'+t.count+'</span>';
    d.onclick=function(){selectTable(t.name)};
    el.appendChild(d);
  });
}

function renderPager(){
  var p=$('pager');
  p.innerHTML='<span class="pager-info">共 '+S.total+' 行 · 第 '+S.page+' / '+S.pages+' 页</span>'+
    '<button class="btn" id="pgPrev"'+(S.page<=1?' disabled':'')+'>← 上一页</button>'+
    '<button class="btn" id="pgNext"'+(S.page>=S.pages?' disabled':'')+'>下一页 →</button>';
  var prev=$('pgPrev'),next=$('pgNext');
  if(prev)prev.onclick=function(){if(S.page>1){S.page--;loadRows()}};
  if(next)next.onclick=function(){if(S.page<S.pages){S.page++;loadRows()}};
}

async function loadMeta(keep){
  var m=await api('/api/meta');
  $('dbPath').textContent=m.dbPath;
  $('dbPath').title=m.dbPath;
  S.tables=m.tables;
  if(!keep||!S.table||!m.tables.some(function(t){return t.name===S.table})){
    S.table=m.tables.length?m.tables[0].name:null;
    S.page=1;S.order=null;S.dir='asc';S.search='';
    $('search').value='';
  }
  renderTables();
  await loadRows();
}

function selectTable(name){
  S.table=name;S.page=1;S.order=null;S.dir='asc';S.search='';
  $('search').value='';
  renderTables();
  loadRows();
}

async function loadRows(){
  if(!S.table){
    $('tblTitle').textContent='未选择表';
    $('gridWrap').innerHTML='<div class="empty">数据库中没有表<br>在 server/ 目录运行 <code>npm run db:migrate</code> 初始化</div>';
    $('pager').innerHTML='';
    return;
  }
  $('tblTitle').textContent=S.table;
  var q='/api/tables/'+encodeURIComponent(S.table)+'?page='+S.page+'&size='+S.size;
  if(S.search)q+='&search='+encodeURIComponent(S.search);
  if(S.order)q+='&order='+encodeURIComponent(S.order)+'&dir='+S.dir;
  var r=await api(q);
  S.total=r.total;S.pages=r.pages;S.rows=r.rows;
  $('gridWrap').innerHTML=tableHtml(r.columns,r.rows,true);
  bindGrid(r.columns,r.rows);
  renderPager();
}

function bindGrid(cols,rows){
  var w=$('gridWrap');
  Array.prototype.forEach.call(w.querySelectorAll('th[data-col]'),function(th){
    th.onclick=function(){
      var c=th.getAttribute('data-col');
      if(S.order===c){S.dir=(S.dir==='asc')?'desc':'asc'}
      else{S.order=c;S.dir='asc'}
      S.page=1;loadRows();
    };
  });
  Array.prototype.forEach.call(w.querySelectorAll('tbody td[data-col]'),function(td){
    td.onclick=function(){
      var tr=td.closest('tr');
      var row=rows[Number(tr.getAttribute('data-i'))];
      if(!row)return;
      showCell(td.getAttribute('data-col'),row[td.getAttribute('data-col')]);
    };
  });
  Array.prototype.forEach.call(w.querySelectorAll('.btn-del'),function(b){
    b.onclick=function(ev){
      ev.stopPropagation();
      confirmDelete(b.closest('tr').getAttribute('data-rid'));
    };
  });
}

function showCell(col,v){
  var text=(v===null||v===undefined)?'NULL':(isObj(v)?JSON.stringify(v,null,2):String(v));
  openModal(
    '<div class="modal-head"><span class="modal-title">'+esc(col)+'</span>'+
    '<button class="btn" id="mCopy">复制</button><button class="btn btn-ghost" id="mClose">关闭</button></div>'+
    '<pre class="modal-val">'+esc(text)+'</pre>'
  );
  $('mCopy').onclick=function(){copy(text)};
  $('mClose').onclick=closeModal;
}

function confirmDelete(rid){
  openModal(
    '<div class="modal-head"><span class="modal-title">删除确认</span></div>'+
    '<div class="modal-body">确定删除表 <b>'+esc(S.table)+'</b> 中 rowid = <b>'+esc(rid)+'</b> 的这一行？<br>此操作立即生效且不可撤销。</div>'+
    '<div class="modal-foot"><button class="btn btn-ghost" id="mCancel">取消</button><button class="btn btn-danger" id="mOk">删除</button></div>'
  );
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=async function(){
    var r=await api('/api/tables/'+encodeURIComponent(S.table)+'/delete',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({rid:Number(rid)})
    });
    closeModal();
    toast(r.deleted?'已删除 '+r.deleted+' 行':'该行不存在（可能已被删除）',!r.deleted);
    loadMeta(true);
  };
}

function openModal(html){
  $('modal').innerHTML=html;
  $('modalBack').classList.remove('hidden');
}
function closeModal(){$('modalBack').classList.add('hidden')}
$('modalBack').addEventListener('click',function(e){if(e.target===this)closeModal()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()});

function copy(text){
  var done=function(){toast('已复制到剪贴板')};
  var fallback=function(){
    var ta=document.createElement('textarea');
    ta.value=text;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');done()}catch(e){toast('复制失败',true)}
    document.body.removeChild(ta);
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done,fallback);
  }else{fallback()}
}

$('btnSql').onclick=function(){
  $('sqlDrawer').classList.remove('hidden');
  $('btnSql').classList.add('on');
  $('sqlInput').focus();
};
$('btnSqlClose').onclick=function(){
  $('sqlDrawer').classList.add('hidden');
  $('btnSql').classList.remove('on');
};
$('sqlInput').addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter')runSql();
});
$('btnRun').onclick=runSql;

async function runSql(){
  var sql=$('sqlInput').value;
  if(!sql.trim()){toast('请输入 SQL 语句',true);return}
  $('sqlMeta').textContent='执行中…';
  try{
    var r=await api('/api/sql',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sql:sql})
    });
    if(r.mode==='rows'){
      $('sqlMeta').textContent='返回 '+r.rows.length+' 行'+(r.truncated?'（结果已截断，最多显示 500 行）':'');
      $('sqlResult').innerHTML=tableHtml(r.columns,r.rows,false);
    }else{
      var tail=r.lastInsertRowid!=='0'?(' · last_insert_rowid='+r.lastInsertRowid):'';
      $('sqlMeta').textContent='已执行 · 影响 '+r.changes+' 行'+tail;
      $('sqlResult').innerHTML='<div class="sql-ok">✓ 语句已执行</div>';
      loadMeta(true);
    }
  }catch(e){
    $('sqlMeta').textContent='';
    $('sqlResult').innerHTML='<div class="sql-err">✕ 执行失败，请检查语句（右上角有错误详情）</div>';
  }
}

var searchTimer=null;
$('search').addEventListener('input',function(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(function(){
    S.search=$('search').value.trim();
    S.page=1;loadRows();
  },300);
});
$('pageSize').onchange=function(){S.size=Number(this.value);S.page=1;loadRows()};
$('btnRefresh').onclick=function(){loadMeta(true)};

loadMeta();
})();
</script>
</body>
</html>
`;
