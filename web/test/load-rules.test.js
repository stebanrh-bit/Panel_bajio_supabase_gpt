import {test} from 'node:test';
import assert from 'node:assert/strict';
import {marked,stageIndex,alertFor,attentionFor,validateLoad,toISO,localDateInput,historyDiff,prepareLoadValues,dateFields,booleanFields} from '../src/load-rules.js';
const now=Date.parse('2026-10-08T12:00:00Z');
const hours=n=>new Date(now+n*3600000).toISOString();
test('legacy boolean strings do not prematurely complete a load',()=>{
  for(const value of [false,'false','FALSE','0','','no']) assert.equal(marked(value),false);
  assert.equal(stageIndex({pod_sent:'false',doda:'false'}),0);
  assert.equal(stageIndex({pod_sent:'true'}),9);
  assert.equal(stageIndex({status:'En transito',pod_sent:'false'}),6);
  assert.equal(stageIndex({doda:'true',pickup_actual:hours(-2)}),2);
  assert.equal(stageIndex({status:'DELIVERED'}),9);
});
test('operational alert priority matches original thresholds',()=>{
  assert.equal(alertFor({delivery_appt:hours(-2)},now).level,'critical');
  assert.equal(alertFor({delivery_appt:hours(24)},now).level,'critical');
  assert.equal(alertFor({status:'Cruzando',updated_at:hours(-4)},now).level,'warn');
  assert.equal(alertFor({status:'En transito',delivery_appt:hours(6)},now).level,'warn');
  assert.equal(alertFor({status:'EN PLANTA',delivery_appt:hours(6)},now).level,'good');
  assert.equal(alertFor({status:'DELIVERED',delivery_appt:hours(-2)},now).level,'good');
});
test('reviews, crossing confirmations and completion stay distinct',()=>{
  assert.match(attentionFor({status:'En transito'},now),/revisar/);
  assert.equal(attentionFor({status:'En transito',recordatorio_fecha:hours(1)},now),'');
  assert.match(attentionFor({status:'Cargando',next_review_at:hours(-1)},now),/próxima/);
  assert.match(attentionFor({cruce_usa_fecha:hours(-1),cruce_confirmado:'false'},now),/Confirma/);
  assert.equal(attentionFor({cruce_usa_fecha:hours(-1),cruce_confirmado:'true'},now),'');
  assert.match(attentionFor({status:'DELIVERED',pod_sent:'false'},now),/POD/);
  assert.equal(attentionFor({status:'DELIVERED',pod_sent:'true'},now),'');
  assert.equal(attentionFor({status:'TONU',recargos_vg:'true',next_review_at:hours(-1)},now),'');
});
test('dates retain their instant and reminders and tracking are validated',()=>{
  assert.equal(toISO('2026-10-08T06:00:00-06:00'),hours(0));
  assert.equal(toISO(localDateInput(hours(0))),hours(0));
  assert.throws(()=>validateLoad({load:'L1',status:'Patio permisionario'}),/recordatorio/);
  assert.throws(()=>validateLoad({load:'L1',tracking_link:'javascript:alert(1)'}),/http/);
  assert.doesNotThrow(()=>validateLoad({load:'L1',status:'Descompuesta',recordatorio_fecha:hours(1)}));
  assert.deepEqual(historyDiff({status:'Cargando',updated_at:'a'},{status:'En transito',updated_at:'b'}),[{key:'status',before:'Cargando',after:'En transito'}]);
});
test('editing a status preserves untouched dates, seconds and legacy document values',()=>{
  const previous={load:'L1',status:'Cargando',pickup_appt:'2026-10-08T12:00:45.123Z',doda:'DODA-003'};
  const raw={load:'L1',status:'En transito'};
  for(const field of dateFields) raw[field]=localDateInput(previous[field]);
  const checks=Object.fromEntries(booleanFields.map(field=>[field,marked(previous[field])]));
  assert.deepEqual(prepareLoadValues(raw,checks,previous).changes,{status:'En transito'});
  checks.doda=false;
  assert.deepEqual(prepareLoadValues(raw,checks,previous).changes,{status:'En transito',doda:'false'});
  raw.pickup_appt=localDateInput(hours(1));
  assert.equal(prepareLoadValues(raw,checks,previous).changes.pickup_appt,hours(1));
});
