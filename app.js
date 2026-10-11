// ====== CONFIGURACIÓN ======
const SUPABASE_URL='https://wgmdptvwybvywzshezpz.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_-neaL3H8tySpe4LYjGzolA_s-fiRhGa';   // Supabase > Settings > API > anon public
// ===========================
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id), n=x=>Number(x||0), r2=x=>Math.round(x*100)/100;
const eur=x=>n(x).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p2=x=>String(x).padStart(2,'0'), mesDe=x=>`${x.getFullYear()}-${p2(x.getMonth()+1)}-01`, hoyISO=()=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
let d=new Date(), MES=mesDe(d);
let S={open:{}}, reg=0, charts={};

// ---------- Auth ----------
function authMode(m){reg=m;$('tabL').classList.toggle('on',!m);$('tabR').classList.toggle('on',!!m);$('fNombre').classList.toggle('hide',!m);$('aGo').textContent=m?'Crear cuenta':'Entrar';$('msg').textContent=''}
async function authGo(){
 const email=$('aEmail').value.trim(),password=$('aPass').value,nombre=$('aNombre').value.trim();$('msg').textContent='';
 if(!email||password.length<6)return $('msg').textContent='Escribe un correo y una contraseña de al menos 6 caracteres.';
 if(reg){ if(nombre.length<3)return $('msg').textContent='El nombre de usuario necesita al menos 3 caracteres.';
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{nombre}}});
  if(error)return $('msg').textContent=error.message.includes('Database')?'Ese nombre de usuario ya está en uso.':error.message;
  if(!data.session)$('msg').textContent='Cuenta creada. Confirma tu correo y vuelve a iniciar sesión.';
 }else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)$('msg').textContent='Correo o contraseña incorrectos.'}
}
sb.auth.onAuthStateChange((_e,s)=>{ if(s){S.user=s.user;boot()}else{$('app').classList.add('hide');$('auth').classList.remove('hide')} });
sb.auth.getSession().then(({data})=>{if(!data.session)$('auth').classList.remove('hide')});

// ---------- Carga ----------
async function boot(){
 $('auth').classList.add('hide');
 const {data:u}=await sb.from('usuarios').select('*').eq('id',S.user.id).single();S.perfil=u;if(u)aplicaFecha(u);if(u&&u.email!==S.user.email){await sb.from('usuarios').update({email:S.user.email}).eq('id',S.user.id);u.email=S.user.email}
 if(!u)return alert('No se encontró tu perfil. ¿Ejecutaste schema.sql?');
 $('chRank').checked=u.en_ranking;
 const {data:m}=await sb.from('meses').select('*').eq('mes',MES).maybeSingle();
 $('app').classList.remove('hide');
 if(!m){const {data:p}=await sb.from('meses').select('ingresos_previstos').lt('mes',MES).order('mes',{ascending:false}).limit(1);
  if(p&&p.length&&n(p[0].ingresos_previstos)>0){await newMonth(n(p[0].ingresos_previstos));return load()}
  return askIncome()}
 S.mes=m;await load();
}
async function load(){
 let {data:cats}=await sb.from('categorias').select('*').eq('mes_id',S.mes.id).order('nombre');
 const {data:movs}=await sb.from('movimientos').select('*').in('categoria_id',cats.length?cats.map(c=>c.id):['00000000-0000-0000-0000-000000000000']).order('fecha',{ascending:false});
 S.cats=cats;S.movs=movs||[];
 // Recalcula los gastos variables según el total de ingresos
 const tot=totalIng();
 for(const c of S.cats) if(c.tipo==='gasto'&&c.modo==='variable'){
  const q=r2(c.porcentaje*tot/100); if(q!==n(c.cantidad)){c.cantidad=q;await sb.from('categorias').update({cantidad:q}).eq('id',c.id)}}
 S.cats.forEach(c=>c.lim=n(c.cantidad)+n(c.extra));render();
}
const totalIng=()=>n(S.mes.ingresos_previstos)+S.cats.filter(c=>c.tipo==='ingreso').reduce((a,c)=>a+n(c.cantidad),0);
const gastado=id=>S.movs.filter(x=>x.categoria_id===id).reduce((a,x)=>a+n(x.importe),0);

