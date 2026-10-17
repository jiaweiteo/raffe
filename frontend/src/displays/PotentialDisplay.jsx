import React, { useEffect, useState } from "react";
import { Pause, Play, Sparkles, Ticket, Trophy } from "lucide-react";
import PrizeCards from "../PrizeCards";
import { integer, money } from "../format";
import useLiveSummary from "./useLiveSummary";
import useReducedMotion from "./useReducedMotion";
import { potentialPots, prizesForPot } from "./prizeMath";
import {
  DisplayBrand,
  DisplayStatus,
  DisplaySwitch,
  FullscreenButton,
} from "./DisplayChrome";

export default function PotentialDisplay() {
  const { summary, connected } = useLiveSummary();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(2);
  const [rotating, setRotating] = useState(true);
  const goals = potentialPots(summary);
  const goalsKey = goals.join(",");
  const selected = index % Math.max(goals.length, 1);
  const target = goals[selected] ?? summary?.pot_cents ?? 0;
  const prizes = prizesForPot(target);
  const soldOut = Boolean(summary && summary.remaining === 0);
  useEffect(() => {
    document.title = "The Wedding Raffle · Potential prizes";
  }, []);
  useEffect(() => {
    if (!rotating || reduced || goals.length < 2) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % goals.length),
      9000,
    );
    return () => clearInterval(timer);
  }, [goalsKey, rotating, reduced]);
  return (
    <main className="potential-display">
      <div className="potential-aura aura-left" />
      <div className="potential-aura aura-right" />
      <div className="potential-speckles" aria-hidden="true" />
      <DisplaySwitch potential />
      <div className="display-tools">
        {goals.length > 1 && !reduced && (
          <button
            className="display-tool"
            type="button"
            onClick={() => setRotating(!rotating)}
            aria-label={
              rotating
                ? "Pause potential prize rotation"
                : "Resume potential prize rotation"
            }
          >
            {rotating ? <Pause size={16} /> : <Play size={16} />}
            <span>{rotating ? "Pause rotation" : "Rotate prizes"}</span>
          </button>
        )}
        <FullscreenButton />
      </div>
      <DisplayBrand />
      <p className="potential-eyebrow">FIVE PRIZES. ONE LUCKY CELEBRATION.</p>
      <h1>
        {soldOut
          ? "The pot is set. The luck is next."
          : "Imagine your winning moment."}
      </h1>
      <div className="potential-target" key={target}>
        <p>
          {soldOut
            ? "WITH THE CONFIRMED PRIZE POOL AT"
            : "IF THE FINAL PRIZE POOL REACHES"}{" "}
          <strong>{money(target)}</strong>
        </p>
        <div className="potential-first-label">
          <Trophy size={18} strokeWidth={1.3} />
          {soldOut ? "FIRST PRIZE" : "FIRST PRIZE COULD BE"}
        </div>
        <div className="potential-first-amount">{money(prizes[0])}</div>
        <p className="potential-moment">
          {soldOut
            ? "Good luck to everyone in the draw."
            : "A little ticket. A rather wonderful possibility."}
        </p>
      </div>
      {goals.length > 1 && (
        <div className="potential-goals" aria-label="Example prize pools">
          {goals.map((goal, position) => (
            <button
              type="button"
              key={goal}
              aria-pressed={position === selected}
              onClick={() => setIndex(position)}
            >
              <span className="goal-dot" />
              {money(goal)} pot
            </button>
          ))}
        </div>
      )}
      <div className="potential-prizes">
        <PrizeCards summary={{ prizes_cents: prizes }} large />
      </div>
      {!soldOut && (
        <div className="potential-invitation">
          <Sparkles size={19} />
          <span>
            Join in at the raffle desk.{" "}
            <strong>Help the possibilities grow.</strong>
          </span>
          <Sparkles size={19} />
        </div>
      )}
      {!soldOut && (
        <div className="potential-packages" aria-label="Ticket packages">
          <span>
            <strong>$5</strong>1 entry
          </span>
          <i />
          <span>
            <strong>$20</strong>5 entries
          </span>
          <i />
          <span>
            <strong>$50</strong>15 entries
          </span>
        </div>
      )}
      <div className="potential-actual">
        <span>
          <span className={`status-dot ${connected ? "" : "amber"}`} />
          Actual live pot{" "}
          <strong>{summary ? money(summary.pot_cents) : "Connecting…"}</strong>
        </span>
        {summary && (
          <span>
            <Ticket size={15} />
            <strong>{integer(summary.remaining)}</strong> tickets available
          </span>
        )}
      </div>
      <p className="potential-disclaimer">
        {soldOut
          ? "Prize amounts reflect the current confirmed pot."
          : "Illustrative potential payouts. Actual prizes depend on the final confirmed pot."}
      </p>
      <DisplayStatus summary={summary} connected={connected} />
    </main>
  );
}
