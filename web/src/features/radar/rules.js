/** Distancia geográfica. No representa un trayecto por carretera. */
export function straightMiles(a, b) {
  const radians = (value) => (value * Math.PI) / 180;
  const lat = radians(b.latitude - a.latitude),
    lng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(lng / 2) ** 2;
  return (
    3958.7613 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export const placeLabel = (record) =>
  [record.origin_city, record.origin_state].filter(Boolean).join(", ");
export const mapsUrl = (origin, destination) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
