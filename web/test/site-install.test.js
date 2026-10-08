import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './helpers/database.js';

test('instalación conjunta: un error revierte todo; repetir conserva datos y permisos',async()=> {
  const {db,asUser,rpc}=await createTestDatabase(['001_panel.sql','002_load_operations.sql','003_pending_loads.sql'],{admin:'admin',csr:'csr'});
  const sql=await readFile(new URL('../../supabase/actualizar_sitio.sql',import.meta.url),'utf8');
  try {
    await db.exec("insert into loads(load,customer) values('CONSERVAR','ACME')");
    const failed=sql.replace(/\ncommit;\s*$/,()=>"\ndo $$ begin raise exception 'FALLO SIMULADO AL FINAL'; end; $$;\ncommit;");
    await assert.rejects(db.exec(failed),/FALLO SIMULADO/);await db.exec('rollback;');
    assert.equal((await db.query("select to_regclass('public.reserved_loads') as relation")).rows[0].relation,null);
    assert.equal((await db.query("select to_regclass('public.geo_places') as relation")).rows[0].relation,null);
    assert.equal((await db.query('select * from loads')).rows[0].load,'CONSERVAR');
    await db.exec(sql);
    await asUser('csr');await rpc('ops_save_closure',['Cierre conservado']);
    await rpc('ops_save_place',['Laredo, TX',27.5,-99.4]);
    await db.exec('reset role');await db.exec(sql);
    await asUser('csr');
    assert.equal((await db.query('select * from shift_closures')).rows.length,1);
    assert.equal((await db.query('select * from geo_places')).rows.length,1);
    const load=(await db.query("select * from loads where load='CONSERVAR'")).rows[0];
    await rpc('confirm_client_notice',[load.load,load.updated_at,'Correo','Prueba conjunta']);
    await assert.rejects(db.exec("update loads set client_notified_at='false' where load='CONSERVAR'"),/permission denied/);
    await assert.rejects(rpc('ops_merge_import',['{}','{}']),/permission denied/);
    await asUser('admin');
    assert.equal((await rpc('ops_backup_page',['shift_closures',0,500])).rows.length,1);
  } finally {await db.close();}
});
