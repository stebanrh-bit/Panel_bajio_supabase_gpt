import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

test("Supabase rechaza categorías vacías incluso si faltaba la restricción inicial, sin borrar incidencias previas", async () => {
  const { db, asUser } = await createTestDatabase(["001_panel.sql"], {
    admin: "admin",
    csr: "csr",
  });
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/008_incident_category_validation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  try {
    // Simula una instalación inicial incompleta, sin atribuir ese estado al proyecto real.
    await db.exec(
      "alter table incidents drop constraint incidents_category_check; alter table incidents alter column category drop not null;",
    );
    await asUser("admin");
    await db.exec(
      "insert into loads(load) values('INC-1'); insert into incidents(load,category,severity,description) values('INC-1','','media','Registro anterior')",
    );
    await db.exec("reset role");
    await db.exec(sql);
    await asUser("csr");
    for (const category of [
      "",
      "   ",
      "\t\n",
      "\u00a0",
      null,
      "X".repeat(101),
    ]) {
      await assert.rejects(
        db.query(
          "insert into incidents(load,category,severity,description) values('INC-1',$1,'alta','Descripción válida')",
          [category],
        ),
        (error) =>
          error.code === "23514" &&
          error.message.includes("incidents_category_required_check"),
      );
    }
    assert.equal((await db.query("select * from incidents")).rows.length, 1);
    await db.exec(
      "insert into incidents(load,category,severity,description) values('INC-1','Documentación','baja','Descripción válida')",
    );
    await db.exec("reset role");
    await db.exec(sql);
    await asUser("admin");
    assert.equal((await db.query("select * from incidents")).rows.length, 2);
  } finally {
    await db.close();
  }
});