// ---------- Mes nuevo: ingresos previstos + copia del mes anterior ----------
function askIncome(){
 $('dlg').innerHTML=`<h3>¿Qué ingresos prevés este mes?</h3><p class="mut">Tu sueldo u otros ingresos base. Podrás añadir ingresos extra después.</p>
 <input id="iIng" type="number" min="0" step="0.01" placeholder="1500"><button onclick="saveIncome()">Continuar</button>`;
 $('dlg').addEventListener('cancel',e=>e.preventDefault(),{once:true});$('dlg').showModal();
}
async function saveIncome(){await newMonth(n($('iIng').value));$('dlg').close();await load()}
async function newMonth(v){if(v<=0)return;
 const {data:m,error}=await sb.from('meses').insert({user_id:S.user.id,mes:MES,ingresos_previstos:v}).select().single();
 if(error)return alert(error.message);S.mes=m;
 const {data:prev}=await sb.from('meses').select('*').lt('mes',MES).order('mes',{ascending:false}).limit(1);
 if(prev&&prev.length){
  const p=prev[0],{data:pc}=await sb.from('categorias').select('*').eq('mes_id',p.id);
  const {data:pm}=await sb.from('movimientos').select('categoria_id,importe').in('categoria_id',pc.map(c=>c.id));
  const tot=v+pc.filter(c=>c.tipo==='ingreso'&&c.modo==='fijo').reduce((a,c)=>a+n(c.cantidad),0);
  for(const c of pc){
   if(c.tipo==='ingreso'&&c.modo==='variable')continue;
   const cant=c.tipo==='gasto'&&c.modo==='variable'?r2(c.porcentaje*tot/100):c.cantidad;
   const gas=(pm||[]).filter(x=>x.categoria_id===c.id).reduce((a,x)=>a+n(x.importe),0),L=n(c.cantidad)+n(c.extra);
   const extra=c.tipo==='gasto'&&c.arrastrar_ahorro&&gas<L?r2(L-gas):0;
   const {data:nc}=await sb.from('categorias').insert({user_id:S.user.id,mes_id:m.id,nombre:c.nombre,tipo:c.tipo,modo:c.modo,cantidad:cant,porcentaje:c.porcentaje,extra,arrastrar:c.arrastrar,arrastrar_ahorro:c.arrastrar_ahorro}).select().single();
   if(c.tipo==='gasto'&&c.arrastrar&&gas>L&&nc)
    await sb.from('movimientos').insert({user_id:S.user.id,categoria_id:nc.id,importe:r2(gas-L),nota:'Exceso arrastrado del mes anterior'});
  }}
}

