// Shared catalog helpers used by the homepage (and its regression test).

function idNumber(id) {
  const n = Number.parseInt(String(id), 10);
  return Number.isFinite(n) ? n : -1;
}

// Newest first by ISO date (YYYY-MM-DD); same-date games fall back to the higher numeric id.
export function sortGamesNewestFirst(games) {
  return [...games].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return idNumber(b.id) - idNumber(a.id);
  });
}
