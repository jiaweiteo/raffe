import React, { useEffect, useState } from "react";
import { ArrowUpRight, Expand, Leaf, Minimize, Sparkles } from "lucide-react";
import { time } from "../format";

export function DisplayBrand() {
  return (
    <div className="display-brand">
      <Leaf size={21} strokeWidth={1} />
      <span>THE WEDDING RAFFLE</span>
      <Leaf size={21} strokeWidth={1} />
    </div>
  );
}

export function FullscreenButton() {
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return (
    <>
      <button
        type="button"
        className="display-tool"
        aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            setFullscreen(Boolean(document.fullscreenElement));
            setError("");
          } catch {
            setError("Use your browser’s fullscreen command.");
          }
        }}
      >
        {fullscreen ? <Minimize size={17} /> : <Expand size={17} />}
        <span>Fullscreen</span>
      </button>
      {error && (
        <span className="display-tool-message" role="status">
          {error}
        </span>
      )}
    </>
  );
}

export function DisplaySwitch({ potential = false }) {
  return (
    <a
      className="display-tool display-switch"
      href={potential ? "/display" : "/display/potential"}
    >
      {potential ? <ArrowUpRight size={16} /> : <Sparkles size={16} />}
      <span>{potential ? "Live pot" : "Potential prizes"}</span>
    </a>
  );
}

export function DisplayStatus({ summary, connected }) {
  return (
    <div className="display-bottom">
      <span className={`display-status ${connected ? "" : "offline"}`}>
        <span className={`status-dot ${connected ? "" : "amber"}`} />
        {connected
          ? "Live from the raffle desk"
          : summary
            ? "Reconnecting · showing last confirmed total"
            : "Waiting for the raffle desk"}
      </span>
      <span>
        {summary?.updated_at
          ? `Updated ${time(summary.updated_at)}`
          : "Five prizes. One lovely celebration."}
      </span>
    </div>
  );
}