// ---------- Render ----------
function render(){
 const tot=totalIng(),G=S.cats.filter(c=>c.tipo==='gasto'),I=S.cats.filter(c=>c.tipo==='ingreso');
 const lim=G.reduce((a,c)=>a+n(c.lim),0),gas=G.reduce((a,c)=>a+gastado(c.id),0);
 const exc=G.reduce((a,c)=>a+Math.max(0,gastado(c.id)-c.lim),0),ahor=G.reduce((a,c)=>a+Math.max(0,c.lim-gastado(c.id)),0);
 $('titulo').textContent=`Hola, ${S.perfil.nombre} · ${d.toLocaleDateString('es-ES',{month:'long',year:'numeric'})}`;
 $('kpis').innerHTML=[['Ingresos totales',eur(tot),''],['Límite total de gastos',eur(lim),''],['Gastado',eur(gas),gas>lim?'bad':''],
  ['Ahorrado en gastos',eur(ahor),'ok'],['Pasado del límite',eur(exc),exc?'bad':''],['Libre del total',eur(tot-gas),tot-gas<0?'bad':'']]
  .map(k=>`<div class="k"><small>${k[0]}</small><div class="${k[2]}">${k[1]}</div></div>`).join('');
 $('tG').innerHTML=`<tr><th>Gasto</th><th>Tipo</th><th>Límite</th><th>% ingresos</th><th>Gastado</th><th>Estado</th><th></th></tr>`+
  (G.map(c=>{const g=gastado(c.id),df=c.lim-g,pct=c.lim>0?g/c.lim*100:0,over=df<0;
   return `<tr class="${over?'over':pct>=80?'warn':''}"><td><b>${esc(c.nombre)}</b></td><td><span class="tag ${c.modo}">${c.modo}</span></td><td>${eur(c.lim)}${n(c.extra)>0?`<br><small class="mut">incluye ${eur(c.extra)} del mes anterior</small>`:''}</td><td>${(c.modo==='variable'?n(c.porcentaje):(tot?c.cantidad/tot*100:0)).toFixed(1)}%</td>
   <td>${eur(g)}<div class="bar"><i style="width:${Math.min(100,pct)}%"></i></div></td>
   <td>${over?`Pasado ${eur(-df)}<br><label><input type="checkbox" style="width:auto;margin:0 .3rem 0 0" ${c.arrastrar?'checked':''} onchange="arrastrar('${c.id}',this.checked)">Sumar el exceso al mes siguiente</label>`:`<span class="ok">Ahorrado ${eur(df)}</span><br><label><input type="checkbox" style="width:auto;margin:0 .3rem 0 0" ${c.arrastrar_ahorro?'checked':''} onchange="arrastrarA('${c.id}',this.checked)">Sumar lo sobrante al mes siguiente</label>`}</td>
   <td><div class="acts"><button onclick="movForm('${c.id}')">+ Gasto</button><button class="sec" onclick="toggleMovs('${c.id}')">Detalle (${S.movs.filter(x=>x.categoria_id===c.id).length})</button><button class="sec" onclick="catForm('gasto','${c.id}')">Editar</button><button class="del" onclick="delCat('${c.id}')">Borrar</button></div></td></tr>${movsRow(c)}`}).join('')||`<tr><td colspan="7" class="mut">Aún no hay gastos. Añade el primero con “+ Añadir gasto”.</td></tr>`);
 $('tI').innerHTML=`<tr><th>Ingreso</th><th>Tipo</th><th>Importe</th><th></th></tr>`+
  (I.map(c=>`<tr><td><b>${esc(c.nombre)}</b></td><td><span class="tag ${c.modo}">${c.modo}</span></td><td>${eur(c.cantidad)}</td><td><div class="acts"><button class="sec" onclick="catForm('ingreso','${c.id}')">Editar</button><button class="del" onclick="delCat('${c.id}')">Borrar</button></div></td></tr>`).join('')||`<tr><td colspan="4" class="mut">Sin ingresos adicionales.</td></tr>`);
}

