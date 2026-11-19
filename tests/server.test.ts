import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { normalise } from "../server/banklink";
test("sign-in, CSRF, persistent classifications, idempotent imports and logout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spendmap-test-"));
  const dbPath = join(dir, "test.sqlite");
  const password = "test-password-at-least-16";
  const origin = "http://localhost:3110";
  const config = {
    dbPath,
    password,
    origin,
    secure: false,
    sandbox: async () => [
      normalise("a1", {
        id: "1",
        external_id: "1",
        date: "2026-11-19",
        amount: 59.99,
        description: "CHECKERS",
        currency: "ZAR",
        direction: "debit",
      }),
    ],
  };
  const { app, db } = createApp(config);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const call = (path: string, body?: unknown, requestOrigin = origin) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: requestOrigin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await call("/api/state")).status, 401);
    assert.equal(
      (await call("/api/login", { password }, "https://evil.example")).status,
      403,
    );
    assert.equal((await call("/api/login", { password: "wrong" })).status, 401);
    const login = await call("/api/login", { password });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(login.headers.get("set-cookie")!, /SameSite=Strict/);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const state = await (await call("/api/state")).json();
    const id = state.transactions.find(
      (t: { kind: string }) => t.kind === "expense",
    ).id;
    const action = {
      type: "classify",
      id,
      kind: "transfer",
      merchantId: "transfer",
    };
    assert.equal(
      (await call("/api/actions", action, "https://evil.example")).status,
      403,
    );
    assert.equal((await call("/api/actions", action)).status, 200);
    assert.equal(
      (await call("/api/actions", { ...action, merchantId: "not-a-merchant" }))
        .status,
      409,
    );
    assert.equal(
      (await call("/api/actions", { ...action, kind: "bad" })).status,
      400,
    );
    assert.equal((await (await call("/api/sync", {})).json()).imported, 1);
    assert.equal((await (await call("/api/sync", {})).json()).imported, 0);
    const updated = await (await call("/api/state")).json();
    assert.equal(
      updated.transactions.filter(
        (t: { source: string }) => t.source === "banklink",
      ).length,
      1,
    );
    assert.equal(
      updated.transactions.find((t: { id: string }) => t.id === id).kind,
      "transfer",
    );
    assert.equal((await call("/api/logout", {})).status, 200);
    assert.equal((await call("/api/state")).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
  const reopened = createApp(config);
  try {
    assert.ok(
      reopened
        .read()
        .transactions.some(
          (t) => t.kind === "transfer" && t.merchantId === "transfer",
        ),
    );
    assert.equal(
      reopened.read().transactions.filter((t) => t.source === "banklink")
        .length,
      1,
    );
  } finally {
    reopened.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
