export const DB_UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>知枝 · 综合管理台</title>
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
.nav{padding:8px 0;border-bottom:1px solid var(--line)}
.nav-item{display:flex;align-items:center;gap:9px;padding:7px 14px;cursor:pointer;border-left:2px solid transparent;color:var(--dim);font-size:12.5px;user-select:none}
.nav-item:hover{color:var(--text);background:var(--panel2)}
.nav-item.active{color:var(--accent);border-left-color:var(--accent);background:var(--panel2)}
.nav-ico{width:16px;text-align:center;color:var(--faint)}
.nav-item.active .nav-ico{color:var(--accent)}
.side-sec{padding:9px 14px 5px;font-size:10.5px;color:var(--faint);letter-spacing:1.5px}
.side-tables{flex:1;overflow-y:auto;padding:0 0 8px;min-height:0}
.tbl-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 14px 6px 22px;cursor:pointer;border-left:2px solid transparent;color:var(--dim);font-size:12px;animation:pop .3s both;user-select:none}
.tbl-item:hover{color:var(--text);background:var(--panel2)}
.tbl-item.active{color:var(--accent);border-left-color:var(--accent);background:var(--panel2)}
.tbl-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl-count{flex:none;font-size:10.5px;color:var(--faint);background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:0 7px;line-height:17px}
.tbl-item.active .tbl-count{color:var(--accent);border-color:rgba(230,180,80,.35)}
.side-empty{padding:18px 16px;color:var(--faint);font-size:12px;line-height:2;text-align:center}
.side-foot{padding:10px 14px;border-top:1px solid var(--line);font-size:10.5px;color:var(--faint)}

#main{grid-area:main;display:flex;flex-direction:column;min-width:0;min-height:0}
.toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:rgba(26,26,23,.6);flex-wrap:wrap}
.tbl-title{font-size:14px;font-weight:700;color:var(--accent)}
.tbl-title::before{content:"▦ ";color:var(--faint);font-weight:400}
.toolbar input[type=search],.toolbar input[type=number]{background:var(--panel2);border:1px solid var(--line2);border-radius:6px;color:var(--text);font:12.5px var(--mono);padding:7px 11px;outline:none;transition:border-color .15s}
.toolbar input:focus{border-color:var(--accent)}
.toolbar input::placeholder{color:var(--faint)}
#search{flex:1;max-width:300px}
#pageSize,.toolbar select{background:var(--panel2);border:1px solid var(--line2);border-radius:6px;color:var(--text);font:12.5px var(--mono);padding:6px 8px;outline:none;cursor:pointer}
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
.btn-mini{padding:3px 9px;font-size:11px;border-radius:5px}

#gridWrap{flex:1;overflow:auto;min-height:0}
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

.badge{display:inline-block;font-size:10.5px;line-height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--line2);color:var(--dim)}
.badge.on{color:var(--teal);border-color:rgba(143,192,174,.4)}
.badge.off{color:var(--danger);border-color:rgba(217,119,87,.4)}
.badge.warn{color:var(--accent);border-color:rgba(230,180,80,.4)}
.row-actions{display:flex;gap:6px;justify-content:flex-end}

.pager{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--line);background:rgba(26,26,23,.6)}
.pager.hidden{display:none}
.pager-info{color:var(--faint);font-size:12px}
.pager .btn{padding:5px 11px}

/* 总览仪表盘 */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px;animation:pop .3s both}
.card .num{font-size:21px;font-weight:700;color:var(--accent);line-height:1.3}
.card .num small{font-size:11px;font-weight:400;color:var(--dim);margin-left:4px}
.card .lbl{font-size:11px;color:var(--faint);margin-top:2px}
.sec-title{padding:14px 16px 6px;color:var(--dim);font-size:12px;letter-spacing:1px}
.dash{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;padding:0 16px 24px;align-items:start}
.dash .block{background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:20px}
.dash .block h4{padding:9px 13px;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line);font-weight:600}
.dash table td{max-width:220px;cursor:default}
.num-cell{text-align:right;font-variant-numeric:tabular-nums}

