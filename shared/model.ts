import { merchants } from "./merchants.js";
export type Transaction = {
  id: string;
  account: string;
  date: string;
  description: string;
  amount: number;
  kind: "expense" | "income" | "transfer";
  merchantId: string;
  source: "sample" | "banklink";
  reference?: string;
};
export type State = {
  transactions: Transaction[];
  lastSync: string | null;
  mode: "sample" | "sandbox";
  audit: { date: string; action: string }[];
};
export type Action = {
  type: "classify";
  id: string;
  kind: Transaction["kind"];
  merchantId: string;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );
export function applyAction(s: State, a: Action): State {
  if (!s.transactions.some((t) => t.id === a.id))
    throw new Error("Transaction not found.");
  if (
    !Object.prototype.hasOwnProperty.call(merchants, a.merchantId) ||
    !["expense", "income", "transfer"].includes(a.kind)
  )
    throw new Error("Choose a valid merchant and transaction type.");
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.id === a.id ? { ...t, merchantId: a.merchantId, kind: a.kind } : t,
    ),
  };
}
export const monthKeys = (s: State) =>
  [...new Set(s.transactions.map((t) => t.date.slice(0, 7)))].sort();
export const daysInMonth = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
};
export const forMonth = (s: State, month: string, account = "all") =>
  s.transactions.filter(
    (t) =>
      t.date.startsWith(month + "-") &&
      (account === "all" || t.account === account),
  );
export const spend = (transactions: Transaction[]) =>
  transactions
    .filter((t) => t.kind === "expense")
    .reduce((n, t) => n + t.amount, 0);
export const dailyTotals = (transactions: Transaction[], month: string) =>
  Array.from({ length: daysInMonth(month) }, (_, i) => ({
    day: i + 1,
    amount: spend(
      transactions.filter((t) => Number(t.date.slice(8, 10)) === i + 1),
    ),
  }));
export function seed(): State {
  const keys = [
    "woolworths",
    "checkers",
    "pnp",
    "kfc",
    "mcd",
    "engen",
    "clicks",
    "spar",
    "uber",
    "bolt",
    "makro",
    "pedros",
    "ackermans",
    "hm",
    "shoprite",
    "clothingJunction",
    "choiceClothing",
    "fashionWorld",
  ];
  const transactions: Transaction[] = [];
  for (let m = 4; m <= 8; m++) {
    const month = `2026-${String(m).padStart(2, "0")}`;
    const accounts = ["FNB ··1001", "Capitec ··2002", "Nedbank ··3003"];
    for (let day = 1; day <= daysInMonth(month); day++) {
      const count = day % 3 === 0 ? 3 : day % 5 === 0 ? 0 : 2;
      for (let k = 0; k < count; k++) {
        const merchantId = keys[(day * 3 + k * 5 + m) % keys.length];
        const amount = (40 + ((day * 67 + k * 113 + m * 29) % 880)) * 100;
        transactions.push({
          id: `sample:${month}:${day}:${k}`,
          date: `${month}-${String(day).padStart(2, "0")}`,
          account: accounts[(day + k) % 3],
          merchantId,
          description: `CARD PURCHASE ${merchants[merchantId].label.toUpperCase()}`,
          amount,
          kind: "expense",
          source: "sample",
        });
      }
    }
    for (const [day, merchantId, amount, kind] of [
      [1, "other", 3200000, "income"],
      [2, "rent", 680000, "expense"],
      [7, "wifi", 69900, "expense"],
      [15, "transfer", 150000, "transfer"],
    ] as const)
      transactions.push({
        id: `sample:${month}:${merchantId}`,
        date: `${month}-${String(day).padStart(2, "0")}`,
        account: accounts[0],
        merchantId,
        description:
          kind === "income"
            ? "SALARY · SAMPLE EMPLOYER"
            : merchants[merchantId].label,
        amount,
        kind,
        source: "sample",
      });
  }
  return { transactions, mode: "sample", lastSync: null, audit: [] };
}
