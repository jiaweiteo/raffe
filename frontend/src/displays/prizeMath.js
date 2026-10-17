export function prizesForPot(pot) {
  if (pot >= 160000) return [pot - 110000, 50000, 30000, 20000, 10000];
  const prizes = [5, 5, 3, 2, 1].map((weight) =>
    Math.floor((pot * weight) / 16),
  );
  const remainder = pot - prizes.reduce((sum, value) => sum + value, 0);
  return prizes.map((value, index) => value + (index < remainder ? 1 : 0));
}

export function potentialPots(summary) {
  if (!summary) return [300000, 400000, 500000];
  // The upper bound assumes remaining tickets sell as individual $5 entries.
  const maximum = summary.pot_cents + summary.remaining * 500;
  const milestones = [300000, 400000, 500000, 600000, 700000].filter(
    (pot) => pot > summary.pot_cents && pot <= maximum,
  );
  if (milestones.length) return milestones.slice(0, 3);
  if (summary.remaining <= 0) return [];
  const next = Math.ceil((summary.pot_cents + 1) / 50000) * 50000;
  return [Math.min(next, maximum)];
}
