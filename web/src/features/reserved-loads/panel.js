import { escapeHtml as escape } from '../../ui/html.js';
import { localDateInput } from '../../load-rules.js';
import { stateLabels, stateActions, textFields, dateFields, isClosed, canManage, attentionFor, prepareReservedLoad } from './rules.js';

const eventLabels = { created: 'Apartado creado', edited: 'Datos editados', state_changed: 'Cambio de etapa', reviewed: 'Revisión registrada' };
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

/** Pantalla de apartados. Las escrituras y sus permisos se resuelven en Supabase. */
export function createReservedLoadsPanel({ container, service, loads, userId, role, people = [], onOpenLoad, onError }) {
  let mounted = true;
  let requestNumber = 0;
  let records = [];
  let filter = 'active';
  const canCreate = ['admin', 'csr'].includes(role);
  const editable = record => canManage(record, userId, role);
  const authorName = id => people.find(person => person.id === id)?.display_name
    || (id === userId ? 'Tú' : 'Integrante del equipo');

  /** Mantiene el formulario si falla una escritura; evita el doble clic al guardar. */
  async function perform(button, action) {
    button.disabled = true;
    try { await action(); }
    catch (error) { if (mounted) onError(error.message); }
    finally { button.disabled = false; }
  }

  async function open() {
    if (!mounted) return;
    const current = ++requestNumber;
    container.innerHTML = '<section class="card"><h2>Apartados</h2><p>Cargando…</p></section>';
    try {
      const result = await service.list();
      if (!mounted || current !== requestNumber) return;
      records = result;
      renderPage();
    } catch (error) {
      if (!mounted || current !== requestNumber) return;
      container.innerHTML = '<section class="card"><h2>Apartados</h2><button id="reserved-retry">Reintentar</button></section>';
      container.querySelector('#reserved-retry').onclick = open;
      onError(error.message);
    }
  }

  function renderPage() {
    container.innerHTML = `
      <section class="card">
        <div class="toolbar"><h2>Apartados para regreso cargado</h2>
          ${canCreate ? '<button id="reserved-new">Apartar carga</button>' : ''}
          <button id="reserved-refresh">Actualizar</button>
        </div>
        <p>Da seguimiento al viaje que quieres usar para regresar cargado, desde el cruce hasta la entrega.</p>
        <div class="filters">
          ${[['active', 'Activos'], ['attention', 'Por revisar'], ['closed', 'Cerrados'], ['all', 'Todos']].map(([key, label]) =>
            `<button data-reserved-filter="${key}">${label}</button>`).join('')}
        </div>
        <label>Buscar carga, operador o ruta<input id="reserved-search" type="search"></label>
        <div class="scroll"><table>
          <thead><tr><th>Carga</th><th>Operador / ruta</th><th>Etapa</th><th>Próxima revisión</th><th>Atención</th><th></th></tr></thead>
          <tbody id="reserved-rows"></tbody>
        </table></div>
      </section>
      <section id="reserved-detail"></section>
    `;
    container.querySelector('#reserved-new')?.addEventListener('click', () => editor());
    container.querySelector('#reserved-refresh').onclick = open;
    container.querySelector('#reserved-search').oninput = renderRows;
    container.querySelectorAll('[data-reserved-filter]').forEach(button => {
      button.onclick = () => { filter = button.dataset.reservedFilter; renderRows(); };
    });
    renderRows();
  }

  /** Reevalúa los vencimientos mientras esta pantalla permanezca abierta. */
  function renderRows() {
    if (!mounted || !container.querySelector('#reserved-rows')) return;
    const search = container.querySelector('#reserved-search').value.toLocaleLowerCase('es');
    const now = Date.now();
    const visible = records.filter(record => {
      if (filter === 'active' && isClosed(record)) return false;
      if (filter === 'closed' && !isClosed(record)) return false;
      if (filter === 'attention' && !attentionFor(record, now)) return false;
      return [record.load, record.csr_owner, record.origin, record.destination, record.own_load, record.note]
        .some(value => String(value).toLocaleLowerCase('es').includes(search));
    }).sort((left, right) => Number(Boolean(attentionFor(right, now))) - Number(Boolean(attentionFor(left, now))));

    container.querySelectorAll('[data-reserved-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.reservedFilter === filter));
    });
    container.querySelector('#reserved-rows').innerHTML = visible.map(record => `
      <tr><td>${escape(record.load)}</td><td>${escape(record.csr_owner)}<small class="block">${escape(record.origin)} → ${escape(record.destination)}</small></td>
        <td>${stateLabels[record.state]}</td><td>${escape(formatDate(record.next_review_at))}</td>
        <td>${attentionFor(record, now) ? `<span class="badge warn">${escape(attentionFor(record, now))}</span>` : isClosed(record) ? 'Cerrado' : 'En seguimiento'}</td>
        <td><button data-reserved-id="${escape(record.id)}">Abrir</button></td></tr>
    `).join('') || '<tr><td colspan="6">No hay apartados con este filtro.</td></tr>';
    container.querySelectorAll('[data-reserved-id]').forEach(button => {
      button.onclick = () => detail(button.dataset.reservedId);
    });
  }

  async function detail(id) {
    if (!mounted) return;
    const current = ++requestNumber;
    try {
      const [record, history] = await Promise.all([service.get(id), service.history(id)]);
      if (!mounted || current !== requestNumber) return;
      renderDetail(record, history);
    } catch (error) {
      if (mounted && current === requestNumber) onError(error.message);
    }
  }

  function renderDetail(record, history) {
    const section = container.querySelector('#reserved-detail');
    const localLoad = loads.find(load => load.load === record.load);
    section.innerHTML = `
      <div class="card">
        <div class="toolbar"><h2>Apartado ${escape(record.load)}</h2>
          ${editable(record) && !isClosed(record) ? '<button id="reserved-edit">Editar datos</button>' : ''}
        </div>
        <p><strong>${stateLabels[record.state]}</strong></p>
        <dl>${Object.entries({ ...textFields, ...dateFields, next_review_at: 'Próxima revisión', review_hours: 'Revisar cada (horas)' }).map(([field, label]) =>
          `<div><dt>${label}</dt><dd class="preserve-lines">${escape(field in dateFields || field === 'next_review_at' ? formatDate(record[field]) : record[field] || '—')}</dd></div>`).join('')}</dl>
        ${attentionFor(record) ? `<p class="badge warn">${escape(attentionFor(record))}</p>` : ''}
        ${localLoad ? `<p>En Cargas: ${escape(localLoad.status)} <button id="reserved-open-load">Abrir carga</button></p>` : ''}
        ${editable(record) ? `
          <form id="reserved-state">
            <div class="grid"><label>Siguiente etapa<select name="state">${stateActions[record.state].map(state =>
              `<option value="${state}">${isClosed(record) ? 'Reabrir: ' : ''}${stateLabels[state]}</option>`).join('')}</select></label>
              <label>Nota del cambio<input name="note" maxlength="500"></label></div>
            <button>Guardar cambio de etapa</button>
          </form>
          ${!isClosed(record) ? '<form id="reserved-review"><label>Nota de revisión<input name="note" maxlength="500"></label><button>Ya revisé</button></form>' : ''}
        ` : ''}
        <h3>Historial</h3><ul>${history.map(item => `<li>
          <strong>${eventLabels[item.event]}</strong>
          ${item.event === 'state_changed' ? `${stateLabels[item.before_data.state]} → ${stateLabels[item.after_data.state]}` : ''}
          <p class="preserve-lines">${escape(item.note)}</p><small>${escape(formatDate(item.changed_at))} · ${escape(authorName(item.actor))}</small>
        </li>`).join('') || '<li>Sin movimientos.</li>'}</ul>
      </div>
    `;
    section.querySelector('#reserved-edit')?.addEventListener('click', () => editor(record));
    section.querySelector('#reserved-open-load')?.addEventListener('click', () => onOpenLoad(record.load));
    section.querySelector('#reserved-state')?.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      perform(event.target.querySelector('button'), async () => {
        const saved = await service.changeState(record, values.state, values.note.trim());
        filter = isClosed(saved) ? 'closed' : 'active';
        await open();
        if (mounted) await detail(saved.id);
      });
    });
    section.querySelector('#reserved-review')?.addEventListener('submit', event => {
      event.preventDefault();
      const note = new FormData(event.target).get('note').trim();
      perform(event.target.querySelector('button'), async () => {
        const saved = await service.review(record, note);
        filter = 'active';
        await open();
        if (mounted) await detail(saved.id);
      });
    });
    section.scrollIntoView({ behavior: 'smooth' });
  }

  /** Alta y edición comparten validación; las fechas se muestran en la zona del navegador. */
  function editor(record = null) {
    if (!mounted) return;
    requestNumber++;
    const section = container.querySelector('#reserved-detail');
    section.innerHTML = `
      <div class="card"><h2>${record ? 'Editar apartado' : 'Apartar carga para regreso'}</h2>
        <p>Las fechas se muestran en tu zona horaria: ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}.</p>
        <form id="reserved-editor"><div class="grid">
          ${Object.entries(textFields).filter(([field]) => field !== 'note').map(([field, label]) => `<label>${label}
            <input name="${field}" maxlength="${field === 'load' ? 200 : 500}" ${field === 'load' ? 'required' : ''} value="${escape(record?.[field])}"></label>`).join('')}
          ${Object.entries(dateFields).map(([field, label]) => `<label>${label}<input name="${field}" type="datetime-local" value="${localDateInput(record?.[field])}"></label>`).join('')}
          <label>Revisar cada (horas)<input name="review_hours" type="number" min="0.5" max="48" step="0.5" required value="${escape(record?.review_hours || 3)}"></label>
        </div><label>Nota<textarea name="note" maxlength="500">${escape(record?.note)}</textarea></label>
          <p>La revisión se agenda para el cruce o la entrega si esa fecha está por llegar. Después se usa la frecuencia elegida.</p>
          <button>Guardar apartado</button><button type="button" id="reserved-back">Volver</button>
        </form>
      </div>
    `;
    section.querySelector('#reserved-back').onclick = () => record ? detail(record.id) : section.replaceChildren();
    section.querySelector('#reserved-editor').onsubmit = event => {
      event.preventDefault();
      perform(event.target.querySelector('button'), async () => {
        const values = prepareReservedLoad(Object.fromEntries(new FormData(event.target)), record || {});
        const saved = await service.save(values, record);
        filter = 'active';
        await open();
        if (mounted) await detail(saved.id);
      });
    };
    section.scrollIntoView({ behavior: 'smooth' });
  }

  const timer = setInterval(renderRows, 60000);
  function dispose() {
    mounted = false;
    requestNumber++;
    clearInterval(timer);
  }
  return { open, dispose };
}