// ---------- Formularios ----------
function catForm(tipo,id){
 const c=id?S.cats.find(x=>x.id===id):{nombre:'',modo:'variable',cantidad:'',porcentaje:'',arrastrar:false};
 const g=tipo==='gasto';
 $('dlg').innerHTML=`<h3>${id?'Editar':'Añadir'} ${g?'gasto':'ingreso adicional'}</h3>
 <label>Nombre<input id="fN" value="${esc(c.nombre)}"></label>
 <label>${g?'Gasto':'Ingreso'} fijo o variable<select id="fM"><option value="fijo">Fijo${g?' (misma cantidad siempre)':' (se repite cada mes)'}</option><option value="variable">Variable${g?' (se ajusta al sueldo)':' (solo este mes)'}</option></select></label>
 ${g?`<div class="row"><label>Definir por<select id="fT"><option value="eur">Cantidad (€)</option><option value="pct">Porcentaje (%)</option></select></label><label>Valor<input id="fV" type="number" min="0" step="0.01"></label></div><p class="mut" id="fCalc"></p>`
 :`<label>Cantidad (€)<input id="fV" type="number" min="0" step="0.01" value="${c.cantidad}"></label>`}
 <div class="row"><button class="sec" onclick="$('dlg').close()">Cancelar</button><button onclick="saveCat('${tipo}','${id||''}')">Guardar</button></div>`;
 $('fM').value=c.modo;
 if(g){const upd=()=>{const v=n($('fV').value),t=totalIng();$('fCalc').textContent=$('fT').value==='eur'?`Equivale al ${t?(v/t*100).toFixed(1):0}% de tus ingresos (${eur(t)})`:`Equivale a ${eur(v*t/100)}`};
  $('fV').value=c.cantidad;$('fV').oninput=$('fT').onchange=()=>{ $('fT').onchange===upd;upd()};
  $('fT').onchange=()=>{$('fV').value=$('fT').value==='pct'?n(c.porcentaje||(totalIng()?c.cantidad/totalIng()*100:0)).toFixed(2):c.cantidad;upd()};upd()}
 $('dlg').showModal();
}
async function saveCat(tipo,id){
 const nombre=$('fN').value.trim(),v=n($('fV').value),modo=$('fM').value;if(!nombre||v<=0)return alert('Indica un nombre y un valor mayor que 0.');
 const t0=totalIng(),old=id?S.cats.find(x=>x.id===id):null;let cantidad=v,porcentaje=0;
 if(tipo==='gasto'){
  const tot=t0; if($('fT').value==='pct'){porcentaje=v;cantidad=r2(v*tot/100)}else{porcentaje=tot?r2(v/tot*10000)/100:0}
 }
 const row={user_id:S.user.id,mes_id:S.mes.id,nombre,tipo,modo,cantidad,porcentaje};
 const {error}=id?await sb.from('categorias').update(row).eq('id',id):await sb.from('categorias').insert(row);
 if(error)return alert(error.message);$('dlg').close();await load();
}
function toggleMovs(id){S.open[id]=!S.open[id];render()}
function movsRow(c){if(!S.open[c.id])return'';const ms=S.movs.filter(x=>x.categoria_id===c.id);
 return `<tr class="movs"><td colspan="7">${ms.length?ms.map(x=>`<div class="mv"><span class="mvd">${x.fecha.split('-').reverse().join('/')}</span><b>${eur(x.importe)}</b><span class="mvn">${x.nota?esc(x.nota):'<i class="mut">Sin nota</i>'}</span><span class="acts"><button class="sec" onclick="movForm('${c.id}','${x.id}')">Editar</button><button class="del" onclick="delMov('${x.id}')">Borrar</button></span></div>`).join(''):'<span class="mut">Aún no has apuntado gastos aquí.</span>'}</td></tr>`}
function movForm(cid,mid){
 const c=S.cats.find(x=>x.id===cid),x=mid?S.movs.find(m=>m.id===mid):{importe:'',nota:'',fecha:hoyISO()};
 $('dlg').innerHTML=`<h3>${mid?'Editar':'Apuntar'} gasto en “${esc(c.nombre)}”</h3><label>Importe (€)<input id="mI" type="number" min="0.01" step="0.01" value="${x.importe}"></label><label>Fecha<input id="mF" type="date" value="${x.fecha}"></label><label>Nota (opcional)<input id="mN" value="${esc(x.nota||'')}"></label>
 <div class="row"><button class="sec" onclick="$('dlg').close()">Cancelar</button><button onclick="saveMov('${cid}','${mid||''}')">Guardar</button></div>`;$('dlg').showModal();
}
async function saveMov(cid,mid){const v=n($('mI').value);if(v<=0)return;
 const row={importe:v,nota:$('mN').value.trim()||null,fecha:$('mF').value||undefined};
 const {error}=mid?await sb.from('movimientos').update(row).eq('id',mid):await sb.from('movimientos').insert({...row,user_id:S.user.id,categoria_id:cid});
 if(error)return alert(error.message);$('dlg').close();S.open[cid]=true;await load()}
async function delMov(id){if(!confirm('¿Borrar este gasto?'))return;await sb.from('movimientos').delete().eq('id',id);await load()}
async function delCat(id){if(!confirm('¿Borrar esta fila y sus gastos apuntados?'))return;await sb.from('categorias').delete().eq('id',id);await load()}
async function arrastrarA(id,v){await sb.from('categorias').update({arrastrar_ahorro:v}).eq('id',id);S.cats.find(c=>c.id===id).arrastrar_ahorro=v}
async function arrastrar(id,v){await sb.from('categorias').update({arrastrar:v}).eq('id',id);S.cats.find(c=>c.id===id).arrastrar=v}

