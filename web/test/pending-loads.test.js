import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { canEditPendingLoad, matchingLoads, preparePendingLoad } from '../src/features/pending-loads/rules.js';
import { escapeHtml } from '../src/ui/html.js';

test('formularios: fechas reales, cliente obligatorio y campos controlados por la base', () => {
  assert.deepEqual(preparePendingLoad({ customer: ' ACME ', note: ' Llamar ', state: 'linked', created_by: 'otro' }), {
    customer: 'ACME', origin: '', destination: '', estimated_date: null, note: 'Llamar',
  });
  assert.equal(preparePendingLoad({ customer: 'ACME', estimated_date: '2028-02-29' }).estimated_date, '2028-02-29');
  for (const date of ['2026-02-29', '2026-13-01', '2026-10-08T10:00', '0000-01-01']) {
    assert.throws(() => preparePendingLoad({ customer: 'ACME', estimated_date: date }), /fecha/);
  }
  assert.throws(() => preparePendingLoad({ customer: '  ' }), /cliente/);
  assert.throws(() => preparePendingLoad({ customer: 'ACME', note: 'x'.repeat(9501) }), /nota/);
  assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});

test('interfaz: solo cargas activas del mismo cliente y solicitudes abiertas con permiso', () => {
  const record = { customer: ' ACME   Bajío ', created_by: 'csr-1', state: 'pending' };
  assert.deepEqual(matchingLoads(record, [
    { load: '1', customer: 'acme bajío', archived: false },
    { load: '2', customer: 'ACME BAJÍO', archived: true },
    { load: '3', customer: 'Otro cliente', archived: false },
  ]).map(load => load.load), ['1']);
  assert.equal(canEditPendingLoad(record, 'csr-1', 'csr'), true);
  assert.equal(canEditPendingLoad(record, 'csr-2', 'csr'), false);
  assert.equal(canEditPendingLoad(record, 'gerente', 'manager'), false);
  assert.equal(canEditPendingLoad(record, 'admin', 'admin'), true);
  assert.equal(canEditPendingLoad({ ...record, state: 'linked' }, 'admin', 'admin'), false);
});

