import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/red-hat-display";
import "@fontsource-variable/red-hat-text";
import "@fontsource-variable/red-hat-mono";
import { SpendmapApp } from "../shared/SpendmapApp";
import type { Action, State } from "../shared/model";
import "./shell.css";
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function App() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => setState(await api("state"));
  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const password = new FormData(e.currentTarget).get("password");
    try {
      await api("login", { password });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <main className="auth">
        <p>Opening your spending map…</p>
      </main>
    );
  if (!state)
    return (
      <main className="auth">
        <div>
          <span className="auth-wordmark">spendmap.</span>
          <h1>See where your month went.</h1>
          <p>Sign in to your personal finance example.</p>
          <form onSubmit={login}>
            <label>
              Application password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button>Sign in</button>
          </form>
          <small>
            Use the password created by <code>npm run setup</code>.<br />
            This is a single-user starter with sample data.
          </small>
        </div>
      </main>
    );
  return (
    <SpendmapApp
      state={state}
      dispatch={async (action: Action) => {
        await api("actions", action);
        await refresh();
      }}
      sync={async () => {
        await api("sync", {});
        await refresh();
      }}
      signOut={async () => {
        await api("logout", {});
        setState(null);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
