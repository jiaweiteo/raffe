import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({
  session: null,
  listener: null,
  fail: false,
}));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (listener) => {
        state.listener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: signIn,
      signOut: async () => {
        state.session = null;
        state.listener?.("SIGNED_OUT", null);
      },
    },
  }),
}));
import AuthGate, { authHeaders } from "./cloudAuth";

beforeEach(() => {
  state.session = null;
  state.listener = null;
  signIn.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "cloud",
        supabase_url: "https://test.supabase.co",
        publishable_key: "public-test",
      }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Desk() {
  return <p>Private raffle records</p>;
}

it("hides private records until sign-in and sends passwords only to the Auth client", async () => {
  const user = userEvent.setup();
  signIn.mockImplementation(async () => {
    state.session = { access_token: "verified-access" };
    state.listener("SIGNED_IN", state.session);
    return { error: null };
  });
  render(
    <AuthGate>
      <Desk />
    </AuthGate>,
  );
  await screen.findByRole("heading", { name: "Administrator sign-in" });
  expect(screen.queryByText("Private raffle records")).toBeNull();
  await user.type(screen.getByLabelText("Email"), "admin@example.com");
  await user.type(screen.getByLabelText("Password"), "example-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Private raffle records")).toBeTruthy();
  expect(signIn).toHaveBeenCalledWith({
    email: "admin@example.com",
    password: "example-password",
  });
  expect(await authHeaders()).toEqual({
    Authorization: "Bearer verified-access",
  });
  expect(fetch.mock.calls.every(([url]) => url === "/api/session")).toBe(true);
});

it("keeps the login visible when authentication fails", async () => {
  const user = userEvent.setup();
  signIn.mockResolvedValue({ error: new Error("Invalid login credentials") });
  render(
    <AuthGate>
      <Desk />
    </AuthGate>,
  );
  await screen.findByRole("heading", { name: "Administrator sign-in" });
  await user.type(screen.getByLabelText("Email"), "admin@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Invalid login credentials",
  );
  expect(screen.queryByText("Private raffle records")).toBeNull();
  await expect(authHeaders()).rejects.toThrow("session ended");
});