test('SQL 003: permisos, versiones, conservación de comentarios y transacciones', async context => {
  const db = new PGlite();
  const ids = {
    csr: '00000000-0000-0000-0000-000000000001',
    other: '00000000-0000-0000-0000-000000000002',
    manager: '00000000-0000-0000-0000-000000000003',
    admin: '00000000-0000-0000-0000-000000000004',
    pending: '00000000-0000-0000-0000-000000000005',
  };
  const migration = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
  const asUser = async user => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[user] || '']);
    await db.exec(`set role ${user === 'anon' ? 'anon' : 'authenticated'}`);
  };
  const get = async id => (await db.query('select *, updated_at::text as version, created_at::text as created from pending_loads where id = $1', [id])).rows[0];
  const create = async (customer = 'ACME', note = 'Nota inicial') => {
    const result = await db.query('insert into pending_loads(customer,note) values ($1,$2) returning id', [customer, note]);
    return get(result.rows[0].id);
  };
  const link = record => db.query('select link_pending_load($1,$2,$3)', [record.id, 'P-1', record.version]);

  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      -- Representa los permisos por defecto de Supabase para las nuevas funciones.
      alter default privileges in schema public grant execute on functions to anon, authenticated;
    `);
    for (const file of ['001_panel.sql', '002_load_operations.sql', '003_pending_loads.sql']) {
      await db.exec(await migration(file));
    }
    for (const [name, id] of Object.entries(ids)) {
      await db.query("insert into auth.users values ($1, '{}')", [id]);
      await db.query('update profiles set role = $1 where id = $2', [name === 'other' ? 'csr' : name, id]);
    }

    let original;
    await context.test('RLS restringe lectura, edición, autor y campos de cierre', async () => {
      await asUser('csr');
      original = await create(' ACME  Bajío ');
      await db.query('insert into pending_load_comments(pending_id,body) values ($1,$2)', [original.id, 'Comentario original']);
      assert.equal((await db.query('select count(*)::int as count from pending_load_history')).rows[0].count, 1);
      await assert.rejects(db.query('update pending_loads set created_by = $1 where id = $2', [ids.other, original.id]), /permission denied/);
      await assert.rejects(db.query("update pending_loads set state = 'cancelled' where id = $1", [original.id]), /permission denied/);
      await assert.rejects(db.query('insert into pending_loads(customer,created_by) values ($1,$2)', ['Falso autor', ids.other]), /row-level security/);
      await assert.rejects(db.query('insert into pending_load_comments(pending_id,body,created_by) values ($1,$2,$3)', [original.id, 'Falso autor', ids.other]), /row-level security/);
      await assert.rejects(db.query('delete from pending_loads where id = $1', [original.id]), /permission denied/);
      await asUser('other');
      assert.equal(await get(original.id), undefined);
      assert.equal((await db.query('select * from pending_load_comments')).rows.length, 0);
      assert.equal((await db.query('select * from pending_load_history')).rows.length, 0);
      await assert.rejects(link(original), /sin permiso/);
      await assert.rejects(db.query('select cancel_pending_load($1,$2)', [original.id, original.version]), /sin permiso/);
      await asUser('manager');
      assert.ok(await get(original.id));
      assert.equal((await db.query('select * from pending_load_comments')).rows.length, 1);
      await assert.rejects(create(), /row-level security/);
      await assert.rejects(link(original), /permiso/);
      await assert.rejects(db.query('select cancel_pending_load($1,$2)', [original.id, original.version]), /permiso/);
      await asUser('pending');
      assert.equal((await db.query('select * from pending_loads')).rows.length, 0);
      await assert.rejects(link(original), /permiso/);
      await asUser('anon');
      await assert.rejects(db.query('select * from pending_loads'), /permission denied/);
      // Detecta también concesiones directas a anon, además del permiso heredado de PUBLIC.
      await assert.rejects(link(original), /permission denied for function/);
      await assert.rejects(db.query('select cancel_pending_load($1,$2)', [original.id, original.version]), /permission denied for function/);
    });

    await context.test('vincular conserva nota, autores y fechas sin duplicar comentarios', async () => {
      await asUser('csr');
      await db.exec("insert into loads(load,customer,status) values ('P-1','acme bajío','En transito'),('P-2','Otro cliente','Cargando'),('P-3','ACME Bajío','Cargando'); update loads set archived = true where load = 'P-3'");
      await assert.rejects(db.query('select link_pending_load($1,$2,$3)', [original.id, 'P-2', original.version]), /mismo cliente/);
      await assert.rejects(db.query('select link_pending_load($1,$2,$3)', [original.id, 'P-3', original.version]), /activa/);
      await assert.rejects(db.query('select link_pending_load($1,$2,$3)', [original.id, 'NO-EXISTE', original.version]), /activa/);
      const comment = (await db.query('select *,created_at::text as created from pending_load_comments where pending_id = $1', [original.id])).rows[0];
      await asUser('admin');
      await link(original);
      const linked = await get(original.id);
      assert.equal(linked.state, 'linked');
      assert.equal(linked.linked_by, ids.admin);
      assert.equal(linked.created_by, ids.csr);
      const comments = (await db.query("select *,created_at::text as created from comments where load = 'P-1'")).rows;
      assert.equal(comments.length, 3);
      const note = comments.find(item => item.body === 'Nota del pendiente: Nota inicial');
      assert.equal(note.created_by, ids.csr);
      assert.equal(note.created, original.created);
      const copied = comments.find(item => item.body === comment.body);
      assert.equal(copied.created_by, comment.created_by);
      assert.equal(copied.created, comment.created);
      assert.equal(comments.find(item => item.body.startsWith('Vinculado')).created_by, ids.admin);
      await assert.rejects(link(original), /cambió/);
      assert.equal((await db.query("select * from comments where load = 'P-1'")).rows.length, 3);
      await assert.rejects(db.query('insert into pending_load_comments(pending_id,body) values ($1,$2)', [original.id, 'Demasiado tarde']), /cerrada/);
      assert.ok(Date.parse((await db.query("select recordatorio_fecha from loads where load = 'P-1'")).rows[0].recordatorio_fecha) > Date.now() + 2.9 * 3600000);
      assert.equal((await db.query('select * from pending_load_history where pending_id = $1', [original.id])).rows.length, 2);
    });

    await context.test('versiones antiguas se rechazan y cancelar conserva el expediente', async () => {
      await asUser('csr');
      const record = await create();
      await db.query('insert into pending_load_comments(pending_id,body) values ($1,$2)', [record.id, 'Conservar']);
      await db.query('update pending_loads set note = $1 where id = $2', ['Nota actualizada', record.id]);
      const changed = await get(record.id);
      assert.notEqual(record.version, changed.version);
      await assert.rejects(db.query('select cancel_pending_load($1,$2)', [record.id, record.version]), /cambió/);
      await assert.rejects(link(record), /cambió/);
      assert.equal((await db.query('update pending_loads set note = $1 where id = $2 and updated_at = $3 returning id', ['No sobrescribir', record.id, record.version])).rows.length, 0);
      await db.query('select cancel_pending_load($1,$2)', [changed.id, changed.version]);
      assert.equal((await get(record.id)).state, 'cancelled');
      assert.equal((await get(record.id)).note, 'Nota actualizada');
      assert.equal((await db.query('select * from pending_load_comments where pending_id = $1', [record.id])).rows.length, 1);
      assert.equal((await db.query('select * from pending_load_history where pending_id = $1', [record.id])).rows.length, 3);
      assert.equal((await db.query('update pending_loads set note = $1 where id = $2 returning id', ['No editar cerrada', record.id])).rows.length, 0);
    });

    await context.test('un fallo durante la copia revierte el vínculo y todos sus efectos', async () => {
      await asUser('csr');
      const record = await create('ACME Bajío');
      await db.query('insert into pending_load_comments(pending_id,body) values ($1,$2)', [record.id, 'FALLO SIMULADO']);
      const loadVersion = (await db.query("select updated_at::text as version from loads where load = 'P-1'")).rows[0].version;
      await db.exec(`reset role;
        create function reject_test_comment() returns trigger language plpgsql as $$ begin
          if new.body = 'FALLO SIMULADO' then raise exception 'Error de copia simulado'; end if;
          return new; end $$;
        create trigger reject_test_comment before insert on comments for each row execute function reject_test_comment();`);
      await asUser('csr');
      await assert.rejects(link(record), /Error de copia simulado/);
      assert.equal((await get(record.id)).state, 'pending');
      assert.equal((await db.query("select * from comments where load = 'P-1'")).rows.length, 3);
      assert.equal((await db.query('select * from pending_load_history where pending_id = $1', [record.id])).rows.length, 1);
      assert.equal((await db.query("select updated_at::text as version from loads where load = 'P-1'")).rows[0].version, loadVersion);
      await db.exec('reset role; drop trigger reject_test_comment on comments; drop function reject_test_comment()');
      const count = (await db.query('select count(*)::int as count from pending_loads')).rows[0].count;
      await db.exec(await migration('003_pending_loads.sql'));
      assert.equal((await db.query('select count(*)::int as count from pending_loads')).rows[0].count, count);
      await asUser('anon');
      await assert.rejects(link(record), /permission denied for function/);
    });
  } finally {
    await db.close();
  }
});
