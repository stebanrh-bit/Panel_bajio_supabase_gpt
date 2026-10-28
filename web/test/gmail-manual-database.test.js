import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
import { gmailMethods } from "../src/original/gmail/api.js";
import { rehearseBackup } from "../../scripts/rehearse_backup.mjs";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((n) => /^\d.*sql$/.test(n) && n < "021")
  .sort();
/** SQL 020 es suficiente: no instala tablas Gmail ni utiliza servicios externos. */
test("Gmail manual: SQL 020, liga persistente, versión, permisos y confirmación sin duplicados", async () => {
  const { db, asUser, people } = await createTestDatabase(files, {
    Ana: "admin",
    Luis: "csr",
    Cliente: "client",
  });
  let identity = "Ana",
    epoch = 0;
  const queues = new Map();
  const ctx = {
    get epoch() {
      return epoch;
    },
    get profile() {
      return { id: people[identity] };
    },
    staff() {
      if (!["Ana", "Luis"].includes(identity)) throw Error("Sin permiso");
    },
    rows: async (table, filter) => {
      const conditions = [],
        params = [];
      const q = {
        eq(k, v) {
          params.push(v);
          conditions.push(`${k}=$${params.length}`);
          return q;
        },
        is(k, v) {
          assert.equal(v, null);
          conditions.push(`${k} is null`);
          return q;
        },
      };
      filter(q);
      return (
        await db.query(
          `select *,${table === "loads" || table === "load_document_links" ? "updated_at::text as updated_at," : ""} ${table === "communications" ? "created_at" : "load"} as sort_value from ${table} where ${conditions.join(" and ")} order by sort_value`,
          params,
        )
      ).rows;
    },
    rpc: async (name, args) => {
      const result = await db.query(
        `select * from ${name}(${Object.keys(args)
          .map((k, i) => `${k} => $${i + 1}`)
          .join(",")})`,
        Object.values(args),
      );
      return name === "ops_record_manual_notice" ? result.rows : result.rows[0];
    },
    saved: () => {},
    serial: (key, operation) => {
      const result = (queues.get(key) || Promise.resolve())
        .catch(() => {})
        .then(operation);
      queues.set(key, result);
      return result;
    },
  };
  const call = gmailMethods(ctx).gmailCarga;
  const load = "MANUAL-A",
    url =
      "https://mail.google.com/mail/u/0/popout?ver=ejemplo&search=inbox&th=%23thread-f:1870123456789012345&cvid=1";
  const values = {
    load,
    from: "ana@example.com",
    to: "cliente@example.com",
    cc: "cc@example.com",
    subject: "Re: MANUAL-A",
    body: "Mensaje simulado",
  };
  try {
    await asUser("Ana");
    await db.exec("insert into loads(load,customer) values('MANUAL-A','ACME')");
    assert.equal((await call("status", { load })).thread, null);
    await call("link", { load, url });
    assert.equal((await call("status", { load })).thread.url, url);
    const first = (await call("prepare", values)).item;
    const again = (await call("prepare", values)).item;
    assert.equal(first.id, again.id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from communications where notice_type='Gmail manual'",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(call("confirm", { load, id: first.id }), /Confirma/);
    const results = await Promise.all([
      call("confirm", { load, id: first.id, confirm: true }),
      call("confirm", { load, id: first.id, confirm: true }),
    ]);
    assert.ok(results.every((r) => r.item.state === "confirmed"));
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from communications where notice_type='Gmail manual'",
        )
      ).rows[0].n,
      1,
    );
    const row = (
      await db.query(
        "select * from communications where notice_type='Gmail manual'",
      )
    ).rows[0];
    assert.equal(row.channel, "Correo");
    assert.equal(row.actor, people.Ana);
    assert.match(row.manual_message, /Remitente: ana@example.com/);
    const refreshed = gmailMethods(ctx).gmailCarga;
    assert.equal((await refreshed("prepare", values)).item.state, "confirmed");
    assert.equal((await refreshed("status", { load })).items.length, 1);
    const stale = (await call("prepare", { ...values, body: "Otro mensaje" }))
      .item;
    await db.exec(
      "update loads set status='Descargando' where load='MANUAL-A'",
    );
    await assert.rejects(
      call("confirm", { load, id: stale.id, confirm: true }),
      /cambió/,
    );
    await assert.rejects(
      call("send", { load, id: first.id, confirm: true }),
      /modo manual/,
    );
    const manifest = (await db.query("select ops_backup_manifest() as data"))
      .rows[0].data;
    const backup = { format: manifest.format, tables: {}, counts: {} };
    for (const table of manifest.tables) {
      backup.tables[table] = (
        await db.query("select * from ops_backup_page($1,0,500)", [table])
      ).rows.map((row) => row.ops_backup_page);
      backup.counts[table] = backup.tables[table].length;
    }
    const restored = await rehearseBackup(backup);
    assert.equal(restored.ok, true);
    assert.equal(restored.tables.communications, backup.counts.communications);
    assert.equal(restored.tables.load_document_links, 1);
    identity = "Luis";
    epoch++;
    await asUser("Luis");
    await assert.rejects(call("status", { load }), /disponible/);
    identity = "Cliente";
    epoch++;
    await asUser("Cliente");
    await assert.rejects(call("status", { load }), /permiso/);
  } finally {
    await db.close();
  }
});
