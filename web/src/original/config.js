// Configuración pública del original: listas y umbrales compartidos.
export default {
  DONE_STATUSES: [
    "Delivered",
    "Completed",
    "DELIVERED",
    "COMPLETED",
    "Entregado",
    "ENTREGADO",
    "Completado",
    "COMPLETADO",
  ],
  REMINDER_STATUSES: ["Descompuesta", "En resguardo", "Patio permisionario"],
  AUTO_REVIEW_STATUSES: ["En transito"],
  AUTO_REVIEW_HOURS: 3,
  PROBLEM_STATUSES: ["Descompuesta", "En resguardo", "(HOS)"],
  ATTENTION_DELAY_MIN: 90,
  TIMELINE_STAGES: [
    {
      key: "programado",
      label: "Programado",
    },
    {
      key: "cargado",
      label: "Cargado",
    },
    {
      key: "documentos",
      label: "Documentos",
    },
    {
      key: "salida_mexico",
      label: "Salida planta",
    },
    {
      key: "frontera",
      label: "Frontera",
    },
    {
      key: "cruce_usa",
      label: "Cruce aduana",
    },
    {
      key: "en_transito",
      label: "En tránsito",
    },
    {
      key: "arribo_planta",
      label: "Arribo planta",
    },
    {
      key: "descarga",
      label: "Descarga",
    },
    {
      key: "pod",
      label: "POD",
    },
  ],
};
