import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/** PostgreSQL real embebido con identidad Auth simulada; no conecta al proyecto del usuario. */
export async function createTestDatabase(migrations, roles) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      alter default privileges in schema public grant execute on functions to anon, authenticated;`);
    for (const file of migrations) {
      await db.exec(
        await readFile(
          new URL(`../../../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
    const people = {};
    for (const [index, [name, role]] of Object.entries(roles).entries()) {
      const id = `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`;
      people[name] = id;
      await db.query("insert into auth.users values ($1, '{}')", [id]);
      await db.query(
        "update profiles set role=$1,display_name=$2 where id=$3",
        [role, name, id],
      );
    }
    const asUser = async (name) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        people[name] || "",
      ]);
      await db.exec(`set role ${name === "anon" ? "anon" : "authenticated"}`);
    };
    const row = async (table, id) =>
      (
        await db.query(
          `select *,updated_at::text as version from ${table} where id=$1`,
          [id],
        )
      ).rows[0];
    // Los nombres de función/tablas proceden de las pruebas, nunca de formularios.
    const rpc = (name, values) =>
      db.query(
        `select * from ${name}(${values.map((_, index) => `$${index + 1}`).join(",")})`,
        values,
      );
    return { db, people, asUser, row, rpc };
  } catch (error) {
    await db.close();
    throw error;
  }
}
