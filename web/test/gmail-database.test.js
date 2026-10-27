import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((n) => /^\d.*sql$/.test(n))
  .sort();
test("SQL 021: aislamiento, alcance, secretos y reserva persistente sin duplicados", async () => {
  const { db, asUser, rpc, people } = await createTestDatabase(files, {
    Ana: "admin",
    Luis: "csr",
    Cliente: "client",
  });
  const call = async (name, args) => (await rpc(name, args)).rows[0][name];
  try {
    await asUser("Ana");
    await db.exec("insert into loads(load,customer) values('GMAIL-A','ACME')");
    await asUser("Luis");
    await db.exec("insert into loads(load,customer) values('GMAIL-B','OTRO')");
    await assert.rejects(call("ops_gmail_context", ["GMAIL-A"]), /disponible/);
    await asUser("Ana");
    for (const url of [
      "javascript:alert(1)",
      "https://mail.google.com.evil/mail/u/0/#inbox/abc123",
      "https://mail.google.com/mail/u/0/#search/abc123",
    ])
      await assert.rejects(call("ops_gmail_link", ["GMAIL-A", url]), /liga/);
    await call("ops_gmail_link", [
      "GMAIL-A",
      "https://mail.google.com/mail/u/0/#inbox/abc123",
    ]);
    for (const table of [
      "gmail_connections",
      "gmail_oauth_states",
      "load_gmail_outbox",
      "load_gmail_threads",
    ])
      await assert.rejects(
        db.query(`select * from ${table}`),
        /permission denied/,
      );
    await db.exec("reset role");
    const p = {
      from: "ana@example.com",
      to: ["cliente@example.com"],
      cc: [],
      body: "Simulado",
      threadId: "abc123",
    };
    const add = async (fingerprint, expires = "2099-01-01") =>
      (
        await db.query(
          "insert into load_gmail_outbox(user_id,load,preview,fingerprint,expires_at) values($1,'GMAIL-A',$2,$3,$4) returning id",
          [people.Ana, p, fingerprint, expires],
        )
      ).rows[0].id;
    const id = await add("mismo-contenido");
    await assert.rejects(add("mismo-contenido"), /unique/);
    const expired = await add("vencido", "2000-01-01");
    await asUser("Ana");
    await assert.rejects(call("ops_gmail_claim", [expired]), /venció/);
    const first = await call("ops_gmail_claim", [id]),
      second = await call("ops_gmail_claim", [id]);
    assert.equal(first.claimed, true);
    assert.equal(second.claimed, false);
    assert.equal(second.item.state, "sending");
    await db.exec("reset role");
    await db.query(
      "update load_gmail_outbox set state='uncertain',claimed_at='2000-01-01' where id=$1",
      [id],
    );
    await asUser("Ana");
    assert.equal((await call("ops_gmail_claim", [id])).claimed, false);
    await call("ops_gmail_link", [
      "GMAIL-A",
      "https://mail.google.com/mail/u/0/#inbox/def456",
    ]);
    await db.exec("reset role");
    const changed = await add("hilo-anterior");
    await asUser("Ana");
    await assert.rejects(call("ops_gmail_claim", [changed]), /hilo cambió/);
    await asUser("Luis");
    await assert.rejects(call("ops_gmail_claim", [id]), /disponible/);
    await asUser("Cliente");
    await assert.rejects(call("ops_gmail_context", ["GMAIL-A"]));
    await asUser("anon");
    await assert.rejects(
      call("ops_gmail_context", ["GMAIL-A"]),
      /permission denied/,
    );
    await asUser("Ana");
    await db.exec("reset role");
    await db.query("delete from customer_assignments where owner_id=$1", [
      people.Ana,
    ]);
    await asUser("Ana");
    await assert.rejects(call("ops_gmail_claim", [id]), /disponible/);
  } finally {
    await db.close();
  }
});
