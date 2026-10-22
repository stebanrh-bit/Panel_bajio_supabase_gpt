/*! Iconos Lucide 0.468.0 — https://lucide.dev
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import { escapeHtml } from "./content.js";

/** Catálogo cerrado: solo estos SVG locales se insertan en el HTML del panel. */
// Los identificadores se conservan para respetar las marcas y el historial ya guardados.
export const logisticsSignals = [
  {
    id: "urgent",
    label: "Atención urgente",
    description: "Requiere atención inmediata.",
    tone: "red",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M7 18v-6a5 5 0 1 1 10 0v6" /> <path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z" /> <path d="M21 12h1" /> <path d="M18.5 4.5 18 5" /> <path d="M2 12h1" /> <path d="M12 2v1" /> <path d="m4.929 4.929.707.707" /> <path d="M12 12v6" /> </svg>',
  },
  {
    id: "workshop",
    label: "En taller",
    description: "Unidad en reparación o mantenimiento.",
    tone: "red",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M12 16h.01" /> <path d="M12 8v4" /> <path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z" /> </svg>',
  },
  {
    id: "delay",
    label: "Retraso",
    description: "Existe una demora que debes vigilar.",
    tone: "orange",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <circle cx="12" cy="12" r="10" /> <line x1="12" x2="12" y1="8" y2="12" /> <line x1="12" x2="12.01" y1="16" y2="16" /> </svg>',
  },
  {
    id: "documents",
    label: "Documentos pendientes",
    description: "Falta documentación de la carga.",
    tone: "amber",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /> </svg>',
  },
  {
    id: "customs",
    label: "Revisión en aduana",
    description: "Dar seguimiento al despacho o revisión.",
    tone: "orange",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="M12 8v4" /> <path d="M12 16h.01" /> </svg>',
  },
  {
    id: "handling",
    label: "Carga / descarga",
    description: "Operación de carga o descarga por vigilar.",
    tone: "red",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <circle cx="12" cy="12" r="10" /> <path d="m4.9 4.9 14.2 14.2" /> </svg>',
  },
  {
    id: "appointment",
    label: "Cita por confirmar",
    description: "Confirmar horario con planta o destinatario.",
    tone: "amber",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M10.268 21a2 2 0 0 0 3.464 0" /> <path d="M22 8c0-2.3-.8-4.3-2-6" /> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /> <path d="M4 2C2.8 3.7 2 5.7 2 8" /> </svg>',
  },
  {
    id: "priority",
    label: "Carga prioritaria",
    description: "Destacar para seguimiento especial.",
    tone: "amber",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M7 22V2l10 5-10 5" /> </svg>',
  },
];

export const maxLogisticsSignals = 3;
const catalog = new Map(logisticsSignals.map((signal) => [signal.id, signal]));

/** Valida antes de enviar; el RPC vuelve a comprobar el mismo contrato en PostgreSQL. */
export function validateLogisticsSignals(values) {
  if (
    !Array.isArray(values) ||
    values.length > maxLogisticsSignals ||
    new Set(values).size !== values.length ||
    values.some((id) => !catalog.has(id))
  )
    throw Error("Selecciona hasta 3 señalamientos distintos del catálogo.");
  return [...values].sort();
}

export function selectedSignals(values) {
  return logisticsSignals.filter(
    (signal) => Array.isArray(values) && values.includes(signal.id),
  );
}

export function signalsSummary(values) {
  return (
    selectedSignals(values)
      .map((signal) => signal.label)
      .join(", ") || "Sin señalamientos"
  );
}

/** El mismo control se reutiliza en la tabla, las tarjetas y el detalle de la carga. */
export function signalStrip(load, values) {
  const selected = selectedSignals(values);
  const label =
    "Señalamientos de la carga " + load + ": " + signalsSummary(values);
  return (
    '<button type="button" class="load-signals-control' +
    (selected.length ? " has-signals" : "") +
    '" data-load-signals="' +
    escapeHtml(load) +
    '" aria-haspopup="dialog" aria-label="' +
    escapeHtml(label) +
    '">' +
    (selected.length
      ? selected
          .map(
            (signal) =>
              '<span class="logistics-signal signal-' +
              signal.tone +
              '" data-signal-id="' +
              signal.id +
              '">' +
              signal.icon +
              "</span>",
          )
          .join("")
      : '<span class="load-signals-empty"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>') +
    "</button>"
  );
}

/** Selección solo visual; el nombre accesible no añade texto ni tooltips a la pantalla. */
export function signalOptions(values) {
  return logisticsSignals
    .map(
      (signal) =>
        '<label class="signal-option"><input type="checkbox" data-signal-option="' +
        signal.id +
        '" aria-label="' +
        escapeHtml(signal.label) +
        '"' +
        (values.includes(signal.id) ? " checked" : "") +
        '><span class="logistics-signal signal-' +
        signal.tone +
        '">' +
        signal.icon +
        "</span></label>",
    )
    .join("");
}
