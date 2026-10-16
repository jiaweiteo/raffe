export const FIRST = 52000001,
  LAST = 52001500;

export const ticketFromSuffix = (value) =>
  /^\d{1,4}$/.test(String(value))
    ? Number("5200" + String(value).padStart(4, "0"))
    : NaN;

function ticketRange(row) {
  const first = ticketFromSuffix(row.first);
  const count = /^\d+$/.test(String(row.count)) ? Number(row.count) : 0;
  const last = first + count - 1;
  return Number.isInteger(first) && first >= FIRST && count > 0 && last <= LAST
    ? { first, last }
    : null;
}

function nextFreeTicket(count, occupied, after) {
  if (!Number.isInteger(count) || count < 1 || count > LAST - FIRST + 1)
    return null;
  const ranges = [...occupied].sort((a, b) => a.first - b.first);
  const search = (start) => {
    let candidate = Math.max(FIRST, start);
    for (const range of ranges) {
      if (range.last < candidate) continue;
      if (candidate + count - 1 < range.first) break;
      candidate = range.last + 1;
    }
    return candidate + count - 1 <= LAST ? candidate : null;
  };
  // Continue after the last issued ticket; use earlier gaps only if the remaining tail is too short.
  return search(after) ?? (after > FIRST ? search(FIRST) : null);
}

export function prefillTicketRows(rows, occupied) {
  const reserved = [
    ...occupied,
    ...rows
      .filter((row) => !row.autoFirst)
      .map(ticketRange)
      .filter(Boolean),
  ];
  let cursor = occupied.reduce(
    (next, range) => Math.max(next, range.last + 1),
    FIRST,
  );
  return rows.map((row) => {
    if (!row.autoFirst) {
      const range = ticketRange(row);
      if (range) cursor = range.last + 1;
      return row;
    }
    const count = /^\d+$/.test(String(row.count)) ? Number(row.count) : 0;
    const first = nextFreeTicket(count, reserved, cursor);
    if (first !== null) {
      reserved.push({ first, last: first + count - 1 });
      cursor = first + count;
    }
    const suffix = first === null ? "" : String(first).slice(4);
    return row.first === suffix ? row : { ...row, first: suffix };
  });
}
