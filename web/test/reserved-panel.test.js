import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { createReservedLoadsPanel } from '../src/features/reserved-loads/panel.js';

const settle = async () => { await setImmediate(); await setImmediate(); };

test('apartados: crear desde Cerrados, liberar y reabrir muestran el registro en su filtro', async () => {
  const window = new Window();
  const previousFormData = globalThis.FormData;
  globalThis.FormData = window.FormData;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const records = [];
  const errors = [];
  const service = {
    list: async () => records.map(record => ({ ...record })),
    get: async id => ({ ...records.find(record => record.id === id) }),
    history: async () => [],
    save: async values => {
      const record = { ...values, id: 'apartado-1', state: 'cruce', created_by: 'csr-1' };
      records.push(record);
      return { ...record };
    },
    changeState: async (record, state) => {
      const stored = records.find(item => item.id === record.id);
      stored.state = state;
      return { ...stored };
    },
  };
  const panel = createReservedLoadsPanel({
    container, service, loads: [], userId: 'csr-1', role: 'csr',
    onError: message => errors.push(message), onOpenLoad: () => {},
  });
  try {
    await panel.open();
    container.querySelector('[data-reserved-filter="closed"]').click();
    container.querySelector('#reserved-new').click();
    const form = container.querySelector('#reserved-editor');
    form.elements.load.value = 'APARTADO-001';
    form.elements.note.value = 'Viaje de regreso';
    form.requestSubmit();
    await settle();
    assert.deepEqual(errors, []);
    assert.match(container.querySelector('#reserved-rows').textContent, /APARTADO-001/);
    assert.equal(container.querySelector('[data-reserved-filter="active"]').getAttribute('aria-pressed'), 'true');
    let stateForm = container.querySelector('#reserved-state');
    stateForm.elements.state.value = 'liberado';
    stateForm.requestSubmit();
    await settle();
    assert.equal(container.querySelector('[data-reserved-filter="closed"]').getAttribute('aria-pressed'), 'true');
    assert.match(container.querySelector('#reserved-rows').textContent, /APARTADO-001/);
    assert.equal(container.querySelector('#reserved-edit'), null);
    assert.equal(container.querySelector('#reserved-review'), null);
    stateForm = container.querySelector('#reserved-state');
    assert.equal(stateForm.elements.state.value, 'cruce');
    stateForm.requestSubmit();
    await settle();
    assert.equal(container.querySelector('[data-reserved-filter="active"]').getAttribute('aria-pressed'), 'true');
    assert.ok(container.querySelector('#reserved-edit'));
    assert.deepEqual(errors, []);
  } finally {
    panel.dispose();
    globalThis.FormData = previousFormData;
    await window.happyDOM.close();
  }
});
