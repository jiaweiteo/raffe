import { useEffect, useState } from "react";

// Both projector screens receive aggregate totals only, without an admin session.
export default function useLiveSummary() {
  const [summary, setSummary] = useState(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/display", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Display unavailable");
        const value = await response.json();
        if (active) {
          setSummary(value);
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
  }, []);
  return { summary, connected };
}
