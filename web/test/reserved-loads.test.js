import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { attentionFor, prepareReservedLoad, stateActions } from '../src/features/reserved-loads/rules.js';
import { localDateInput } from '../src/load-rules.js';

test('apartados: validación, fechas intactas y alertas que desaparecen al cerrar', () => {
  assert.throws(() => prepareReservedLoad({}), /número/);
  for (const review_hours of [0, 0.4, 49, 'abc', '']) {
    assert.throws(() => prepareReservedLoad({ load: 'A-1', review_hours }), /frecuencia/);
  }
  assert.throws(() => prepareReservedLoad({ load: 'A-1', crossing_at: '2026-02-30T12:00' }), /fecha/);
  const previous = { crossing_at: '2035-01-01T12:00:47.123Z' };
  const values = prepareReservedLoad({ load: ' A-1 ', crossing_at: localDateInput(previous.crossing_at) }, previous);
  assert.equal(values.crossing_at, previous.crossing_at);
  assert.equal(values.delivery_at, null);
  assert.equal(values.load, 'A-1');
  const now = Date.parse('2026-10-08T18:00:00Z');
  const record = { state: 'cruce', own_load_at: '2026-10-09T18:00:00Z' };
  assert.match(attentionFor(record, now), /24 horas/);
  assert.equal(attentionFor({ ...record, state: 'usado' }, now), '');
  assert.equal(attentionFor({ state: 'broker', next_review_at: '2026-10-08T17:59:00Z' }, now), 'Toca revisar este apartado.');
  assert.deepEqual(stateActions.liberado, ['cruce']);
});

test('SQL 004: agenda, permisos, historial, etapas y versiones', async context => {
  const db = new PGlite();
  const people = {
    csr: '00000000-0000-0000-0000-000000000001', other: '00000000-0000-0000-0000-000000000002',
    admin: '00000000-0000-0000-0000-000000000003', manager: '00000000-0000-0000-0000-000000000004',
    pending: '00000000-0000-0000-0000-000000000005',
  };
  const migration = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
  const asUser = async name => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [people[name] || '']);
    await db.exec(`set role ${name === 'anon' ? 'anon' : 'authenticated'}`);
  };
  const get = async id => (await db.query('select *,updated_at::text as version from reserved_loads where id=$1', [id])).rows[0];
  const save = async (values, previous = null) => {
    const result = await db.query('select * from save_reserved_load($1::jsonb,$2,$3)', [JSON.stringify(values), previous?.id || null, previous?.version || null]);
    return get(result.rows[0].id);
  };
  const change = async (record, state, note = '') => {
    await db.query('select * from change_reserved_load_state($1,$2,$3,$4)', [record.id, record.version, state, note]);
    return get(record.id);
  };

  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    for (const name of ['001_panel.sql', '002_load_operations.sql', '003_pending_loads.sql', '004_reserved_loads.sql']) {
      await db.exec(await migration(name));
    }
    for (const [name, id] of Object.entries(people)) {
      await db.query("insert into auth.users values($1,'{}')", [id]);
      await db.query('update profiles set role=$1 where id=$2', [name === 'other' ? 'csr' : name, id]);
    }

    let record;
    const futureCrossing = new Date(Date.now() + 48 * 3600000).toISOString();
    const futureDelivery = new Date(Date.now() + 72 * 3600000).toISOString();
    const fields = { load: 'A-1', crossing_at: futureCrossing, delivery_at: futureDelivery, review_hours: 3 };

    await context.test('alta con autor real, calendario original e historial atómico', async () => {
      await asUser('csr');
      record = await save({ ...fields, state: 'usado', created_by: people.other, next_review_at: '2000-01-01T00:00:00Z' });
      assert.equal(record.created_by, people.csr);
      assert.equal(record.state, 'cruce');
      assert.equal(new Date(record.next_review_at).toISOString(), futureCrossing);
      const history = (await db.query('select * from reserved_load_history where reserved_id=$1', [record.id])).rows;
      assert.equal(history.length, 1);
      assert.equal(history[0].event, 'created');
      assert.equal(history[0].actor, people.csr);
      await assert.rejects(save({ ...fields, crossing_at: '2026-10-09T12:00' }), /zona horaria/);
      await assert.rejects(save({ ...fields, review_hours: 0.4 }), /check constraint/);
      await assert.rejects(db.query('update reserved_loads set state=$1 where id=$2', ['usado', record.id]), /permission denied/);
      await assert.rejects(db.query('insert into reserved_load_history(reserved_id,event,actor,after_data) values($1,$2,$3,$4)', [record.id, 'reviewed', people.csr, '{}']), /permission denied/);
    });

    await context.test('etapas, revisión, cierre, reapertura y protección contra sobrescritura', async () => {
      await asUser('csr');
      await assert.rejects(change(record, 'usado'), /no está permitido/);
      const old = record;
      record = await change(record, 'transito', 'Cruce confirmado');
      assert.equal(new Date(record.next_review_at).toISOString(), futureDelivery);
      await assert.rejects(change(old, 'broker'), /cambió/);
      await assert.rejects(save(fields, old), /cambió/);
      await db.query('select * from review_reserved_load($1,$2,$3)', [record.id, record.version, 'Consulté la entrega']);
      record = await get(record.id);
      assert.equal(new Date(record.next_review_at).toISOString(), futureDelivery);
      const beforeFailure = record;
      await assert.rejects(change(record, 'broker', 'x'.repeat(501)), /check constraint/);
      assert.equal((await get(record.id)).version, beforeFailure.version);
      assert.equal((await get(record.id)).state, 'transito');
      record = await change(record, 'broker');
      assert.ok(Date.parse(record.next_review_at) > Date.now() + 2.9 * 3600000);
      record = await change(record, 'usado');
      assert.equal(record.next_review_at, null);
      await assert.rejects(save(fields, record), /Reabre/);
      await assert.rejects(db.query('select * from review_reserved_load($1,$2)', [record.id, record.version]), /cerrado/);
      record = await change(record, 'cruce');
      assert.equal(new Date(record.next_review_at).toISOString(), futureCrossing);
      record = await change(record, 'liberado');
      assert.equal(record.next_review_at, null);
      const history = (await db.query('select * from reserved_load_history where reserved_id=$1', [record.id])).rows;
      assert.equal(history.length, 7);
      assert.ok(history.some(item => item.note === 'Consulté la entrega'));
    });

    await context.test('otros roles, funciones privadas y migración repetible', async () => {
      await asUser('other');
      assert.equal(await get(record.id), undefined);
      assert.equal((await db.query('select * from reserved_load_history')).rows.length, 0);
      await assert.rejects(change(record, 'cruce'), /sin permiso/);
      await asUser('manager');
      assert.ok(await get(record.id));
      await assert.rejects(save(fields), /permiso/);
      await assert.rejects(change(record, 'cruce'), /permiso/);
      await asUser('pending');
      assert.equal(await get(record.id), undefined);
      await assert.rejects(save(fields), /permiso/);
      await asUser('anon');
      await assert.rejects(save(fields), /permission denied for function/);
      await assert.rejects(db.query('select * from lock_reserved_load($1,$2)', [record.id, record.version]), /permission denied for function/);
      await db.exec('reset role');
      await db.exec(await migration('004_reserved_loads.sql'));
      await asUser('admin');
      record = await change(await get(record.id), 'cruce');
      record = await save({ ...fields, origin: 'León' }, record);
      assert.equal(record.created_by, people.csr);
      assert.equal(record.updated_by, people.admin);
      assert.equal(record.origin, 'León');
    });
  } finally { await db.close(); }
});
