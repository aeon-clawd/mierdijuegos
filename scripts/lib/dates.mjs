export const TIMEZONE = 'Europe/Madrid';

// Calendar date (YYYY-MM-DD) in Europe/Madrid, independent of the host timezone.
export function madridDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Sortable run id such as 2026-10-22T053000-ab12 (Madrid wall clock).
export function runStamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const rand = Math.random().toString(36).slice(2, 6);
  return `${madridDate(date)}T${parts.hour}${parts.minute}${parts.second}-${rand}`;
}