// ---------- Navegación, estadísticas y ranking ----------
document.querySelectorAll('nav [data-v]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('nav [data-v]').forEach(x=>x.classList.toggle('on',x===b));
 b.scrollIntoView&&b.scrollIntoView({inline:'center',block:'nearest'});
 ['resumen','stats','rank','hist','conf','admin'].forEach(v=>$('v-'+v).classList.toggle('hide',v!==b.dataset.v));
 if(b.dataset.v==='stats')stats();if(b.dataset.v==='rank')rank();if(b.dataset.v==='hist')hist();if(b.dataset.v==='conf')conf();if(b.dataset.v==='admin')admin()});
$('chRank').onchange=async e=>{await sb.from('usuarios').update({en_ranking:e.target.checked}).eq('id',S.user.id)};
function chart(id,cfg){charts[id]&&charts[id].destroy();charts[id]=new Chart($(id),cfg)}
async function stats(){
 const G=S.cats.filter(c=>c.tipo==='gasto'),names=G.map(c=>c.nombre),pal=['#1b5e63','#e08a1e','#7a5195','#2a7d46','#c62828','#3c78b4','#8d6e63','#00897b'];
 chart('c1',{type:'bar',data:{labels:names,datasets:[{label:'Límite',data:G.map(c=>c.lim),backgroundColor:'#9fc5c8'},{label:'Gastado',data:G.map(c=>gastado(c.id)),backgroundColor:G.map(c=>gastado(c.id)>c.lim?'#c62828':'#1b5e63')}]}});
 chart('c2',{type:'doughnut',data:{labels:names,datasets:[{data:G.map(c=>gastado(c.id)),backgroundColor:pal}]}});
 const [{data:ms},{data:cs},{data:mv}]=await Promise.all([sb.from('meses').select('*').order('mes'),sb.from('categorias').select('mes_id,tipo,cantidad'),sb.from('movimientos').select('importe,categorias(mes_id)')]);
 const ing=ms.map(m=>n(m.ingresos_previstos)+cs.filter(c=>c.mes_id===m.id&&c.tipo==='ingreso').reduce((a,c)=>a+n(c.cantidad),0));
 const gas=ms.map(m=>mv.filter(x=>x.categorias&&x.categorias.mes_id===m.id).reduce((a,x)=>a+n(x.importe),0));
 chart('c3',{type:'bar',data:{labels:ms.map(m=>m.mes.slice(0,7)),datasets:[{label:'Ingresos',data:ing,backgroundColor:'#1b5e63'},{label:'Gastos',data:gas,backgroundColor:'#e08a1e'},{label:'Ahorro',data:ing.map((v,i)=>v-gas[i]),type:'line',borderColor:'#2a7d46'}]}});
}
async function rank(){
 const {data,error}=await sb.rpc('ranking');
 $('tR').innerHTML=`<tr><th>Puesto</th><th>Usuario</th><th>Gastado</th><th>Ahorro</th><th>Puntuación</th></tr>`+
 (error?`<tr><td colspan="5" class="bad">${esc(error.message)}</td></tr>`:(data||[]).map((r,i)=>`<tr style="${r.nombre===S.perfil.nombre?'font-weight:800':''}"><td>${i+1}</td><td>${esc(r.nombre)}</td><td>${eur(r.gastado)}</td><td>${eur(r.ahorro)}</td><td>${r.puntuacion}</td></tr>`).join('')||`<tr><td colspan="5" class="mut">Todavía no hay usuarios en el ranking este mes.</td></tr>`);
}

function incomeForm(){
 $('dlg').innerHTML=`<h3>Ingresos previstos del mes</h3><p class="mut">Los gastos variables se recalculan con su porcentaje. Los fijos no cambian.</p>
 <input id="iIng" type="number" min="0" step="0.01" value="${S.mes.ingresos_previstos}">
 <div class="row"><button class="sec" onclick="$('dlg').close()">Cancelar</button><button onclick="saveIncomeEdit()">Guardar</button></div>`;$('dlg').showModal()}
async function saveIncomeEdit(){const v=n($('iIng').value);if(v<=0)return;
 const {error}=await sb.from('meses').update({ingresos_previstos:v}).eq('id',S.mes.id);if(error)return alert(error.message);
 S.mes.ingresos_previstos=v;$('dlg').close();await load()}

