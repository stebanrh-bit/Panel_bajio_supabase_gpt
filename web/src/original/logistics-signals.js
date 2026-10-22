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
export const logisticsSignals = [
  {
    id: "urgent",
    label: "Atención urgente",
    description: "Requiere atención inmediata.",
    tone: "red",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" /> </svg>',
  },
  {
    id: "workshop",
    label: "En taller",
    description: "Unidad en reparación o mantenimiento.",
    tone: "orange",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> </svg>',
  },
  {
    id: "delay",
    label: "Retraso",
    description: "Existe una demora que debes vigilar.",
    tone: "amber",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M12 6v6l4 2" /> <path d="M16 21.16a10 10 0 1 1 5-13.516" /> <path d="M20 11.5v6" /> <path d="M20 21.5h.01" /> </svg>',
  },
  {
    id: "documents",
    label: "Documentos pendientes",
    description: "Falta documentación de la carga.",
    tone: "blue",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <circle cx="8" cy="16" r="6" /> <path d="M9.5 17.5 8 16.25V14" /> </svg>',
  },
  {
    id: "customs",
    label: "Revisión en aduana",
    description: "Dar seguimiento al despacho o revisión.",
    tone: "purple",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="M12 8v4" /> <path d="M12 16h.01" /> </svg>',
  },
  {
    id: "handling",
    label: "Carga / descarga",
    description: "Operación de carga o descarga por vigilar.",
    tone: "teal",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M12 12H5a2 2 0 0 0-2 2v5" /> <circle cx="13" cy="19" r="2" /> <circle cx="5" cy="19" r="2" /> <path d="M8 19h3m5-17v17h6M6 12V7c0-1.1.9-2 2-2h3l5 5" /> </svg>',
  },
  {
    id: "appointment",
    label: "Cita por confirmar",
    description: "Confirmar horario con planta o destinatario.",
    tone: "blue",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" /> <path d="M16 2v4" /> <path d="M8 2v4" /> <path d="M3 10h5" /> <path d="M17.5 17.5 16 16.3V14" /> <circle cx="16" cy="16" r="6" /> </svg>',
  },
  {
    id: "priority",
    label: "Carga prioritaria",
    description: "Destacar para seguimiento especial.",
    tone: "purple",
    icon: '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /> <line x1="4" x2="4" y1="22" y2="15" /> </svg>',
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
    '" title="' +
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
              '" title="' +
              signal.label +
              '">' +
              signal.icon +
              "</span>",
          )
          .join("")
      : '<span class="load-signals-empty">+ Señal</span>') +
    "</button>"
  );
}

export function signalOptions(values) {
  return logisticsSignals
    .map(
      (signal) =>
        '<label class="signal-option"><input type="checkbox" data-signal-option="' +
        signal.id +
        '"' +
        (values.includes(signal.id) ? " checked" : "") +
        '><span class="logistics-signal signal-' +
        signal.tone +
        '">' +
        signal.icon +
        '</span><span class="signal-option-text"><strong>' +
        signal.label +
        "</strong><small>" +
        signal.description +
        "</small></span></label>",
    )
    .join("");
}
