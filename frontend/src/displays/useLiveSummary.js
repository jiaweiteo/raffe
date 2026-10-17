import { useEffect, useState } from "react";

// Only the main display requests guest acknowledgements; the potential screen stays aggregate-only.
export default function useLiveSummary({ celebrations = false } = {}) {
  const [snapshot, setSnapshot] = useState({ summary: null });
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let cursor;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const path = celebrations
          ? `/api/display/celebrations${cursor === undefined ? "" : `?after=${cursor}`}`
          : "/api/display";
        const response = await fetch(path, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Display unavailable");
        const value = await response.json();
        if (active) {
          if (celebrations) cursor = value.cursor;
          setSnapshot(celebrations ? value : { summary: value });
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        inFlight = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [celebrations]);
  return { ...snapshot, connected };
}
