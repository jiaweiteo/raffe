import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveDisplay from "./LiveDisplay";
import PotentialDisplay from "./PotentialDisplay";
import { potentialPots, prizesForPot } from "./prizeMath";

const sound = vi.hoisted(() => ({
  play: vi.fn(),
  mute: vi.fn(),
  close: vi.fn(),
  stop: vi.fn(),
  enable: vi.fn(),
}));
vi.mock("./celebrationAudio", () => ({
  default: class {
    enabled = false;
    async enable() {
      sound.enable();
      this.enabled = true;
    }
    play() {
      sound.play();
    }
    mute() {
      this.enabled = false;
      sound.mute();
    }
    close() {
      sound.close();
    }
    stop() {
      sound.stop();
    }
  },
}));
let summary;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  summary = {
    pot_cents: 80000,
    prizes_cents: [25000, 25000, 15000, 10000, 5000],
    sold: 240,
    voided: 0,
    remaining: 1260,
    capacity: 1500,
    event_title: "Our wedding",
    updated_at: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => summary })),
  );
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const settle = async () => {
  await act(async () => {});
};
const poll = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
};

it("celebrates only new positive pot changes, with opt-in sound and no repeats", async () => {
  render(<LiveDisplay />);
  await settle();
  expect(
    screen.queryByRole("heading", { name: "The pot just got bigger!" }),
  ).toBeNull();
  expect(sound.play).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Enable celebration sound" }),
    );
  });
  summary = { ...summary, pot_cents: 85000 };
  await poll();
  expect(
    screen.getByRole("heading", { name: "The pot just got bigger!" }),
  ).toBeTruthy();
  expect(screen.getByText("+$50.00")).toBeTruthy();
  expect(sound.play).toHaveBeenCalledTimes(1);
  await poll();
  expect(sound.play).toHaveBeenCalledTimes(1);
  summary = { ...summary, pot_cents: 80000 };
  await poll();
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("heading", { name: "The pot just got bigger!" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Mute celebration sound" }),
  );
  summary = { ...summary, pot_cents: 82000 };
  await poll();
  expect(screen.getByText("+$20.00")).toBeTruthy();
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls.every(([url]) => url === "/api/display")).toBe(true);
});

it("clearly marks a preview, keeps the actual pot unchanged, and dismisses the effect", async () => {
  render(<LiveDisplay />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Preview effect" }));
  expect(screen.getByText("CELEBRATION PREVIEW")).toBeTruthy();
  expect(
    screen.getByText("Effect preview only · no payment recorded"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Confirmed prize pool: SGD 800.00"),
  ).toBeTruthy();
  expect(sound.play).not.toHaveBeenCalled();
  expect(
    fetch.mock.calls.every(
      ([url, options]) => url === "/api/display" && !options?.method,
    ),
  ).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(screen.queryByText("CELEBRATION PREVIEW")).toBeNull();
});

it("shows reduced-motion celebrations without fireworks", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const { container } = render(<LiveDisplay />);
  await settle();
  summary = { ...summary, pot_cents: 85000 };
  await poll();
  expect(screen.getByText("+$50.00")).toBeTruthy();
  expect(container.querySelector("canvas")).toBeNull();
  expect(
    screen.getByLabelText("Confirmed prize pool: SGD 850.00").textContent,
  ).toContain("850.00");
});

it("does not invent an arrival on initial connection or while the tab is hidden", async () => {
  render(<LiveDisplay />);
  await settle();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  summary = { ...summary, pot_cents: 100000 };
  await poll();
  expect(
    screen.queryByRole("heading", { name: "The pot just got bigger!" }),
  ).toBeNull();
});

it("separates potential payouts from the live pot and rotates examples", async () => {
  render(<PotentialDisplay />);
  await settle();
  expect(screen.getByText("FIRST PRIZE COULD BE")).toBeTruthy();
  expect(screen.getAllByText("$3,900.00")).toHaveLength(2);
  expect(screen.getByText("$800.00")).toBeTruthy();
  expect(
    screen.getByText(
      "Illustrative potential payouts. Actual prizes depend on the final confirmed pot.",
    ),
  ).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(screen.getAllByText("$1,900.00")).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", { name: "Pause potential prize rotation" }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(screen.getAllByText("$1,900.00")).toHaveLength(2);
  expect(fetch.mock.calls.every(([url]) => url === "/api/display")).toBe(true);
});

it("stops advertising ticket purchases when stock is exhausted", async () => {
  summary = { ...summary, remaining: 0 };
  render(<PotentialDisplay />);
  await settle();
  expect(
    screen.getByRole("heading", { name: "The pot is set. The luck is next." }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Ticket packages")).toBeNull();
  expect(screen.queryByText("FIRST PRIZE COULD BE")).toBeNull();
});

it("keeps every illustrated prize cent and limits targets to reachable pots", () => {
  for (const pot of [0, 1, 2, 3, 15, 80000, 159999, 160000, 500000]) {
    const prizes = prizesForPot(pot);
    expect(prizes.reduce((a, b) => a + b, 0)).toBe(pot);
    expect(prizes.every(Number.isInteger)).toBe(true);
  }
  expect(prizesForPot(500000)).toEqual([390000, 50000, 30000, 20000, 10000]);
  expect(
    potentialPots({ ...summary, pot_cents: 217000, remaining: 850 }),
  ).toEqual([300000, 400000, 500000]);
  expect(
    potentialPots({ ...summary, pot_cents: 498000, remaining: 2 }),
  ).toEqual([499000]);
  expect(potentialPots({ ...summary, remaining: 0 })).toEqual([]);
});