/* 表单弹窗 */
.form{display:flex;flex-direction:column;gap:11px;padding:16px 18px}
.form label{color:var(--dim);font-size:11px;display:block;margin-bottom:4px}
.form input,.form select{width:100%;background:var(--bg);border:1px solid var(--line2);border-radius:6px;color:var(--text);font:12.5px var(--mono);padding:8px 10px;outline:none}
.form input:focus,.form select:focus{border-color:var(--accent)}
.form .hint{color:var(--faint);font-size:10.5px;margin-top:3px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.test-result{background:var(--bg);border:1px solid var(--line2);border-radius:6px;padding:10px 12px;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:160px;overflow:auto}

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
.modal{width:min(680px,92vw);max-height:84vh;display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line2);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden;animation:slide-up .2s ease}
.modal-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
.modal-title{flex:1;font-weight:700;color:var(--accent);font-size:13px}
.modal-val{flex:1;overflow:auto;padding:16px;font:12.5px/1.7 var(--mono);white-space:pre-wrap;word-break:break-all}
.modal-body{padding:0;overflow:auto}
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
      <div class="brand"><span class="brand-mark">◆</span> 知枝<span class="brand-sub">ADMIN CONSOLE</span></div>
      <div class="db-path" id="dbPath">—</div>
    </div>
    <nav class="nav" id="nav"></nav>
    <div class="side-sec">数据库表</div>
    <div class="side-tables" id="tableList"></div>
    <div class="side-foot">仅监听 127.0.0.1 · 本地管理工具</div>
  </aside>
  <main id="main">
    <div class="toolbar" id="toolbar"></div>
    <div id="gridWrap"></div>
    <div class="pager hidden" id="pager"></div>
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
var S={view:'overview',table:null,rows:[],search:'',order:null,dir:'asc',page:1,size:50,total:0,pages:1,
  tables:[],ovDays:7,chSearch:'',usSearch:'',keySearch:'',keyStatus:''};

var NAV=[
  {id:'overview',ico:'◆',label:'总览'},
  {id:'channels',ico:'⇄',label:'渠道管理'},
  {id:'users',ico:'☰',label:'用户'},
  {id:'keys',ico:'⚿',label:'子 Key'},
  {id:'table',ico:'▦',label:'数据库',always:true}
];

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function isObj(v){return v!==null&&typeof v==='object'}
function fmtNum(n){return Number(n||0).toLocaleString('en-US')}

