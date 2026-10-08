// Reglas trasladadas del backend original. Las fechas nuevas se guardan como ISO.
export const doneStatuses = ['Delivered', 'Completed', 'DELIVERED', 'COMPLETED', 'Entregado', 'ENTREGADO', 'Completado', 'COMPLETADO'];
export const reminderStatuses = ['Descompuesta', 'En resguardo', 'Patio permisionario'];
export const statuses = ['Cargando', 'En transito', 'En yarda MX', 'Descargando', 'Pte. Arrivo', 'TONU', 'DELIVERED', 'En AA', 'En Yarda US', 'Patio permisionario', 'Cancelado.', 'COMPLETED', '(HOS)', 'Cruzando', 'EN PLANTA', 'PATIO MTY', 'Recolectando', 'Descompuesta', 'En resguardo'];
export const stages = ['Programado', 'Cargado', 'Documentos', 'Salida planta', 'Frontera', 'Cruce aduana', 'En tránsito', 'Arribo planta', 'Descarga', 'POD'];
export const booleanFields = ['bol','doda','entry','sobre_listo','pod_sent','recargos_vg','cruce_confirmado'];
export const dateFields = ['pickup_appt','pickup_actual','delivery_appt','delivery_actual','salida_mexico_fecha','cruce_usa_fecha','recordatorio_fecha','next_review_at'];
export function marked(value) {
  if (value === null || value === undefined) return false;
  return !['','false','0','no','null'].includes(String(value).trim().toLowerCase());
}
export function stageIndex(row) {
  const status=String(row.status || '').trim();
  if(marked(row.pod_sent) || doneStatuses.includes(status)) return 9;
  if(status==='Descargando') return 8;
  if(['EN PLANTA','PATIO MTY'].includes(status) || row.delivery_actual) return 7;
  if(['En transito','En Yarda US','Pte. Arrivo'].includes(status)) return 6;
  if(row.cruce_usa_fecha) return 5;
  if(status==='Cruzando') return 4;
  if(row.salida_mexico_fecha) return 3;
  if(marked(row.doda)) return 2;
  if(row.pickup_actual) return 1;
  return 0;
}
const timestamp = value => value ? Date.parse(value) : NaN;
export function alertFor(row, now=Date.now()) {
  const stage=stageIndex(row), delivered=stage===9;
  const delivery=timestamp(row.delivery_appt), updated=timestamp(row.updated_at);
  const hours=(delivery-now)/3600000;
  if(!delivered && delivery < now) return {level:'critical',message:`Retraso de ${Math.round(-hours)}h respecto a la cita de entrega.`};
  if(!delivered && stage<5 && hours>=0 && hours<=24) return {level:'critical',message:'La cita de entrega es en menos de 24h y el embarque aún no cruza a EUA.'};
  if(!delivered && row.status==='Cruzando' && (now-updated)/3600000>=4) return {level:'warn',message:`La unidad lleva ${Math.round((now-updated)/3600000)}h en frontera.`};
  if(!delivered && stage<7 && hours>=0 && hours<=6) return {level:'warn',message:'Riesgo de no llegar a tiempo a la cita de entrega.'};
  return {level:'good',message:'En tiempo.'};
}
export function attentionFor(row, now=Date.now()) {
  if(row.status==='TONU' && marked(row.recargos_vg)) return '';
  if(doneStatuses.includes(row.status)) return marked(row.pod_sent) ? '' : 'Falta compartir el POD.';
  const alert=alertFor(row,now);
  if(alert.level==='critical') return alert.message;
  if(['Descompuesta','En resguardo','(HOS)'].includes(row.status)) return 'La carga requiere atención operativa.';
  const auto=row.status==='En transito';
  if((auto || reminderStatuses.includes(row.status)) && ((auto && !row.recordatorio_fecha) || timestamp(row.recordatorio_fecha)<=now)) return auto ? 'Toca revisar la carga en tránsito.' : 'Venció el recordatorio operativo.';
  if(timestamp(row.next_review_at)<=now) return 'Venció la próxima revisión.';
  if(row.cruce_usa_fecha && timestamp(row.cruce_usa_fecha)<=now && !marked(row.cruce_confirmado)) return 'Confirma si la caja ya cruzó la aduana.';
  if([row.pickup_delta_min,row.delivery_delta_min].some(value=>Math.abs(Number(value))>90)) return 'Desfase de cita superior a 90 minutos.';
  if(Number(row.incidenciasCount)>0) return 'La carga tiene incidencias registradas.';
  return '';
}
export function localDateInput(value) {
  const date=new Date(value);
  if(!value || Number.isNaN(date.getTime())) return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toISO(value) {
  if(!value) return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) throw Error('La fecha no es válida.');
  return date.toISOString();
}
export function validateLoad(values) {
  if(!String(values.load || '').trim()) throw Error('Falta el número de carga.');
  if(reminderStatuses.includes(values.status) && !values.recordatorio_fecha) throw Error('Este estatus requiere una fecha de recordatorio o despacho.');
  if(values.tracking_link) {
    let url;
    try {url=new URL(values.tracking_link);} catch {throw Error('El enlace de seguimiento no es válido.');}
    if(!['https:','http:'].includes(url.protocol) || values.tracking_link.length>2000) throw Error('El enlace de seguimiento debe usar http o https y tener hasta 2000 caracteres.');
  }
  return values;
}
export function historyDiff(before,after) {
  return Object.keys(after).filter(key=>!['created_at','updated_at','updated_by'].includes(key) && String(before?.[key] ?? '') !== String(after[key] ?? '')).map(key=>({key,before:before?.[key] ?? '',after:after[key]}));
}
export function prepareLoadValues(formValues, checkedValues, previous={}) {
  const values=Object.fromEntries(Object.entries(formValues).map(([key,value])=>[key,String(value).trim()]));
  for(const field of booleanFields) values[field]=checkedValues[field]?'true':'false';
  for(const field of dateFields) values[field]=toISO(values[field]);
  if(!reminderStatuses.includes(values.status) && values.status!=='En transito') values.recordatorio_fecha='';
  validateLoad(values);
  const changes=Object.fromEntries(Object.entries(values).filter(([field,value])=>{
    if(!previous.load) return true;
    if(dateFields.includes(field)) return String(formValues[field] || '')!==localDateInput(previous[field]);
    if(booleanFields.includes(field)) return marked(previous[field])!==marked(value);
    return value!==String(previous[field] ?? '');
  }));
  return {values, changes};
}
