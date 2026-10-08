import { createClient } from '@supabase/supabase-js';
import { statuses, stages, booleanFields, dateFields, marked, stageIndex, alertFor, attentionFor, localDateInput, historyDiff, reminderStatuses, prepareLoadValues } from './load-rules.js';
import './style.css';
const root = document.querySelector('#app');
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client, session, profile, loads = [], activeLoad = null, filter = 'all', generation = 0;
const fields = {
  load:'Número de carga', customer:'Cliente', origin_city:'Ciudad de origen', origin_state:'Estado de origen', origin_address:'Dirección de origen',
  dest_city:'Ciudad de destino', dest_state:'Estado de destino', dest_address:'Dirección de destino', truck:'Unidad', trailer:'Remolque', status:'Estatus',
  pickup_appt:'Cita de recolección', pickup_actual:'Recolección real', delivery_appt:'Cita de entrega', delivery_actual:'Entrega real',
  salida_mexico_fecha:'Salida de planta', cruce_usa_fecha:'Cruce de aduana', cruce_confirmado:'Cruce confirmado',
  bol:'BOL listo', doda:'DODA listo', entry:'Entry listo', sobre_listo:'Sobre listo', pod_sent:'POD compartido', recargos_vg:'Recargos VG cobrados',
  recordatorio_fecha:'Recordatorio / despacho', next_review_at:'Próxima revisión', next_review_note:'Nota de próxima revisión',
  tracking_link:'Enlace de seguimiento', eta_note:'Nota de ETA'
};
const writable = () => ['admin','csr'].includes(profile?.role);
const formatDate = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : String(value || '—');
const formatField = (field,value) => booleanFields.includes(field) ? (marked(value)?'Sí':'No') : dateFields.includes(field) ? formatDate(value) : String(value ?? '') || '—';
function error(message) { const el = document.querySelector('#message'); if (el) { el.textContent = message; el.setAttribute('role','alert'); } }
async function request(query) {
  const {data, error:err} = await query;
  if (err) {
    if(err.code==='PGRST205' || err.code==='PGRST202') throw Error('Falta aplicar la actualización de base de datos 002. Consulta las instrucciones de actualización del proyecto.');
    throw err;
  }
  return data;
}
function shell(content) {
  root.innerHTML = `<header><div><small>OPERACIONES</small><h1>Panel Bajío</h1></div>${session ? `<div>${escape(profile?.display_name || session.user.email)} <button id="logout">Salir</button></div>` : ''}</header><main><p id="message" aria-live="polite"></p>${content}</main>`;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try {
      const {error:err} = await client.auth.signOut(); if(err) throw err;
      clearSession(); login();
    } catch(err) { error(err.message); }
  });
}
function clearSession() { generation++; session=null; profile=null; loads=[]; activeLoad=null; }
function login() {
  shell(`<section class="card narrow"><h2>Entrar al panel</h2><p>Usa la cuenta que te asignó el administrador.</p><form id="login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button>Iniciar sesión</button></form></section>`);
  document.querySelector('#login').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try {
      const values = new FormData(event.target);
      const {data,error:err} = await client.auth.signInWithPassword({email:values.get('email'),password:values.get('password')});
      if(err) throw err; session = data.session; await dashboard();
    } catch(err) { error(err.message); } finally { button.disabled = false; }
  });
}
async function dashboard() {
  if(!session) return login();
  const current=++generation;
  try {
    const nextProfile=await request(client.from('profiles').select('*').eq('id',session.user.id).single());
    if(current!==generation || !session) return;
    profile=nextProfile;
    if(profile.role==='pending') {
      shell('<section class="card"><h2>Acceso pendiente</h2><p>Tu administrador debe asignarte un rol antes de que puedas consultar cargas.</p></section>'); return;
    }
    const nextLoads=[];
    for(let offset=0;;offset+=500) {
      const batch=await request(client.from('loads').select('*,incidents(count)').eq('archived',false).order('load').range(offset,offset+499));
      if(current!==generation || !session) return;
      nextLoads.push(...batch.map(row=>({...row,incidenciasCount:row.incidents?.[0]?.count || 0})));
      if(batch.length<500) break;
    }
    loads=nextLoads; activeLoad=null;
    shell(`<section class="card"><div class="toolbar"><h2>Cargas activas <span class="count">${loads.length}</span></h2>${writable()?'<button id="new">Nueva carga</button>':''}<button id="refresh">Actualizar</button></div><div class="filters"><button data-filter="all">Todas (${loads.length})</button><button data-filter="attention">Requieren atención (${loads.filter(row=>attentionFor(row)).length})</button><button data-filter="notify">Pendientes de avisar (${loads.filter(row=>marked(row.client_notify_pending)).length})</button></div><label>Buscar carga, cliente, unidad o ruta<input id="search" type="search" placeholder="Buscar…"></label><div class="scroll"><table><thead><tr><th>Carga</th><th>Cliente</th><th>Ruta</th><th>Estatus / etapa</th><th>Unidad</th><th>Atención</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section><section id="detail"></section>`);
    renderRows();
    document.querySelector('#search').addEventListener('input',()=>renderRows());
    document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;renderRows();});
    document.querySelector('#refresh').addEventListener('click',dashboard);
    document.querySelector('#new')?.addEventListener('click',()=>editor());
  } catch(err) {
    if(current!==generation || !session) return;
    shell('<section class="card"><h2>No se pudieron cargar los datos</h2><button id="retry">Reintentar</button></section>');
    error(err.message); document.querySelector('#retry').onclick=dashboard;
  }
}
function renderRows() {
  const search=document.querySelector('#search')?.value.toLocaleLowerCase() || '';
  const filtered=loads.filter(row=>[row.load,row.customer,row.origin_city,row.dest_city,row.truck].some(v=>String(v ?? '').toLocaleLowerCase().includes(search)) &&
    (filter==='all' || (filter==='attention' && attentionFor(row)) || (filter==='notify' && marked(row.client_notify_pending))));
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
  document.querySelector('#rows').innerHTML=filtered.map(row=>{
    const alert=alertFor(row),attention=attentionFor(row);
    return `<tr><td>${escape(row.load)}</td><td>${escape(row.customer)}</td><td>${escape(row.origin_city)} → ${escape(row.dest_city)}</td><td>${escape(row.status)}<small class="block">${stages[stageIndex(row)]}</small></td><td>${escape(row.truck)}</td><td><span class="badge ${alert.level==='critical'?'critical':attention?'warn':alert.level}">${escape(attention || alert.message)}</span>${marked(row.client_notify_pending)?'<small class="block">Pendiente de avisar al cliente</small>':''}</td><td><button data-load="${escape(row.load)}">Abrir</button></td></tr>`;
  }).join('') || '<tr><td colspan="7">No hay cargas para mostrar.</td></tr>';
  document.querySelectorAll('[data-load]').forEach(button=>button.onclick=()=>detail(button.dataset.load));
}
async function refreshLoad(id) {
  // Update counts and badges after any operation before reopening the detail.
  await dashboard();
  if(session && document.querySelector('#detail')) await detail(id);
}
async function detail(id) {
  const current=generation;
  activeLoad=id;
  try {
    const row=await request(client.from('loads').select('*').eq('load',id).single());
    const [comments,incidents,history,communications]=await Promise.all([
      request(client.from('comments').select('*').eq('load',id).order('created_at',{ascending:false}).limit(100)),
      request(client.from('incidents').select('*').eq('load',id).order('created_at',{ascending:false}).limit(100)),
      request(client.from('load_history').select('*').eq('load',id).order('changed_at',{ascending:false}).limit(10)),
      request(client.from('communications').select('*').eq('load',id).order('created_at',{ascending:false}).limit(100))
    ]);
    if(activeLoad!==id || current!==generation || !session) return;
    const section=document.querySelector('#detail'); if(!section) return;
    const stage=stageIndex(row),attention=attentionFor({...row,incidenciasCount:incidents.length});
    const updates=history.map(h=>{
      if(!h.before_data) return `<li><strong>Carga creada</strong><small class="block">${escape(formatDate(h.changed_at))}</small></li>`;
      const changes=historyDiff(h.before_data,h.after_data).filter(change=>fields[change.key]);
      return `<li><small>${escape(formatDate(h.changed_at))}</small>${changes.length?`<ul>${changes.map(change=>`<li>${fields[change.key]}: ${escape(formatField(change.key,change.before))} → ${escape(formatField(change.key,change.after))}</li>`).join('')}</ul>`:'<p>Actualización de seguimiento y comunicación.</p>'}</li>`;
    }).join('');
    section.innerHTML=`<div class="card"><div class="toolbar"><h2>Carga ${escape(id)}</h2>${writable()?'<button id="edit">Editar</button><button id="review">Ya revisé</button>':''}</div><ol class="timeline" aria-label="Etapas del recorrido">${stages.map((label,index)=>`<li class="${index<stage?'done':index===stage?'current':''}" ${index===stage?'aria-current="step"':''}>${label}</li>`).join('')}</ol>${attention?`<p class="badge warn">${escape(attention)}</p>`:''}${marked(row.client_notify_pending)?`<p class="badge warn">Pendiente de avisar: ${escape(row.client_notify_reason)}</p>`:''}<dl>${Object.entries(fields).map(([field,label])=>`<div><dt>${label}</dt><dd>${escape(formatField(field,row[field]))}</dd></div>`).join('')}</dl><h3>Comunicaciones con el cliente</h3><p>Registra aquí los avisos que ya enviaste por otro medio.</p>${writable()?'<form id="notice"><div class="grid"><label>Canal<select name="channel"><option>WhatsApp</option><option>Correo</option><option>Teléfono</option><option>Otro</option></select></label><label>Tipo de aviso<input name="notice_type" placeholder="Cambio de cita, cruce, retraso…" required maxlength="200"></label></div><button>Registrar aviso enviado</button></form>':''}<ul>${communications.map(item=>`<li><strong>${item.event_type==='NOTIFICADO'?'Aviso registrado':'Pendiente de avisar'}</strong> ${escape(item.channel)} ${escape(item.notice_type)}<p>${escape(item.reason)}</p><small>${escape(formatDate(item.created_at))}</small></li>`).join('') || '<li>Sin comunicaciones registradas.</li>'}</ul><h3>Comentarios</h3><ul>${comments.map(c=>`<li>${escape(c.body)}<small class="block">${escape(formatDate(c.created_at))}</small></li>`).join('') || '<li>Sin comentarios.</li>'}</ul>${writable()?'<form id="comment"><label>Nuevo comentario<textarea name="body" required maxlength="10000"></textarea></label><button>Agregar comentario</button></form>':''}<h3>Incidencias</h3><ul>${incidents.map(i=>`<li><strong>${escape(i.category)} · ${escape(i.severity)}</strong><p>${escape(i.description)}</p><p>${escape(i.action_taken)}</p></li>`).join('') || '<li>Sin incidencias.</li>'}</ul>${writable()?'<form id="incident"><label>Categoría<input name="category" required maxlength="100"></label><label>Severidad<select name="severity"><option>baja</option><option>media</option><option>alta</option></select></label><label>Descripción<textarea name="description" required maxlength="10000"></textarea></label><label>Acción tomada<textarea name="action_taken"></textarea></label><button>Registrar incidencia</button></form>':''}<h3>Últimos cambios</h3><ul>${updates || '<li>Sin cambios registrados.</li>'}</ul></div>`;
    document.querySelector('#edit')?.addEventListener('click',()=>editor(row));
    document.querySelector('#review')?.addEventListener('click',async event=>{
      event.target.disabled=true;
      try {await request(client.rpc('review_load',{p_load:id,p_version:row.updated_at}));await refreshLoad(id);}
      catch(err) {error(err.message);} finally {event.target.disabled=false;}
    });
    document.querySelector('#notice')?.addEventListener('submit',async event=>{
      event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
      try {
        const values=Object.fromEntries(new FormData(event.target));
        await request(client.rpc('confirm_client_notice',{p_load:id,p_version:row.updated_at,p_channel:values.channel,p_notice_type:values.notice_type.trim()}));
        await refreshLoad(id);
      } catch(err) {error(err.message);} finally {button.disabled=false;}
    });
    for(const [formId,table] of [['comment','comments'],['incident','incidents']]) {
      document.querySelector(`#${formId}`)?.addEventListener('submit',async event=>{
        event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
        try {
          const values=Object.fromEntries([...new FormData(event.target)].map(([k,v])=>[k,v.trim()]));
          await request(client.from(table).insert({...values,load:id}));await refreshLoad(id);
        } catch(err) {error(err.message);} finally {button.disabled=false;}
      });
    }
    section.scrollIntoView({behavior:'smooth'});
  } catch(err) {if(current===generation && session) error(err.message);}
}
function editor(row={}) {
  activeLoad=null;
  const section=document.querySelector('#detail');
  const statusChoices=[...new Set([...statuses,row.status].filter(Boolean))];
  const inputs=Object.entries(fields).map(([field,label])=>{
    if(booleanFields.includes(field)) return `<label class="checkbox"><input type="checkbox" name="${field}" ${marked(row[field])?'checked':''}>${label}</label>`;
    if(field==='status') return `<label>${label}<select name="status">${statusChoices.map(status=>`<option ${status===(row.status || 'Cargando')?'selected':''}>${escape(status)}</option>`).join('')}</select></label>`;
    if(dateFields.includes(field)) return `<label>${label}<input type="datetime-local" name="${field}" value="${localDateInput(row[field])}"></label>`;
    return `<label>${label}<input name="${field}" value="${escape(row[field])}" ${field==='load'?`required ${row.load?'readonly':''}`:''} ${field==='tracking_link'?'type="url" maxlength="2000"':''}></label>`;
  }).join('');
  section.innerHTML=`<div class="card"><h2>${row.load?'Editar carga':'Nueva carga'}</h2><p>Las fechas se muestran en tu zona horaria: ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}. En tránsito se agenda una revisión cada tres horas.</p><form id="editor"><div class="grid">${inputs}</div><button>Guardar</button> <button type="button" id="cancel">Cancelar</button></form></div>`;
  const form=document.querySelector('#editor');
  const reminder=form.elements.recordatorio_fecha;
  const updateRequired=()=>{reminder.required=reminderStatuses.includes(form.elements.status.value);};
  form.elements.status.addEventListener('change',updateRequired);updateRequired();
  document.querySelector('#cancel').onclick=()=>{section.innerHTML='';};
  form.onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
    try {
      // Only send changes: preserve seconds in dates and text from imported records.
      const {values,changes:changed}=prepareLoadValues(Object.fromEntries(new FormData(form)),Object.fromEntries(booleanFields.map(field=>[field,form.elements[field].checked])),row);
      if(row.load) {
        if(Object.keys(changed).length) {
          const data=await request(client.from('loads').update(changed).eq('load',row.load).eq('updated_at',row.updated_at).select('load'));
          if(!data.length) throw Error('La carga cambió desde que la abriste. Actualiza y revisa los cambios antes de guardar.');
        }
      } else await request(client.from('loads').insert(values));
      await refreshLoad(values.load);
    } catch(err) {error(err.message);} finally {button.disabled=false;}
  };
  section.scrollIntoView({behavior:'smooth'});
}
if(!url || !key) {
  shell('<section class="card narrow"><h2>Conecta tu proyecto Supabase</h2><p>La conexión aún no está configurada. Sigue la guía README.md del repositorio para preparar el proyecto e iniciar el panel.</p></section>');
} else {
  try {
    client=createClient(url,key);
    const {data,error:err}=await client.auth.getSession();if(err)throw err;session=data.session;
    if(session) await dashboard();else login();
    client.auth.onAuthStateChange((event,newSession)=>{
      session=newSession;
      if(event==='SIGNED_OUT') {clearSession();login();}
    });
  } catch(err) {shell('<section class="card"><h2>No se pudo iniciar la conexión</h2></section>');error(err.message);}
}
