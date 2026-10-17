import React from "react";
import { Trophy } from "lucide-react";
import { money } from "./format";

export default function PrizeCards({ summary, large = false }) {
  const labels = [
    "First prize",
    "Second prize",
    "Third prize",
    "Fourth prize",
    "Fifth prize",
  ];
  return (
    <div className={`prize-cards ${large ? "large" : ""}`}>
      {summary.prizes_cents.map((cents, index) => (
        <div className={`prize-card prize-${index + 1}`} key={index}>
          <div className="prize-label">
            {index === 0 ? (
              <Trophy size={17} />
            ) : (
              <span className="prize-index">0{index + 1}</span>
            )}
            <span>{labels[index]}</span>
          </div>
          <strong>{money(cents)}</strong>
        </div>
      ))}
    </div>
  );
}
