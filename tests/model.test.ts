import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  dailyTotals,
  daysInMonth,
  forMonth,
  monthKeys,
  seed,
  spend,
} from "../shared/model";
import { normalise, fetchSandbox, merchantFor } from "../server/banklink";
test("sample spending reconciles across every day and source in every month", () => {
  const s = seed();
  assert.deepEqual(monthKeys(s), [
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
  ]);
  for (const m of monthKeys(s)) {
    const all = forMonth(s, m);
    assert.equal(
      dailyTotals(all, m).reduce((n, d) => n + d.amount, 0),
      spend(all),
    );
    const accounts = [...new Set(all.map((t) => t.account))];
    assert.equal(
      accounts.reduce((n, a) => n + spend(forMonth(s, m, a)), 0),
      spend(all),
    );
    assert.ok(all.some((t) => t.kind === "income"));
    assert.ok(all.some((t) => t.kind === "transfer"));
  }
});
test("calendar day counts include leap years and month-end transactions", () => {
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-04"), 30);
  assert.equal(daysInMonth("2026-08"), 31);
  const s = seed();
  assert.ok(forMonth(s, "2026-08").some((t) => t.date === "2026-08-31"));
});
test("reclassification excludes transfers, preserves the original data and changes merchant", () => {
  const s = seed();
  const t = s.transactions.find((t) => t.kind === "expense")!;
  const before = spend(s.transactions);
  const next = applyAction(s, {
    type: "classify",
    id: t.id,
    kind: "transfer",
    merchantId: "transfer",
  });
  assert.equal(spend(next.transactions), before - t.amount);
  assert.equal(
    next.transactions.find((x) => x.id === t.id)?.description,
    t.description,
  );
  assert.equal(s.transactions.find((x) => x.id === t.id)?.kind, "expense");
  assert.throws(() =>
    applyAction(s, {
      type: "classify",
      id: t.id,
      kind: "expense",
      merchantId: "__proto__",
    }),
  );
});
test("normalisation uses cents, direction and account-scoped external IDs", () => {
  const base = {
    id: "t1",
    external_id: "external1",
    date: "2026-11-19",
    description: "CARD CHECKERS CAPE TOWN",
    amount: 123.45,
    currency: "ZAR",
    direction: "debit",
  };
  const t = normalise("a1", base, "FNB ··1234");
  assert.equal(t.amount, 12345);
  assert.equal(t.account, "FNB ··1234");
  assert.equal(t.kind, "expense");
  assert.equal(t.merchantId, "checkers");
  assert.notEqual(t.id, normalise("a2", base).id);
  assert.equal(
    normalise("a1", { ...base, direction: "credit" }).kind,
    "income",
  );
  assert.equal(
    normalise("a1", { ...base, description: "TRANSFER TO SAVINGS" }).kind,
    "transfer",
  );
  assert.throws(() => normalise("a1", { ...base, currency: "USD" }));
  assert.throws(() => normalise("a1", { ...base, date: "2026-02-31" }));
  assert.throws(() => normalise("a1", { ...base, amount: 0 }));
});
test("unknown merchants remain uncategorised and live keys are refused", async () => {
  assert.equal(merchantFor("UNFAMILIAR SHOP 7712"), "other");
  await assert.rejects(
    fetchSandbox("sk_live_example"),
    /Only BankLink test keys/,
  );
});
