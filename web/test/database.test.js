import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('schema: default-deny, role permissions, author protection and audit', async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    const existing='00000000-0000-0000-0000-000000000004';
    await db.exec(`insert into auth.users values ('${existing}','{"display_name":"Cuenta existente","role":"admin"}')`);
    await db.exec(await readFile(new URL('../../supabase/migrations/001_panel.sql',import.meta.url),'utf8'));
    const existingProfile=(await db.query('select * from profiles where id=$1',[existing])).rows[0];
    assert.equal(existingProfile.display_name,'Cuenta existente');
    assert.equal(existingProfile.role,'pending');
    const csr='00000000-0000-0000-0000-000000000001', manager='00000000-0000-0000-0000-000000000002', pending='00000000-0000-0000-0000-000000000003';
    await db.exec(`insert into auth.users values ('${csr}','{"role":"admin"}'),('${manager}','{}'),('${pending}','{}');`);
    assert.equal((await db.query('select role from profiles order by id')).rows[0].role,'pending','metadata cannot assign privileges');
    await db.exec(`update profiles set role='csr' where id='${csr}';update profiles set role='manager' where id='${manager}';`);
    const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    await asUser(csr);
    await db.exec("insert into loads(load,customer,status) values ('L-1','Cliente','Cargando')");
    await db.exec("update loads set status='En transito' where load='L-1'");
    assert.equal((await db.query('select * from load_history')).rows.length,2);
    await db.exec("insert into comments(load,body) values ('L-1','Seguimiento confirmado')");
    await db.exec("insert into incidents(load,category,severity,description) values ('L-1','Demora','alta','Tráfico')");
    await assert.rejects(db.exec(`insert into comments(load,body,created_by) values ('L-1','Falso','${manager}')`));
    await assert.rejects(db.exec("update profiles set role='admin'"));
    await assert.rejects(db.exec("delete from loads where load='L-1'"));
    await asUser(manager);
    assert.equal((await db.query('select * from loads')).rows.length,1);
    await assert.rejects(db.exec("insert into loads(load) values ('L-2')"));
    await db.exec("update loads set status='Hack' where load='L-1'");
    assert.equal((await db.query('select status from loads')).rows[0].status,'En transito');
    await asUser(pending);
    assert.equal((await db.query('select * from loads')).rows.length,0);
    assert.equal((await db.query('select * from comments')).rows.length,0);
    await assert.rejects(db.exec("insert into loads(load) values ('L-3')"));
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from loads'));
  } finally { await db.close(); }
});
