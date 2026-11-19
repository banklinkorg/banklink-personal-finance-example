import { Banklink } from "@banklink/sdk";
import { z } from "zod";
import { merchants } from "../shared/merchants.js";
import type { Transaction } from "../shared/model.js";
const row = z.object({
  id: z.string().min(1),
  external_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  description: z.string().max(2000),
  amount: z.number().finite(),
  currency: z.literal("ZAR"),
  direction: z.enum(["debit", "credit"]),
  reference: z.string().nullable().optional(),
});
/** Local illustrative merchant matching, not BankLink enrichment. Unknown descriptions stay visible. */
export function merchantFor(description: string): string {
  const text = description.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    Object.entries(merchants).find(
      ([id, m]) =>
        id !== "other" &&
        [m.label, id].some((term) =>
          text.includes(term.toLowerCase().replace(/[^a-z0-9]/g, "")),
        ),
    )?.[0] ?? "other"
  );
}
export function normalise(
  account: string,
  input: unknown,
  accountLabel = account,
): Transaction {
  const t = row.parse(input);
  const amount = Math.round(Math.abs(t.amount) * 100);
  const date = t.date.slice(0, 10);
  z.string().date().parse(date);
  if (!Number.isSafeInteger(amount) || amount === 0)
    throw new Error("Unsupported transaction amount.");
  return {
    id: `banklink:${account}:${t.external_id}`,
    account: accountLabel,
    date,
    description: t.description,
    amount,
    kind: /\btransfer\b/i.test(t.description)
      ? "transfer"
      : t.direction === "credit"
        ? "income"
        : "expense",
    merchantId: merchantFor(t.description),
    source: "banklink",
    reference: t.reference ?? undefined,
  };
}
export async function fetchSandbox(key: string): Promise<Transaction[]> {
  if (!key.startsWith("sk_test_"))
    throw new Error("Only BankLink test keys are accepted.");
  const client = new Banklink({ apiKey: key, timeout: 15000 });
  let accounts = (await client.accounts.list()).data;
  if (!accounts.length) {
    const result = await client.link.create({
      bankId: "fnb",
      nickname: "Spendmap sandbox",
      credentials: { username: "spendmap-demo", password: "sandbox-demo" },
    });
    if (result.type !== "success")
      throw new Error("Sandbox account setup did not complete.");
    accounts = (await client.accounts.list()).data;
  }
  if (accounts.length > 20)
    throw new Error("Use a sandbox organisation with at most 20 accounts.");
  const rows: Transaction[] = [];
  for (const a of accounts) {
    await client.accounts.sync(a.id);
    for await (const t of client.transactions.listAutoPaginate(a.id, {
      limit: 100,
    })) {
      if (rows.length >= 10000) throw new Error("Import limit reached.");
      rows.push(
        normalise(
          a.id,
          t,
          `${a.nickname || a.bank} ··${a.account_number?.slice(-4) ?? a.id.slice(-4)}`,
        ),
      );
    }
  }
  return rows;
}
