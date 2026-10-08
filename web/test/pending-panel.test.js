import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { createPendingLoadsPanel } from '../src/features/pending-loads/panel.js';

// Espera las consultas simuladas que iniciaron los eventos del formulario.
async function settleScreen() {
  await setImmediate();
  await setImmediate();
}

test('una solicitud nueva aparece en Pendientes aunque se cree desde una pestaña de cerrados', async context => {
  const window = new Window();
  const originalFormData = globalThis.FormData;
  globalThis.FormData = window.FormData;
  window.HTMLElement.prototype.scrollIntoView = () => {};

  try {
    for (const initialState of ['linked', 'cancelled']) {
      await context.test(`crear desde ${initialState}`, async () => {
        const container = window.document.createElement('div');
        window.document.body.append(container);
        const records = [];
        const errors = [];
        const service = {
          list: async state => records.filter(record => record.state === state),
          get: async id => records.find(record => record.id === id),
          comments: async () => [],
          create: async values => {
            const record = { ...values, id: 'solicitud-1', created_by: 'operador-1', state: 'pending' };
            records.push(record);
            return record;
          },
        };
        const panel = createPendingLoadsPanel({
          container, service, loads: [], userId: 'operador-1', role: 'csr',
          onOpenLoad: () => {}, onError: message => errors.push(message),
        });

        try {
          await panel.open();
          container.querySelector(`[data-pending-state="${initialState}"]`).click();
          await settleScreen();
          container.querySelector('#pending-new').click();
          const form = container.querySelector('#pending-editor');
          form.elements.customer.value = 'Cliente nuevo';
          form.elements.note.value = 'Nota de prueba';
          form.requestSubmit();
          await settleScreen();

          assert.deepEqual(errors, []);
          assert.match(container.querySelector('#pending-rows').textContent, /Cliente nuevo/);
          assert.equal(container.querySelector('[data-pending-state="pending"]').getAttribute('aria-pressed'), 'true');
          assert.match(container.querySelector('#pending-detail').textContent, /Nota de prueba/);
          // La misma solicitud continúa visible después de volver a consultar la lista.
          container.querySelector('#pending-refresh').click();
          await settleScreen();
          assert.match(container.querySelector('#pending-rows').textContent, /Cliente nuevo/);
        } finally {
          panel.dispose();
          container.remove();
        }
      });
    }
  } finally {
    globalThis.FormData = originalFormData;
    await window.happyDOM.close();
  }
});