// ---------- Meses anteriores (solo lectura) ----------
async function hist(){
 const {data:ms}=await sb.from('meses').select('*').lt('mes',MES).order('mes',{ascending:false});
 if(!ms||!ms.length){$('hSel').classList.add('hide');$('hBody').innerHTML='<div class="box mut">Todavía no hay meses anteriores. Aparecerán aquí cuando empiece el mes siguiente.</div>';return}
 S.hms=ms;$('hSel').classList.remove('hide');
 $('hSel').innerHTML=ms.map(m=>`<option value="${m.id}">${new Date(m.mes+'T00:00:00').toLocaleDateString('es-ES',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())}</option>`).join('');
 $('hSel').onchange=histMonth;histMonth();
}
async function histMonth(){
 const m=S.hms.find(x=>x.id===$('hSel').value);
 const {data:cs}=await sb.from('categorias').select('*').eq('mes_id',m.id).order('nombre');cs.forEach(c=>c.lim=n(c.cantidad)+n(c.extra));
 const {data:mv}=await sb.from('movimientos').select('*').in('categoria_id',cs.length?cs.map(c=>c.id):['00000000-0000-0000-0000-000000000000']).order('fecha');
 const of=id=>(mv||[]).filter(x=>x.categoria_id===id),gs=id=>of(id).reduce((a,x)=>a+n(x.importe),0);
 const G=cs.filter(c=>c.tipo==='gasto'),I=cs.filter(c=>c.tipo==='ingreso');
 const ing=n(m.ingresos_previstos)+I.reduce((a,c)=>a+n(c.cantidad),0),lim=G.reduce((a,c)=>a+n(c.lim),0),gas=G.reduce((a,c)=>a+gs(c.id),0);
 const exc=G.reduce((a,c)=>a+Math.max(0,gs(c.id)-c.lim),0),ahor=G.reduce((a,c)=>a+Math.max(0,c.lim-gs(c.id)),0);
 $('hBody').innerHTML=`<div class="kpis">${[['Ingresos totales',eur(ing),''],['Límite total de gastos',eur(lim),''],['Gastado',eur(gas),gas>lim?'bad':''],['Ahorrado en gastos',eur(ahor),'ok'],['Pasado del límite',eur(exc),exc?'bad':''],['Resultado del mes',eur(ing-gas),ing-gas<0?'bad':'']]
  .map(k=>`<div class="k"><small>${k[0]}</small><div class="${k[2]}">${k[1]}</div></div>`).join('')}</div>
 <div class="box"><h3>Gastos</h3><table><tr><th>Gasto</th><th>Tipo</th><th>Límite</th><th>Gastado</th><th>Resultado</th></tr>${G.map(c=>{const g=gs(c.id),df=c.lim-g;
  return `<tr class="${df<0?'over':''}"><td><b>${esc(c.nombre)}</b></td><td><span class="tag ${c.modo}">${c.modo}</span></td><td>${eur(c.lim)}</td><td>${eur(g)}</td><td>${df<0?'Pasado '+eur(-df):`<span class="ok">Ahorrado ${eur(df)}</span>`}</td></tr>`
  +of(c.id).map(x=>`<tr class="movs"><td colspan="5"><div class="mv"><span class="mvd">${x.fecha.split('-').reverse().join('/')}</span><b>${eur(x.importe)}</b><span class="mvn">${x.nota?esc(x.nota):'<i class="mut">Sin nota</i>'}</span><span></span></div></td></tr>`).join('')}).join('')||'<tr><td colspan="5" class="mut">Sin gastos este mes.</td></tr>'}</table></div>
 <div class="box"><h3>Ingresos adicionales</h3><table><tr><th>Ingreso</th><th>Tipo</th><th>Importe</th></tr>${I.map(c=>`<tr><td><b>${esc(c.nombre)}</b></td><td><span class="tag ${c.modo}">${c.modo}</span></td><td>${eur(c.cantidad)}</td></tr>`).join('')||'<tr><td colspan="3" class="mut">Sin ingresos adicionales.</td></tr>'}</table></div>`;
}

