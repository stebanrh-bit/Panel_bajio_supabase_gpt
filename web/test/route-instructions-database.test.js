import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((f) => /^\d.*sql$/.test(f))
  .sort();
test("instructivos y versión personal: conocimiento aprobado, condiciones, etapas, permisos y versiones", async (t) => {
  const { db, people, asUser, rpc } = await createTestDatabase(files, {
    Esteban: "admin",
    Ana: "csr",
    Luis: "csr",
    Gerencia: "manager",
    Cliente: "client",
  });
  const row = async (load = "A") =>
    (
      await db.query(
        "select *,updated_at::text as version from loads where load=$1",
        [load],
      )
    ).rows[0];
  const action = async (name, values = {}, load = "A", version) =>
    (
      await rpc("ops_load_instruction_action", [
        load,
        version ?? (await row(load)).version,
        name,
        values,
      ])
    ).rows[0];
  const values = {
    name: "Cliente A · Bajío Laredo",
    customer: "ACME",
    origin_city: "Monterrey",
    origin_state: "NL",
    dest_city: "Laredo",
    dest_state: "TX",
    flow: "export",
    state: "draft",
    steps: {
      origin: {
        action: "Confirmar documentos con planta",
        condition: "Confirmar autorización de salida",
        requires: ["bol"],
        on_issue: "Contactar al responsable de planta",
      },
      mx_yard: { action: "Confirmar recepción en patio", requires: [] },
      us_yard: { action: "Coordinar entrega de la unidad", requires: [] },
      destination: { action: "Confirmar recepción y POD", requires: [] },
    },
  };
  let template;
  const save = async (data, record = null, apply = false) =>
    (
      await rpc("ops_save_route_instruction", [
        record?.id || null,
        record?.updated_at || null,
        data,
        apply,
      ])
    ).rows[0];
  try {
    await asUser("Esteban");
    await db.exec(
      "insert into loads(load,customer,origin_city,origin_state,dest_city,dest_state,status) values('A','ACME','Monterrey','NL','Laredo','TX','Cargando')",
    );
    await t.test(
      "crear una carga asigna un cliente sin dueño y no requiere instrucciones inventadas",
      async () => {
        assert.equal(
          (
            await db.query(
              "select owner_id from customer_assignments where customer='ACME'",
            )
          ).rows[0].owner_id,
          people.Esteban,
        );
        assert.equal((await row()).instruction_context.state, "no_template");
      },
    );
    await t.test(
      "borradores no se aplican; publicar exige contenido y aplica a las cargas actuales sin plan",
      async () => {
        template = await save(values);
        assert.equal((await row()).instruction_template_id, null);
        await assert.rejects(
          save({ ...values, steps: {}, state: "approved" }, template),
          /al menos una/,
        );
        template = await save({ ...values, state: "approved" }, template, true);
        const load = await row();
        assert.equal(load.instruction_template_id, template.id);
        assert.equal(load.instruction_context.stage, "origin");
        assert.equal(load.instruction_context.state, "waiting");
        assert.deepEqual(load.instruction_context.missing, [
          "bol",
          "condition",
        ]);
        assert.ok(load.instruction_plan.approved_by);
      },
    );
    await t.test(
      "la condición exige confirmación y los documentos bloquean completar; todo es confirmado por servidor",
      async () => {
        await assert.rejects(action("complete"), /requisitos/);
        await action("condition");
        assert.equal((await row()).instruction_context.state, "waiting");
        await db.exec("update loads set bol='true' where load='A'");
        assert.equal((await row()).instruction_context.state, "ready");
        const stale = (await row()).version;
        await db.exec("update loads set trailer='T0132' where load='A'");
        await assert.rejects(action("complete", {}, "A", stale), /cambió/);
        const done = await action("complete");
        assert.equal(done.instruction_context.state, "completed");
        assert.equal(done.instruction_progress.completed_by, people.Esteban);
        await action("reopen");
        assert.equal((await row()).instruction_context.state, "ready");
      },
    );
    await t.test(
      "el estatus cambia de etapa; instrucciones anticipadas no fingen una llegada",
      async () => {
        await db.exec("update loads set status='En transito' where load='A'");
        let load = await row();
        assert.equal(load.instruction_context.stage, "mx_yard");
        assert.equal(load.instruction_context.mode, "next");
        await assert.rejects(action("complete"), /confirma la etapa/);
        await db.exec("update loads set status='En yarda MX' where load='A'");
        assert.equal((await row()).instruction_context.mode, "current");
        await db.exec("update loads set status='En Yarda US' where load='A'");
        assert.equal((await row()).instruction_context.stage, "us_yard");
        const event = (await row()).instruction_context.event_key;
        await db.exec("update loads set truck='1773' where load='A'");
        assert.equal((await row()).instruction_context.event_key, event);
        await db.exec("update loads set status='Descargando' where load='A'");
        assert.equal((await row()).instruction_context.stage, "destination");
      },
    );
    await t.test(
      "ediciones de plantilla conservan la versión por carga; excepción y cambios de ruta requieren revisión",
      async () => {
        await action("exception", {
          note: "Confirmar otro horario antes de entregar",
        });
        const before = await row();
        template = await save(
          {
            ...values,
            state: "approved",
            steps: {
              ...values.steps,
              destination: {
                action: "Nueva indicación aprobada",
                requires: [],
              },
            },
          },
          template,
          true,
        );
        assert.deepEqual(
          (await row()).instruction_plan,
          before.instruction_plan,
        );
        assert.equal(
          (await row()).instruction_exception,
          before.instruction_exception,
        );
        await action("apply");
        assert.equal(
          (await row()).instruction_context.action,
          "Nueva indicación aprobada",
        );
        assert.equal(
          (await row()).instruction_exception,
          before.instruction_exception,
        );
        await db.exec("update loads set dest_city='Dallas' where load='A'");
        assert.equal((await row()).instruction_context.state, "route_changed");
        await assert.rejects(action("apply"), /única instrucción/);
        await db.exec("update loads set dest_city='Laredo' where load='A'");
      },
    );
    await t.test(
      "la ruta general es alternativa y el cliente tiene prioridad al importar nuevas cargas",
      async () => {
        await save({
          ...values,
          name: "Ruta general",
          customer: "",
          state: "approved",
          steps: {
            origin: { action: "Procedimiento de ruta general", requires: [] },
          },
        });
        await db.exec(
          "insert into loads(load,customer,origin_city,origin_state,dest_city,dest_state,status) values('B','ACME','Monterrey','NL','Laredo','TX','Cargando'),('C','OTRO','Monterrey','NL','Laredo','TX','Cargando')",
        );
        assert.equal((await row("B")).instruction_template_id, template.id);
        assert.equal(
          (await row("C")).instruction_context.action,
          "Procedimiento de ruta general",
        );
      },
    );
    await t.test(
      "importación distingue Yarda USA, AA y Yarda MX después del cruce",
      async () => {
        await save({
          ...values,
          name: "Regreso de USA",
          customer: "ACME",
          origin_city: "Laredo",
          origin_state: "TX",
          dest_city: "Monterrey",
          dest_state: "NL",
          flow: "import",
          state: "approved",
          steps: {
            origin: { action: "Confirmar carga en USA" },
            transit: { action: "Monitorear llegada a patio USA" },
            us_yard: { action: "Coordinar entrada con AA" },
            customs: { action: "Confirmar liberación" },
            mx_yard: { action: "Coordinar tramo nacional" },
            destination: { action: "Confirmar recepción final" },
          },
        });
        await db.exec(
          "insert into loads(load,customer,origin_city,origin_state,dest_city,dest_state,status) values('IMP','ACME','Laredo','TX','Monterrey','NL','Cargando')",
        );
        for (const [status, stage] of [
          ["En transito", "transit"],
          ["En Yarda US", "us_yard"],
          ["En AA", "customs"],
          ["En yarda MX", "mx_yard"],
          ["Descargando", "destination"],
        ]) {
          await db.query("update loads set status=$1 where load='IMP'", [
            status,
          ]);
          assert.equal((await row("IMP")).instruction_context.stage, stage);
        }
      },
    );
    await t.test(
      "CSR propone sin aprobar; la versión actual solo muestra clientes propios y retira los portales",
      async () => {
        await asUser("Ana");
        assert.equal((await db.query("select load from loads")).rows.length, 0);
        await assert.rejects(
          rpc("ops_load_instruction_action", [
            "A",
            await asRootVersion(),
            "complete",
            {},
          ]),
          /no está disponible/,
        );
        const draft = await save({
          ...values,
          name: "Propuesta de Ana",
          state: "draft",
        });
        assert.equal(draft.created_by, people.Ana);
        await assert.rejects(
          save({ ...values, state: "approved" }, draft),
          /permiso/,
        );
        await db.exec(
          "insert into loads(load,customer,status) values('ANA','CLIENTE ANA','Cargando')",
        );
        assert.deepEqual(
          (await db.query("select load from loads")).rows.map((x) => x.load),
          ["ANA"],
        );
        for (const user of ["Gerencia", "Cliente", "anon"]) {
          await asUser(user);
          await assert.rejects(
            rpc("ops_loads_delta", [0, [], "", null, 500]),
            /interno|permission denied/,
          );
          await assert.rejects(
            rpc("ops_portal_loads", [0, 100]),
            /permission denied/,
          );
        }
        await asUser("Esteban");
        const delta = (await rpc("ops_loads_delta", [0, [], "", null, 500]))
          .rows[0].ops_loads_delta;
        assert.ok(!delta.items.some((x) => x.load === "ANA"));
        assert.ok(delta.items.some((x) => x.load === "A"));
        assert.ok(
          !Object.hasOwn(
            delta.items.find((x) => x.load === "A"),
            "instruction_plan",
          ),
        );
      },
    );
    await t.test(
      "aprobar un caso incorpora solo sus etapas, protege versiones y conserva la experiencia revisada",
      async () => {
        const current = (
          await db.query(
            "select *,updated_at::text as v from route_instruction_templates where id=$1",
            [template.id],
          )
        ).rows[0];
        const proposal = await save({
          ...values,
          name: "Caso resuelto de patio",
          state: "draft",
          source_load: "A",
          case_note: "Se confirmó la recepción por otra puerta",
          steps: {
            mx_yard: {
              action: "Confirmar puerta y persona que recibe en patio",
              requires: ["bol"],
            },
          },
        });
        const approval = {
          ...values,
          name: proposal.name,
          state: "approved",
          source_load: "A",
          case_note: proposal.case_note,
          steps: proposal.steps,
          merge_approved: true,
          merge_template_id: current.id,
          merge_version: current.v,
        };
        const oldLoad = await row();
        await assert.rejects(
          save(
            { ...approval, merge_version: "2020-01-01T00:00:00Z" },
            proposal,
          ),
          /cambió/,
        );
        const merged = await save(approval, proposal);
        assert.equal(merged.id, current.id);
        assert.deepEqual(merged.steps.origin, current.steps.origin);
        assert.deepEqual(merged.steps.destination, current.steps.destination);
        assert.equal(
          merged.steps.mx_yard.action,
          proposal.steps.mx_yard.action,
        );
        assert.equal(
          (
            await db.query(
              "select state from route_instruction_templates where id=$1",
              [proposal.id],
            )
          ).rows[0].state,
          "merged",
        );
        assert.deepEqual(
          (await row()).instruction_plan,
          oldLoad.instruction_plan,
        );
        template = merged;
      },
    );
    await t.test(
      "avisos manuales disponibles; envíos automáticos apagados y respaldo incluye la base de conocimiento",
      async () => {
        await db.exec("update loads set status='En Yarda US' where load='A'");
        assert.equal((await row()).client_notify_pending, "true");
        await db
          .exec(
            "update panel_settings set external_alerts_enabled=true,alert_channel='google_email' where singleton",
          )
          .catch(() => {});
        assert.equal(
          (await db.query("select external_alerts_enabled from panel_settings"))
            .rows[0].external_alerts_enabled,
          false,
        );
        assert.ok(
          (
            await rpc("ops_backup_manifest", [])
          ).rows[0].ops_backup_manifest.tables.includes(
            "route_instruction_templates",
          ),
        );
        assert.ok(
          (
            await db.query(
              "select count(*)::int as n from load_history where load='A'",
            )
          ).rows[0].n > 5,
        );
        await assert.rejects(
          db.exec(
            "update loads set instruction_exception='sin control' where load='A'",
          ),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
  async function asRootVersion() {
    return new Date().toISOString();
  }
});