function epochText(col,v){
  if(typeof v!=='number'||!/_at$|^expires/.test(col))return '';
  var ms=null;
  if(v>1e12&&v<1e14)ms=v;else if(v>1e9&&v<1e11)ms=v*1000;
  if(ms===null)return '';
  var d=new Date(ms);function p(x){return(x<10?'0':'')+x}
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
function epochStr(v){
  var d=new Date(v);function p(x){return(x<10?'0':'')+x}
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
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

/* ===== 侧栏导航 ===== */

function renderNav(){
  var el=$('nav');el.innerHTML='';
  NAV.forEach(function(item){
    var d=document.createElement('div');
    d.className='nav-item'+(S.view===item.id||(item.id==='table'&&S.view==='table')?' active':'');
    d.innerHTML='<span class="nav-ico">'+item.ico+'</span>'+esc(item.label);
    d.onclick=function(){navTo(item.id)};
    el.appendChild(d);
  });
}

function renderTables(){
  var el=$('tableList');el.innerHTML='';
  if(!S.tables.length){
    el.innerHTML='<div class="side-empty">数据库为空<br><span>请先在 server/ 目录运行<br><br>npm run db:migrate</span></div>';
    return;
  }
  S.tables.forEach(function(t,i){
    var d=document.createElement('div');
    d.className='tbl-item'+(S.view==='table'&&t.name===S.table?' active':'');
    d.style.animationDelay=(i*30)+'ms';
    d.innerHTML='<span class="tbl-name">'+esc(t.name)+'</span><span class="tbl-count">'+t.count+'</span>';
    d.onclick=function(){S.table=t.name;S.page=1;S.order=null;S.dir='asc';S.search='';navTo('table')};
    el.appendChild(d);
  });
}

function navTo(view){
  S.view=view;
  renderNav();
  renderTables();
  renderToolbar();
  if(view==='overview')loadOverview();
  else if(view==='channels')loadChannels();
  else if(view==='users')loadUsers();
  else if(view==='keys')loadKeys();
  else if(view==='table')loadRows();
}

/* ===== 工具栏（按视图） ===== */

function renderToolbar(){
  var tb=$('toolbar');
  $('pager').classList.add('hidden');
  if(S.view==='overview'){
    tb.innerHTML='<div class="tbl-title">总览</div><div class="toolbar-spacer"></div>'+
      '<select id="ovDays"><option value="7"'+(S.ovDays===7?' selected':'')+'>近 7 天</option>'+
      '<option value="14"'+(S.ovDays===14?' selected':'')+'>近 14 天</option>'+
      '<option value="30"'+(S.ovDays===30?' selected':'')+'>近 30 天</option></select>'+
      '<button class="btn" id="btnRefresh">刷新</button>';
    $('ovDays').onchange=function(){S.ovDays=Number(this.value);loadOverview()};
    $('btnRefresh').onclick=loadOverview;
  }else if(S.view==='channels'){
    tb.innerHTML='<div class="tbl-title">渠道管理</div><div class="toolbar-spacer"></div>'+
      '<button class="btn" id="btnRefresh">刷新</button>'+
      '<button class="btn btn-accent" id="btnNewCh">＋ 新建渠道</button>';
    $('btnRefresh').onclick=loadChannels;
    $('btnNewCh').onclick=function(){channelForm(null)};
  }else if(S.view==='users'){
    tb.innerHTML='<div class="tbl-title">用户</div><input id="usSearch" type="search" placeholder="搜索用户名 / 邮箱" value="'+esc(S.usSearch)+'"><div class="toolbar-spacer"></div>'+
      '<button class="btn" id="btnRefresh">刷新</button>';
    bindSearch('usSearch',function(v){S.usSearch=v;loadUsers()});
    $('btnRefresh').onclick=loadUsers;
  }else if(S.view==='keys'){
    tb.innerHTML='<div class="tbl-title">子 Key</div><input id="keySearch" type="search" placeholder="搜索 Key / 用户 / 备注" value="'+esc(S.keySearch)+'">'+
      '<select id="keyStatus"><option value="">全部状态</option><option value="active"'+(S.keyStatus==='active'?' selected':'')+'>启用中</option>'+
      '<option value="disabled"'+(S.keyStatus==='disabled'?' selected':'')+'>已禁用</option>'+
      '<option value="revoked"'+(S.keyStatus==='revoked'?' selected':'')+'>已吊销</option></select>'+
      '<div class="toolbar-spacer"></div><button class="btn" id="btnRefresh">刷新</button>';
    bindSearch('keySearch',function(v){S.keySearch=v;loadKeys()});
    $('keyStatus').onchange=function(){S.keyStatus=this.value;loadKeys()};
    $('btnRefresh').onclick=loadKeys;
  }else{
    tb.innerHTML='<div class="tbl-title" id="tblTitle">加载中…</div>'+
      '<input id="search" type="search" placeholder="搜索所有列（LIKE %…%）" autocomplete="off">'+
      '<div class="toolbar-spacer"></div>'+
      '<select id="pageSize"><option value="20">20 / 页</option><option value="50" selected>50 / 页</option><option value="100">100 / 页</option></select>'+
      '<button class="btn" id="btnRefresh">刷新</button>'+
      '<button class="btn btn-accent" id="btnSql">SQL 控制台</button>';
    $('btnSql').onclick=openSql;
    $('btnRefresh').onclick=function(){loadMeta(true)};
    var searchTimerLocal=null;
    $('search').addEventListener('input',function(){
      clearTimeout(searchTimerLocal);
      searchTimerLocal=setTimeout(function(){
        S.search=$('search').value.trim();S.page=1;loadRows();
      },300);
    });
    $('pageSize').onchange=function(){S.size=Number(this.value);S.page=1;loadRows()};
    $('search').value=S.search;
  }
}

function bindSearch(id,cb){
  var timer=null;
  $(id).addEventListener('input',function(){
    clearTimeout(timer);
    timer=setTimeout(function(){cb($(id).value.trim())},300);
  });
}

/* ===== 视图：总览 ===== */

function cardHtml(num,lbl,suffix){
  return '<div class="card"><div class="num">'+fmtNum(num)+(suffix?'<small>'+suffix+'</small>':'')+'</div><div class="lbl">'+esc(lbl)+'</div></div>';
}

function miniTable(cols,rows){
  var h='<table><thead><tr>';
  cols.forEach(function(c){h+='<th>'+esc(c.label)+'</th>'});
  h+='</tr></thead><tbody>';
  if(!rows.length){h+='<tr><td class="empty-cell" colspan="'+cols.length+'">暂无数据</td></tr>'}
  rows.forEach(function(r){
    h+='<tr>';
    cols.forEach(function(c){
      var v=r[c.key];
      h+='<td'+(c.right?' class="num-cell"':'')+'>' +(v===null||v===undefined?'<span class="null">NULL</span>':esc(c.fmt?c.fmt(v):v))+'</td>';
    });
    h+='</tr>';
  });
  return h+'</tbody></table>';
}

async function loadOverview(){
  $('gridWrap').innerHTML='<div class="empty">加载中…</div>';
  var d;
  try{d=await api('/api/admin/overview?days='+S.ovDays)}catch(e){return}
  var w=d.window;
  var html='<div class="cards">'+
    cardHtml(d.today.requests,'今日请求')+
    cardHtml(d.today.tokens,'今日 Token')+
    cardHtml(d.today.cost_cents,'今日成本','分')+
    cardHtml(w.totals.requests,'近 '+w.days+' 天请求')+
    cardHtml(w.totals.tokens,'近 '+w.days+' 天 Token')+
    cardHtml(w.totals.cost_cents,'近 '+w.days+' 天成本','分')+
    cardHtml(d.cards.users_total,'用户数')+
    cardHtml(d.cards.keys_active,'启用中子 Key')+
    cardHtml(d.cards.channels_enabled,'启用渠道','/ '+d.cards.channels_total)+
    cardHtml(d.cards.quota_sum,'用户剩余额度')+
    '</div>';
  html+='<div class="dash">'+
    '<div class="block"><h4>每日用量（近 '+w.days+' 天）</h4>'+miniTable(
      [{label:'日期',key:'day'},{label:'请求',key:'requests',right:true},{label:'Token',key:'tokens',right:true},{label:'成本(分)',key:'cost_cents',right:true}],w.daily)+'</div>'+
    '<div class="block"><h4>质量指标</h4>'+miniTable(
      [{label:'估算请求（estimated）',key:'estimated',right:true},{label:'客户端断连（aborted）',key:'aborted',right:true}],[w.quality])+'</div>'+
    '<div class="block"><h4>模型 Top</h4>'+miniTable(
      [{label:'模型',key:'model'},{label:'请求',key:'requests',right:true},{label:'Token',key:'tokens',right:true},{label:'成本(分)',key:'cost_cents',right:true}],w.top_models)+'</div>'+
    '<div class="block"><h4>用户 Top</h4>'+miniTable(
      [{label:'用户',key:'username'},{label:'请求',key:'requests',right:true},{label:'Token',key:'tokens',right:true},{label:'成本(分)',key:'cost_cents',right:true}],w.top_users)+'</div>'+
    '</div>';
  $('gridWrap').innerHTML=html;
}

/* ===== 视图：渠道 ===== */

function statusBadge(on,onText,offText){return '<span class="badge '+(on?'on':'off')+'">'+(on?onText:offText)+'</span>'}

async function loadChannels(){
  $('gridWrap').innerHTML='<div class="empty">加载中…</div>';
  var r;
  try{r=await api('/api/admin/channels')}catch(e){return}
  var h='<table><thead><tr><th>名称</th><th>Base URL</th><th>上游 Key</th><th>模型</th><th>分组</th><th>权重</th><th>状态</th><th>创建时间</th><th class="th-op">操作</th></tr></thead><tbody>';
  if(!r.channels.length){h+='<tr><td class="empty-cell" colspan="9">暂无渠道 · 点击右上角「新建渠道」添加</td></tr>'}
  r.channels.forEach(function(ch){
    h+='<tr data-id="'+esc(ch.id)+'">'+
      '<td>'+esc(ch.name)+'</td>'+
      '<td>'+esc(ch.base_url)+'</td>'+
      '<td>'+(ch.has_key?'<span class="badge warn">'+esc(ch.key_masked)+'</span>':'<span class="badge off">未配置</span>')+'</td>'+
      '<td>'+esc(ch.models)+'</td>'+
      '<td>'+esc(ch.group_tag)+'</td>'+
      '<td class="num-cell">'+ch.weight+'</td>'+
      '<td>'+statusBadge(ch.status===1,'启用','停用')+'</td>'+
      '<td>'+(ch.created_at?epochStr(ch.created_at):'—')+'</td>'+
      '<td><div class="row-actions">'+
        '<button class="btn btn-mini" data-act="test">测试</button>'+
        '<button class="btn btn-mini" data-act="edit">编辑</button>'+
        '<button class="btn btn-mini" data-act="toggle">'+(ch.status===1?'停用':'启用')+'</button>'+
        '<button class="btn btn-mini" data-act="del">删除</button>'+
      '</div></td></tr>';
  });
  $('gridWrap').innerHTML=h+'</tbody></table>';
  Array.prototype.forEach.call($('gridWrap').querySelectorAll('button[data-act]'),function(b){
    b.onclick=function(){
      var tr=b.closest('tr');
      var ch=r.channels.find(function(x){return x.id===tr.getAttribute('data-id')});
      if(!ch)return;
      var act=b.getAttribute('data-act');
      if(act==='test')testChannel(ch);
      else if(act==='edit')channelForm(ch);
      else if(act==='toggle')toggleChannel(ch);
      else if(act==='del')deleteChannel(ch);
    };
  });
}

async function testChannel(ch){
  toast('正在测试 '+ch.name+' …');
  var r;
  try{r=await api('/api/admin/channels/'+encodeURIComponent(ch.id)+'/test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})}catch(e){return}
  var text=r.ok?('✓ 连接成功 · HTTP '+r.status+' · '+r.latency_ms+'ms'):('✕ 连接失败'+(r.error?(' · '+r.error):' · HTTP '+r.status));
  openModal(
    '<div class="modal-head"><span class="modal-title">连通性测试 · '+esc(ch.name)+'</span><button class="btn btn-ghost" id="mClose">关闭</button></div>'+
    '<div class="modal-body"><div style="padding:16px 18px"><div class="'+(r.ok?'sql-ok':'sql-err')+'" style="padding:0 0 10px">'+esc(text)+'</div>'+
    (r.preview!==undefined?'<div class="test-result">'+esc(r.preview||'(空响应)')+'</div>':'')+'</div></div>'
  );
  $('mClose').onclick=closeModal;
}

function channelForm(ch){
  var isEdit=!!ch;
  formModal(isEdit?'编辑渠道':'新建渠道',[
    {key:'name',label:'名称',value:ch?ch.name:'',required:true},
    {key:'base_url',label:'Base URL（不含 /v1，网关自动拼接 /v1/chat/completions）',value:ch?ch.base_url:'',required:true,placeholder:'https://open.bigmodel.cn/api/paas'},
    {key:'api_key',label:'上游 Key'+(isEdit?'（留空则不修改）':''),type:'password',placeholder:isEdit&&ch.has_key?('已配置：'+ch.key_masked):'sk-…'},
    {key:'models',label:'模型列表（逗号分隔，* 表示全部）',value:ch?ch.models:'*',placeholder:'glm-4.7-flash,glm-4v-flash'},
    {key:'group_tag',label:'分组（* 表示全部分组可用）',value:ch?ch.group_tag:'*'},
    {key:'weight',label:'权重（1-10000）',type:'number',value:ch?ch.weight:100},
    {key:'status',label:'状态',type:'select',value:ch?ch.status:1,options:[{v:1,t:'启用'},{v:0,t:'停用'}]}
  ],async function(vals){
    var body={name:vals.name,base_url:vals.base_url,models:vals.models,group_tag:vals.group_tag,weight:Number(vals.weight||100),status:Number(vals.status||0)};
    if(vals.api_key)body.api_key=vals.api_key;
    if(isEdit){
      await api('/api/admin/channels/'+encodeURIComponent(ch.id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      toast('渠道已更新');
    }else{
      await api('/api/admin/channels',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      toast('渠道已创建');
    }
    closeModal();
    loadChannels();
  });
}

async function toggleChannel(ch){
  await api('/api/admin/channels/'+encodeURIComponent(ch.id),{
    method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify({status:ch.status===1?0:1})
  });
  toast(ch.status===1?'渠道已停用':'渠道已启用');
  loadChannels();
}

function deleteChannel(ch){
  confirmAction('删除渠道','确定删除渠道 <b>'+esc(ch.name)+'</b>？历史用量记录中的渠道 ID 会保留。',async function(){
    await api('/api/admin/channels/'+encodeURIComponent(ch.id),{method:'DELETE'});
    toast('渠道已删除');
    loadChannels();
  });
}

/* ===== 视图：用户 ===== */

async function loadUsers(){
  $('gridWrap').innerHTML='<div class="empty">加载中…</div>';
  var r;
  try{r=await api('/api/admin/users'+(S.usSearch?'?search='+encodeURIComponent(S.usSearch):''))}catch(e){return}
  var h='<table><thead><tr><th>用户名</th><th>邮箱</th><th>套餐</th><th>剩余额度</th><th>累计消耗</th><th>活跃 Key</th><th>注册时间</th><th class="th-op">操作</th></tr></thead><tbody>';
  if(!r.users.length){h+='<tr><td class="empty-cell" colspan="8">没有匹配的用户</td></tr>'}
  r.users.forEach(function(u){
    h+='<tr data-id="'+esc(u.id)+'">'+
      '<td>'+esc(u.username||'(未设置)')+'</td>'+
      '<td>'+esc(u.identifier)+'</td>'+
      '<td>'+(u.plan_name?('<span class="badge warn">'+esc(u.plan_name)+'</span>'):'<span class="muted">免费</span>')+'</td>'+
      '<td class="num-cell">'+fmtNum(u.quota_tokens)+'</td>'+
      '<td class="num-cell">'+fmtNum(u.used_tokens)+'</td>'+
      '<td class="num-cell">'+u.active_keys+'</td>'+
      '<td>'+(u.created_at?epochStr(u.created_at):'—')+'</td>'+
      '<td><div class="row-actions">'+
        '<button class="btn btn-mini btn-accent" data-act="quota">发额度</button>'+
        '<button class="btn btn-mini" data-act="keys">查 Key</button>'+
      '</div></td></tr>';
  });
  $('gridWrap').innerHTML=h+'</tbody></table>';
  Array.prototype.forEach.call($('gridWrap').querySelectorAll('button[data-act]'),function(b){
    b.onclick=function(){
      var tr=b.closest('tr');
      var u=r.users.find(function(x){return x.id===tr.getAttribute('data-id')});
      if(!u)return;
      if(b.getAttribute('data-act')==='quota')quotaForm(u);
      else{S.keySearch=u.username||u.identifier;S.keyStatus='';navTo('keys')}
    };
  });
}

function quotaForm(u){
  formModal('发放额度 · '+ (u.username||u.identifier),[
    {key:'delta',label:'增减额度（整数，可负，如 1000000 = 100 万 Token）',type:'number',placeholder:'如 1000000'},
    {key:'set',label:'或直接设定为（非负数，优先于增减）',type:'number',placeholder:'如 5000000'}
  ],async function(vals){
    var body={};
    if(vals.set!==''&&vals.set!==undefined)body.set=Number(vals.set);
    else if(vals.delta!==''&&vals.delta!==undefined)body.delta=Number(vals.delta);
    else{toast('请填写额度数值',true);return}
    var r=await api('/api/admin/users/'+encodeURIComponent(u.id)+'/quota',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    closeModal();
    toast('已调整，剩余额度：'+fmtNum(r.quota_tokens));
    loadUsers();
  },'当前剩余：'+fmtNum(u.quota_tokens)+' Token');
}

/* ===== 视图：子 Key ===== */

async function loadKeys(){
  $('gridWrap').innerHTML='<div class="empty">加载中…</div>';
  var q=[];
  if(S.keySearch)q.push('search='+encodeURIComponent(S.keySearch));
  if(S.keyStatus)q.push('status='+encodeURIComponent(S.keyStatus));
  var r;
  try{r=await api('/api/admin/keys'+(q.length?'?'+q.join('&'):''))}catch(e){return}
  var h='<table><thead><tr><th>Key</th><th>备注</th><th>用户</th><th>用途</th><th>状态</th><th>独立额度</th><th>已用</th><th>模型白名单</th><th>RPM</th><th>最后使用</th><th class="th-op">操作</th></tr></thead><tbody>';
  if(!r.keys.length){h+='<tr><td class="empty-cell" colspan="11">没有匹配的子 Key</td></tr>'}
  r.keys.forEach(function(k){
    var status;
    if(k.revoked_at)status='<span class="badge off">已吊销</span>';
    else if(!k.enabled)status='<span class="badge warn">已禁用</span>';
    else status='<span class="badge on">启用中</span>';
    h+='<tr data-id="'+esc(k.id)+'">'+
      '<td>'+esc(k.key_preview||'(无预览)')+'</td>'+
      '<td>'+esc(k.name||'—')+'</td>'+
      '<td>'+esc(k.username||'(未知用户)')+'</td>'+
      '<td><span class="badge">'+esc(k.purpose)+'</span></td>'+
      '<td>'+status+'</td>'+
      '<td class="num-cell">'+(Number(k.quota_tokens)===-1?'跟随用户池':fmtNum(k.quota_tokens))+'</td>'+
      '<td class="num-cell">'+fmtNum(k.used_tokens)+'</td>'+
      '<td>'+(k.allowed_models?esc(k.allowed_models):'<span class="muted">不限</span>')+'</td>'+
      '<td class="num-cell">'+(k.rpm_limit===null?'默认 60':k.rpm_limit)+'</td>'+
      '<td>'+(k.last_used_at?epochStr(k.last_used_at):'<span class="muted">从未使用</span>')+'</td>'+
      '<td><div class="row-actions">'+
        '<button class="btn btn-mini" data-act="edit">编辑</button>'+
        '<button class="btn btn-mini" data-act="toggle">'+(k.enabled?'禁用':'启用')+'</button>'+
        (k.revoked_at?'':'<button class="btn btn-mini" data-act="revoke">吊销</button>')+
      '</div></td></tr>';
  });
  $('gridWrap').innerHTML=h+'</tbody></table>';
  Array.prototype.forEach.call($('gridWrap').querySelectorAll('button[data-act]'),function(b){
    b.onclick=function(){
      var tr=b.closest('tr');
      var k=r.keys.find(function(x){return x.id===tr.getAttribute('data-id')});
      if(!k)return;
      var act=b.getAttribute('data-act');
      if(act==='edit')keyForm(k);
      else if(act==='toggle')toggleKey(k);
      else if(act==='revoke')revokeKey(k);
    };
  });
}

function keyForm(k){
  formModal('编辑子 Key · '+(k.key_preview||''),[
    {key:'name',label:'备注',value:k.name||''},
    {key:'quota_tokens',label:'独立额度（-1 = 跟随用户池）',type:'number',value:k.quota_tokens},
    {key:'allowed_models',label:'模型白名单（逗号分隔，留空 = 不限）',value:k.allowed_models||'',placeholder:'glm-4v-flash'},
    {key:'rpm_limit',label:'每分钟请求数上限（留空 = 默认 60）',type:'number',value:k.rpm_limit===null?'':k.rpm_limit,placeholder:'60'},
    {key:'expired_at',label:'过期时间（毫秒时间戳，留空 = 永不过期）',type:'number',value:k.expired_at===null?'':k.expired_at}
  ],async function(vals){
    var body={name:vals.name};
    body.quota_tokens=(vals.quota_tokens===''||vals.quota_tokens===undefined)?-1:Number(vals.quota_tokens);
    body.allowed_models=vals.allowed_models===undefined?null:vals.allowed_models;
    body.rpm_limit=vals.rpm_limit===''||vals.rpm_limit===undefined?null:Number(vals.rpm_limit);
    body.expired_at=vals.expired_at===''||vals.expired_at===undefined?null:Number(vals.expired_at);
    await api('/api/admin/keys/'+encodeURIComponent(k.id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    closeModal();
    toast('子 Key 已更新');
    loadKeys();
  },'归属：'+(k.username||'(未知用户)')+' · 用途：'+k.purpose);
}

async function toggleKey(k){
  await api('/api/admin/keys/'+encodeURIComponent(k.id),{
    method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify({enabled:k.enabled?0:1})
  });
  toast(k.enabled?'子 Key 已禁用':'子 Key 已启用');
  loadKeys();
}

function revokeKey(k){
  confirmAction('吊销子 Key','确定吊销 <b>'+esc(k.key_preview||k.id)+'</b>？使用该 Key 的客户端将立即收到 401，此操作不可撤销。',async function(){
    await api('/api/admin/keys/'+encodeURIComponent(k.id),{method:'DELETE'});
    toast('子 Key 已吊销');
    loadKeys();
  });
}

/* ===== 通用：表单弹窗 / 确认弹窗 ===== */

function formModal(title,fields,onSubmit,note){
  var h='<div class="modal-head"><span class="modal-title">'+esc(title)+'</span><button class="btn btn-ghost" id="mCancel">取消</button></div>'+
    '<div class="modal-body"><form class="form" id="mForm">';
  if(note)h+='<div class="hint" style="margin:-2px 0 0">'+esc(note)+'</div>';
  fields.forEach(function(f){
    h+='<div><label>'+esc(f.label)+'</label>';
    if(f.type==='select'){
      h+='<select name="'+esc(f.key)+'">';
      f.options.forEach(function(o){h+='<option value="'+o.v+'"'+(String(f.value)===String(o.v)?' selected':'')+'>'+esc(o.t)+'</option>'});
      h+='</select>';
    }else{
      h+='<input name="'+esc(f.key)+'" type="'+(f.type||'text')+'" value="'+esc(f.value===undefined?'':f.value)+'"'+(f.placeholder?' placeholder="'+esc(f.placeholder)+'"':'')+(f.required?' required':'')+'>';
    }
    h+='</div>';
  });
  h+='</form></div><div class="modal-foot"><span class="sql-meta" id="mErr"></span><button class="btn btn-accent" id="mSave">保存</button></div>';
  openModal(h);
  $('mCancel').onclick=closeModal;
  $('mSave').onclick=async function(){
    var vals={};
    Array.prototype.forEach.call($('mForm').elements,function(el){if(el.name)vals[el.name]=el.value});
    try{
      $('mErr').textContent='';
      await onSubmit(vals);
    }catch(e){}
  };
  $('mForm').addEventListener('submit',function(e){e.preventDefault();$('mSave').click()});
}

function confirmAction(title,bodyHtml,onOk){
  openModal(
    '<div class="modal-head"><span class="modal-title">'+esc(title)+'</span></div>'+
    '<div class="modal-body" style="padding:18px;line-height:1.9">'+bodyHtml+'</div>'+
    '<div class="modal-foot"><button class="btn btn-ghost" id="mCancel">取消</button><button class="btn btn-danger" id="mOk">确定</button></div>'
  );
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=async function(){
    try{await onOk()}finally{closeModal()}
  };
}

/* ===== 视图：数据库表（原有功能） ===== */

function renderPager(){
  var p=$('pager');
  p.classList.remove('hidden');
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
  }
  renderTables();
  if(S.view==='table')await loadRows();
}

async function loadRows(){
  $('tblTitle').textContent=S.table||'未选择表';
  if(!S.table){
    $('gridWrap').innerHTML='<div class="empty">数据库中没有表<br>在 server/ 目录运行 <code>npm run db:migrate</code> 初始化</div>';
    $('pager').classList.add('hidden');
    return;
  }
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
  confirmAction('删除确认','确定删除表 <b>'+esc(S.table)+'</b> 中 rowid = <b>'+esc(rid)+'</b> 的这一行？<br>此操作立即生效且不可撤销。',async function(){
    var r=await api('/api/tables/'+encodeURIComponent(S.table)+'/delete',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({rid:Number(rid)})
    });
    toast(r.deleted?'已删除 '+r.deleted+' 行':'该行不存在（可能已被删除）',!r.deleted);
    loadMeta(true);
  });
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

/* ===== SQL 控制台（全局） ===== */

function openSql(){
  $('sqlDrawer').classList.remove('hidden');
  $('sqlInput').focus();
}
$('btnSqlClose').onclick=function(){$('sqlDrawer').classList.add('hidden')};
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

/* ===== 启动 ===== */

async function boot(){
  renderNav();
  try{
    var m=await api('/api/meta');
    $('dbPath').textContent=m.dbPath;
    $('dbPath').title=m.dbPath;
    S.tables=m.tables;
    if(!S.table&&m.tables.length)S.table=m.tables[0].name;
  }catch(e){}
  renderTables();
  navTo('overview');
}

boot();
})();
</script>
</body>
</html>
`;