// ---------- Configuración ----------
function conf(){$('cNombre').value=S.perfil.nombre;$('cEmail').value=S.user.email;['cPA','cPN','cPR'].forEach(i=>$(i).value='');['mNombre','mEmail','mPass'].forEach(i=>$(i).textContent='')}
function fmsg(id,t,ok){const e=$(id);e.textContent=t;e.className='fmsg '+(ok?'ok':'bad')}
async function saveNombre(){const v=$('cNombre').value.trim();
 if(v.length<3||v.length>20)return fmsg('mNombre','El nombre debe tener entre 3 y 20 caracteres.');
 const {error}=await sb.from('usuarios').update({nombre:v}).eq('id',S.user.id);
 if(error)return fmsg('mNombre',error.code==='23505'?'Ese nombre de usuario ya está en uso.':error.message);
 S.perfil.nombre=v;await sb.auth.updateUser({data:{nombre:v}});fmsg('mNombre','Nombre actualizado.',1);render()}
async function saveEmail(){const v=$('cEmail').value.trim();
 if(!v||v===S.user.email)return fmsg('mEmail','Escribe un correo distinto al actual.');
 const {error}=await sb.auth.updateUser({email:v},{emailRedirectTo:location.protocol.startsWith('http')?location.origin+location.pathname:undefined});
 if(error)return fmsg('mEmail',error.message);
 fmsg('mEmail','Te hemos enviado un enlace de verificación. Si Supabase lo exige, confirma también desde tu correo actual.',1)}
async function savePass(){const a=$('cPA').value,p=$('cPN').value,r=$('cPR').value;
 if(p.length<6)return fmsg('mPass','La nueva contraseña necesita al menos 6 caracteres.');
 if(p!==r)return fmsg('mPass','Las contraseñas nuevas no coinciden.');
 const {error:e1}=await sb.auth.signInWithPassword({email:S.user.email,password:a});
 if(e1)return fmsg('mPass','La contraseña actual no es correcta.');
 const {error}=await sb.auth.updateUser({password:p});if(error)return fmsg('mPass',error.message);
 ['cPA','cPN','cPR'].forEach(i=>$(i).value='');fmsg('mPass','Contraseña actualizada.',1)}

// ---------- Administración (el servidor valida es_admin en cada función) ----------
function aplicaFecha(u){d=u.fecha_simulada?new Date(u.fecha_simulada+'T00:00:00'):new Date();MES=mesDe(d);
 $('simbar').classList.toggle('hide',!u.fecha_simulada);
 if(u.fecha_simulada)$('simbar').textContent='Modo prueba: la fecha de tu cuenta es '+d.toLocaleDateString('es-ES')+'. Solo afecta a tu cuenta.';
 $('navAdmin').classList.toggle('hide',!u.es_admin)}
async function admin(){
 if(!S.perfil.es_admin)return;
 $('aFecha').value=S.perfil.fecha_simulada||'';
 const {data,error}=await sb.rpc('admin_usuarios');
 $('aUsers').innerHTML=`<tr><th>Usuario</th><th>Correo</th><th>Meses</th><th>Gastos apuntados</th><th>Fecha simulada</th><th>Rol</th></tr>`+(error?`<tr><td colspan="6" class="bad">${esc(error.message)}</td></tr>`
  :data.map(u=>`<tr><td><b>${esc(u.nombre)}</b></td><td>${esc(u.email||'')}</td><td>${u.meses}</td><td>${u.movimientos}</td><td>${u.fecha_simulada||'—'}</td><td><button class="${u.es_admin?'del':'sec'}" onclick="setAdmin('${u.id}',${!u.es_admin})">${u.es_admin?'Quitar admin':'Hacer admin'}</button></td></tr>`).join(''))}
