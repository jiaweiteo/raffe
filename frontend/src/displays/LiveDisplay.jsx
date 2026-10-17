import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Ticket, Volume2, VolumeX } from "lucide-react";
import PrizeCards from "../PrizeCards";
import { integer } from "../format";
import useLiveSummary from "./useLiveSummary";
import useReducedMotion from "./useReducedMotion";
import CelebrationAudio from "./celebrationAudio";
import Celebration from "./Celebration";
import {
  DisplayBrand,
  DisplayStatus,
  DisplaySwitch,
  FullscreenButton,
} from "./DisplayChrome";

function useAnimatedPot(target, reduced) {
  const [shown, setShown] = useState(null);
  const current = useRef(null);
  useEffect(() => {
    if (target === undefined) return;
    if (current.current === null || target <= current.current || reduced) {
      current.current = target;
      setShown(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame;
    const step = (now) => {
      const progress = Math.min(1, (now - start) / 2400);
      const value = Math.round(
        from + (target - from) * (1 - Math.pow(1 - progress, 4)),
      );
      current.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return shown;
}

export default function LiveDisplay() {
  const { summary, contributions, connected } = useLiveSummary({
    celebrations: true,
  });
  const reduced = useReducedMotion();
  const [celebration, setCelebration] = useState(null);
  const [sound, setSound] = useState(false);
  const [audioError, setAudioError] = useState("");
  const previousPot = useRef(null);
  const sequence = useRef(0);
  const audio = useRef(null);
  const animatedPot = useAnimatedPot(summary?.pot_cents, reduced);
  const celebrate = (amount, preview = false, guestNames = []) => {
    setCelebration({ id: ++sequence.current, amount, preview, guestNames });
    if (audio.current?.enabled) audio.current.play();
  };
  useEffect(() => {
    document.title = "Markus & Julia · Live";
    return () => audio.current?.close();
  }, []);
  useEffect(() => {
    if (!summary) return;
    const previous = previousPot.current;
    previousPot.current = summary.pot_cents;
    if (
      previous !== null &&
      summary.pot_cents < previous &&
      !contributions?.length
    ) {
      setCelebration(null);
      audio.current?.stop();
    }
    // A confirmation cursor prevents refreshes and guest edits from replaying an arrival.
    if (
      previous !== null &&
      contributions?.length &&
      document.visibilityState !== "hidden"
    ) {
      celebrate(
        contributions.reduce((total, event) => total + event.amount_cents, 0),
        false,
        [...new Set(contributions.flatMap((event) => event.guest_names))],
      );
    }
  }, [summary, contributions]);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 9000);
    return () => clearTimeout(timer);
  }, [celebration]);
  return (
    <main className={`live-display ${celebration ? "is-celebrating" : ""}`}>
      <div className="display-orbit orbit-one" />
      <div className="display-orbit orbit-two" />
      <DisplaySwitch />
      <div className="display-tools">
        <button
          type="button"
          className={`display-tool ${sound ? "sound-on" : ""}`}
          aria-label={
            sound ? "Mute celebration sound" : "Enable celebration sound"
          }
          aria-pressed={sound}
          onClick={async () => {
            if (sound) {
              audio.current?.mute();
              setSound(false);
              return;
            }
            try {
              audio.current ||= new CelebrationAudio();
              await audio.current.enable();
              setSound(true);
              setAudioError("");
            } catch (error) {
              setAudioError(error.message);
            }
          }}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <span>{sound ? "Sound on" : "Enable sound"}</span>
        </button>
        <button
          type="button"
          className="display-tool"
          aria-label="Preview effect"
          onClick={() => celebrate(5000, true, ["Alex & Jamie"])}
        >
          <Sparkles size={17} />
          <span>Preview effect</span>
        </button>
        <FullscreenButton />
        {audioError && (
          <span className="display-tool-message" role="status">
            {audioError}
          </span>
        )}
      </div>
      <DisplayBrand />
      <h1>{summary?.event_title || "A little luck. A lot of love."}</h1>
      <div className="display-flourish">
        <span />
        <Sparkles size={20} strokeWidth={1} />
        <span />
      </div>
      <p className="display-pool-label">OUR GROWING PRIZE POOL</p>
      <div
        className="display-pot"
        aria-label={
          summary
            ? `Confirmed prize pool: SGD ${(summary.pot_cents / 100).toFixed(2)}`
            : undefined
        }
      >
        {summary ? (
          <>
            <span>S$</span>
            {new Intl.NumberFormat("en-SG", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format((animatedPot ?? summary.pot_cents) / 100)}
          </>
        ) : (
          <span className="display-loading">Preparing the celebration…</span>
        )}
      </div>
      <p className="display-subtitle">
        A little contribution. A chance at something wonderful.
      </p>
      {summary && (
        <>
          <div className="display-prizes">
            <PrizeCards summary={summary} large />
          </div>
          <div className="display-inventory">
            <span>
              <Ticket size={19} />
              <strong>{integer(summary.sold)}</strong> tickets in the draw
            </span>
            <i />
            <span>
              <strong>{integer(summary.remaining)}</strong> chances still
              waiting
            </span>
            {summary.voided > 0 && (
              <>
                <i />
                <span>{integer(summary.voided)} tickets voided</span>
              </>
            )}
          </div>
        </>
      )}
      <DisplayStatus summary={summary} connected={connected} />
      {celebration && (
        <Celebration
          key={celebration.id}
          celebration={celebration}
          reduced={reduced}
        />
      )}
    </main>
  );
}
