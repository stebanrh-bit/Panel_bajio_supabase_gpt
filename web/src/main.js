import { createClient } from '@supabase/supabase-js';
import './style.css';
const root = document.querySelector('#app');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client, session, profile, loads = [], activeLoad = null;
const fields = {load:'Número de carga', customer:'Cliente', origin_city:'Ciudad de origen', origin_state:'Estado de origen', dest_city:'Ciudad de destino', dest_state:'Estado de destino', truck:'Unidad', trailer:'Remolque', status:'Estatus', pickup_appt:'Cita de recolección', delivery_appt:'Cita de entrega', tracking_link:'Enlace de seguimiento', eta_note:'Nota de ETA'};
const writable = () => ['admin','csr'].includes(profile?.role);
function error(message) { const el = document.querySelector('#message'); if (el) { el.textContent = message; el.setAttribute('role','alert'); } }
async function request(query) { const {data, error:err} = await query; if (err) throw err; return data; }
function shell(content) {
  root.innerHTML = `<header><div><small>OPERACIONES</small><h1>Panel Bajío</h1></div>${session ? `<div>${escape(profile?.display_name || session.user.email)} <button id="logout">Salir</button></div>` : ''}</header><main><p id="message" aria-live="polite"></p>${content}</main>`;
  document.querySelector('#logout')?.addEventListener('click', async () => { try { const {error:err} = await client.auth.signOut(); if(err) throw err; session = null; profile = null; loads = []; activeLoad = null; login(); } catch(err) { error(err.message); } });
}
function login() {
  shell(`<section class="card narrow"><h2>Entrar al panel</h2><p>Usa la cuenta que te asignó el administrador.</p><form id="login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button>Iniciar sesión</button></form></section>`);
  document.querySelector('#login').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { const values = new FormData(event.target); const {data,error:err} = await client.auth.signInWithPassword({email:values.get('email'),password:values.get('password')}); if(err) throw err; session = data.session; await dashboard(); } catch(err) { error(err.message); } finally { button.disabled = false; }
  });
}
async function dashboard() {
  try {
    profile = await request(client.from('profiles').select('*').eq('id',session.user.id).single());
    if(profile.role === 'pending') { shell('<section class="card"><h2>Acceso pendiente</h2><p>Tu administrador debe asignarte un rol antes de que puedas consultar cargas.</p></section>'); return; }
    loads = []; let offset = 0;
    for (;;) {
      const batch = await request(client.from('loads').select('*').eq('archived',false).order('load').range(offset,offset+499));
      loads.push(...batch); if(batch.length < 500) break; offset += 500;
    }
    activeLoad = null;
    shell(`<section class="card"><div class="toolbar"><h2>Cargas activas <span class="count">${loads.length}</span></h2>${writable()?'<button id="new">Nueva carga</button>':''}<button id="refresh">Actualizar</button></div><label>Buscar carga, cliente, unidad o ruta<input id="search" type="search" placeholder="Buscar…"></label><div class="scroll"><table><thead><tr><th>Carga</th><th>Cliente</th><th>Ruta</th><th>Estatus</th><th>Unidad</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section><section id="detail"></section>`);
    renderRows('');
    document.querySelector('#search').addEventListener('input',e => renderRows(e.target.value));
    document.querySelector('#refresh').addEventListener('click',dashboard);
    document.querySelector('#new')?.addEventListener('click',() => editor());
  } catch(err) { shell('<section class="card"><h2>No se pudieron cargar los datos</h2><button id="retry">Reintentar</button></section>'); error(err.message); document.querySelector('#retry').onclick=dashboard; }
}
function renderRows(search) {
  const filtered = loads.filter(row => [row.load,row.customer,row.origin_city,row.dest_city,row.truck].some(v => String(v).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  document.querySelector('#rows').innerHTML = filtered.map(row => `<tr><td>${escape(row.load)}</td><td>${escape(row.customer)}</td><td>${escape(row.origin_city)} → ${escape(row.dest_city)}</td><td>${escape(row.status)}</td><td>${escape(row.truck)}</td><td><button data-load="${escape(row.load)}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="6">No hay cargas para mostrar.</td></tr>';
  document.querySelectorAll('[data-load]').forEach(button => button.onclick = () => detail(button.dataset.load));
}
async function detail(id) {
  activeLoad = id;
  try {
    const row = await request(client.from('loads').select('*').eq('load',id).single());
    const [comments,incidents,history] = await Promise.all([
      request(client.from('comments').select('*').eq('load',id).order('created_at',{ascending:false}).limit(100)),
      request(client.from('incidents').select('*').eq('load',id).order('created_at',{ascending:false}).limit(100)),
      request(client.from('load_history').select('changed_at,actor').eq('load',id).order('changed_at',{ascending:false}).limit(10))
    ]);
    if (activeLoad !== id) return;
    const section = document.querySelector('#detail'); if (!section) return;
    section.innerHTML = `<div class="card"><div class="toolbar"><h2>Carga ${escape(id)}</h2>${writable()?'<button id="edit">Editar</button>':''}</div><dl>${Object.entries(fields).map(([field,label])=>`<div><dt>${label}</dt><dd>${escape(row[field]) || '—'}</dd></div>`).join('')}</dl><h3>Comentarios</h3><ul>${comments.map(c=>`<li>${escape(c.body)} <small>${escape(new Date(c.created_at).toLocaleString())}</small></li>`).join('') || '<li>Sin comentarios.</li>'}</ul>${writable()?'<form id="comment"><label>Nuevo comentario<textarea name="body" required maxlength="10000"></textarea></label><button>Agregar comentario</button></form>':''}<h3>Incidencias</h3><ul>${incidents.map(i=>`<li><strong>${escape(i.category)} · ${escape(i.severity)}</strong><p>${escape(i.description)}</p><p>${escape(i.action_taken)}</p></li>`).join('') || '<li>Sin incidencias.</li>'}</ul>${writable()?'<form id="incident"><label>Categoría<input name="category" required maxlength="100"></label><label>Severidad<select name="severity"><option>baja</option><option>media</option><option>alta</option></select></label><label>Descripción<textarea name="description" required maxlength="10000"></textarea></label><label>Acción tomada<textarea name="action_taken"></textarea></label><button>Registrar incidencia</button></form>':''}<h3>Últimos cambios</h3><ul>${history.map(h=>`<li>${escape(new Date(h.changed_at).toLocaleString())}</li>`).join('')}</ul></div>`;
    document.querySelector('#edit')?.addEventListener('click',()=>editor(row));
    for(const [formId,table] of [['comment','comments'],['incident','incidents']]) {
      document.querySelector(`#${formId}`)?.addEventListener('submit',async e=>{
        e.preventDefault(); const button=e.target.querySelector('button');button.disabled=true;
        try { const values=Object.fromEntries(new FormData(e.target)); await request(client.from(table).insert({...values,load:id})); await detail(id); } catch(err) {error(err.message);} finally {button.disabled=false;}
      });
    }
    section.scrollIntoView({behavior:'smooth'});
  } catch(err) {error(err.message);}
}
function editor(row = {}) {
  activeLoad = null;
  const section=document.querySelector('#detail');
  section.innerHTML=`<div class="card"><h2>${row.load?'Editar carga':'Nueva carga'}</h2><form id="editor"><div class="grid">${Object.entries(fields).map(([field,label])=>`<label>${label}<input name="${field}" value="${escape(row[field])}" ${field==='load' ? `required ${row.load?'readonly':''}`:''} ${field==='tracking_link'?'type="url"':''}></label>`).join('')}</div><button>Guardar</button> <button type="button" id="cancel">Cancelar</button></form></div>`;
  document.querySelector('#cancel').onclick=()=>{section.innerHTML='';};
  document.querySelector('#editor').onsubmit=async e=>{
    e.preventDefault(); const button=e.target.querySelector('button');button.disabled=true;
    try { const values=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,v.trim()]));
      if(row.load) {
        // Optimistic concurrency: do not overwrite another operator's intervening edit.
        const data=await request(client.from('loads').update(values).eq('load',row.load).eq('updated_at',row.updated_at).select('load'));
        if(!data.length) throw new Error('La carga cambió desde que la abriste. Actualiza y revisa los cambios antes de guardar.');
      } else await request(client.from('loads').insert(values));
      await dashboard(); await detail(values.load);
    } catch(err) {error(err.message);} finally {button.disabled=false;}
  };
  section.scrollIntoView({behavior:'smooth'});
}
if (!url || !key) {
  shell('<section class="card narrow"><h2>Conecta tu proyecto Supabase</h2><p>La conexión aún no está configurada. Sigue la guía README.md del repositorio para preparar el proyecto e iniciar el panel.</p></section>');
} else {
  try {
    client = createClient(url,key);
    const {data,error:err}=await client.auth.getSession();if(err)throw err;session=data.session;
    if(session) await dashboard(); else login();
    client.auth.onAuthStateChange((event,newSession)=>{
      session=newSession;
      if(event==='SIGNED_OUT') {profile=null;loads=[];activeLoad=null;login();}
    });
  } catch(err) {shell('<section class="card"><h2>No se pudo iniciar la conexión</h2></section>');error(err.message);}
}