async function adm(fn,args,msg){const {error}=await sb.rpc(fn,args);if(error)return fmsg('aMsg',error.message);fmsg('aMsg',msg,1);await boot();admin();return true}
const setFecha=async()=>{if(await adm('admin_set_fecha',{f:$('aFecha').value||null},'Fecha actualizada. Se ha recargado el mes correspondiente.')&&$('aFecha').value)await probarCorreo()};
const fechaReal=()=>{$('aFecha').value='';return setFecha()};
const setAdmin=(id,v)=>adm('admin_set_admin',{uid:id,flag:v},'Rol actualizado.');
const demo=()=>adm('admin_datos_demo',{},'Mes anterior de ejemplo creado (con un gasto pasado y arrastre activado).');
const borrarMes=()=>confirm('¿Borrar tu mes actual y todos sus datos? Se volverá a generar desde el mes anterior.')&&adm('admin_borrar_mes',{m:MES},'Mes actual borrado y regenerado desde el anterior.');
async function probarCorreo(){fmsg('aMsg','Enviando…',1);const prev=new Date(d.getFullYear(),d.getMonth()-1,1);
 const {data,error}=await sb.functions.invoke('resumen-mensual',{body:{mes:mesDe(prev),user_id:S.user.id}});
 if(error||(data&&data.error)){const det=error&&error.context?await error.context.json().catch(()=>null):null;
  return fmsg('aMsg','No se pudo enviar: '+((data&&data.error)||(det&&det.error)||(error.context&&error.context.status===404?'la función resumen-mensual no está desplegada.':error.message)))}
 if(data.errores&&data.errores.length)return fmsg('aMsg','El proveedor de correo rechazó el envío: '+data.errores[0]);
 fmsg('aMsg',data.enviados?'Correo enviado a '+S.user.email+'. Revisa también la carpeta de spam.':'No hay datos del mes anterior. Crea primero el mes de ejemplo.',data.enviados)}
async function comprobar(){const out=[],ok=(t,b,x)=>out.push(`<li class="${b?'ok':'bad'}">${b?'✓':'✗'} ${t}${x?' — '+esc(x):''}</li>`);
 const a0=await sb.auth.getSession();ok('Sesión activa',!!a0.data.session);
 const a1=await sb.from('usuarios').select('id').eq('id',S.user.id).single();ok('Lectura de tu perfil',!a1.error,a1.error&&a1.error.message);
 const a2=await sb.from('usuarios').update({es_admin:true}).eq('id',S.user.id);ok('Un usuario no puede darse permisos de admin (debe fallar)',!!a2.error);
 const a3=await sb.from('meses').select('id').eq('mes',MES);ok('Existe el mes actual ('+MES+(S.perfil.fecha_simulada?', simulado':', real')+')',!!(a3.data&&a3.data.length));
 const tot=totalIng(),mal=S.cats.filter(c=>c.tipo==='gasto'&&c.modo==='variable'&&Math.abs(c.cantidad-r2(c.porcentaje*tot/100))>0.01);
 ok('Límites variables coherentes con los ingresos',!mal.length,mal.map(c=>c.nombre).join(', '));
 const a4=await sb.rpc('ranking');ok('Función del ranking',!a4.error,a4.error&&a4.error.message);
 const a5=await sb.rpc('admin_usuarios');ok('Funciones de administración',!a5.error,a5.error&&a5.error.message);
 $('aChk').innerHTML=out.join('')}

// ---------- Vista móvil: las tablas se muestran como tarjetas ----------
// Copia el texto de cada cabecera (th) en las celdas de su columna (data-l) para poder mostrarlo como etiqueta.
function etiquetar(){
 document.querySelectorAll('main table').forEach(t=>{
  const rows=[...t.querySelectorAll('tr')],hr=rows.find(r=>r.querySelector('th'));if(!hr)return;
  hr.classList.add('hr');const h=[...hr.children].map(x=>x.textContent.trim());
  rows.forEach(r=>{if(r===hr)return;[...r.children].forEach((td,i)=>{
   if(td.colSpan>1||!h[i])td.removeAttribute('data-l');else td.dataset.l=h[i];
   td.classList.toggle('full',!!td.querySelector('.bar,label,.acts,button')||/correo|nota|descrip/i.test(h[i]||''))});
   r.classList.toggle('vacio',r.children.length===1&&r.children[0].colSpan>1&&!r.classList.contains('movs'))})})}
let _et;new MutationObserver(()=>{cancelAnimationFrame(_et);_et=requestAnimationFrame(etiquetar)}).observe(document.querySelector('main'),{childList:true,subtree:true});
etiquetar();
