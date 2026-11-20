import { useEffect, useMemo, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  Search,
  ChartPie,
  WalletCards,
  List,
  CalendarDays,
  X,
} from "lucide-react";
import { SpendingGraph } from "./SpendingGraph";
import { merchants } from "./merchants";
import {
  dailyTotals,
  daysInMonth,
  forMonth,
  money,
  monthKeys,
  spend,
  type Action,
  type State,
} from "./model";
import "./spendmap.css";
export type SpendmapProps = {
  state: State;
  dispatch: (action: Action) => Promise<void>;
  sync?: () => Promise<void>;
  reset?: () => void;
  signOut?: () => void;
};
const label = (month: string, short = false) =>
  new Date(month + "-01T12:00:00Z").toLocaleDateString("en-ZA", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
function download(rows: State["transactions"]) {
  const a = document.createElement("a");
  const csv = [
    ["Date", "Account", "Description", "Merchant", "Type", "Amount (cents)"],
    ...rows.map((t) => [
      t.date,
      t.account,
      t.description,
      merchants[t.merchantId]?.label ?? "Other",
      t.kind,
      String(t.amount),
    ]),
  ]
    .map((r) =>
      r
        .map((v) => '"' + v.replace(/"/g, '""').replace(/^[=+@-]/, "'$&") + '"')
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.href = url;
  a.download = "spendmap-transactions.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SpendmapApp({
  state: s,
  dispatch,
  sync,
  reset,
  signOut,
}: SpendmapProps) {
  const [dataset, setDataset] = useState<"sample" | "banklink">(
    s.mode === "sandbox" ? "banklink" : "sample",
  );
  const scope = useMemo(
    () => ({
      ...s,
      transactions: s.transactions.filter((t) => t.source === dataset),
    }),
    [s, dataset],
  );
  const months = monthKeys(scope);
  const [chosenMonth, setMonth] = useState(months[0] ?? "2026-11");
  const month = months.includes(chosenMonth)
    ? chosenMonth
    : (months[0] ?? "2026-11");
  const [account, setAccount] = useState("all");
  const [day, setDay] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [visibleDay, setVisible] = useState(31);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState("Graph");
  const [merchant, setMerchant] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const rows = useMemo(
    () => forMonth(scope, month, account),
    [scope, month, account],
  );
  const daily = dailyTotals(rows, month);
  const max = Math.max(...daily.map((d) => d.amount), 1);
  const days = daysInMonth(month);
  const accounts = [
    ...new Set(scope.transactions.map((t) => t.account)),
  ].sort();
  const shown = rows.filter((t) => Number(t.date.slice(8)) <= visibleDay);
  const filtered = shown.filter(
    (t) =>
      (!day || Number(t.date.slice(8)) === day) &&
      (!merchant || t.merchantId === merchant) &&
      `${t.description} ${merchants[t.merchantId]?.label ?? ""} ${t.account}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const groups = Object.entries(merchants)
    .map(([id, m]) => ({
      id,
      ...m,
      total: spend(shown.filter((t) => t.merchantId === id)),
      count: shown.filter((t) => t.kind === "expense" && t.merchantId === id)
        .length,
    }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.total - a.total);
  const categories = [...new Set(groups.map((g) => g.category))]
    .map((category) => ({
      category,
      total: groups
        .filter((g) => g.category === category)
        .reduce((n, g) => n + g.total, 0),
    }))
    .sort((a, b) => b.total - a.total);
  function selectMonth(m: string) {
    setMonth(m);
    setDay(null);
    setMerchant(null);
    setVisible(daysInMonth(m));
    setPlaying(false);
    setMessage("");
  }
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setVisible((current) => Math.min(days, current + 1));
    }, 350);
    return () => clearInterval(timer);
  }, [playing, days]);
  useEffect(() => {
    if (visibleDay >= days) setPlaying(false);
  }, [visibleDay, days]);
  useEffect(() => {
    if (s.lastSync) {
      setDataset("banklink");
      setAccount("all");
      setMerchant(null);
      setDay(null);
      setVisible(31);
      setPlaying(false);
    }
  }, [s.lastSync]);
  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await task();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const timeline = (
    <div className="sm-timeline">
      <div className="sm-timeline-caption">
        <span>
          {day
            ? `${day} ${label(month)} · ${money(daily[day - 1]?.amount ?? 0)}`
            : "Your daily spending · select a day"}
        </span>
        <div>
          <button
            disabled={busy}
            aria-label={playing ? "Pause playback" : "Replay month"}
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setVisible(1);
                setDay(null);
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
            {playing ? "Pause" : "Replay month"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setVisible(days);
              setDay(null);
              setMerchant(null);
            }}
          >
            <RotateCcw size={14} />
            Full month
          </button>
        </div>
      </div>
      <div
        className="sm-day-scroll"
        onMouseLeave={() => setHoverDay(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setHoverDay(null);
        }}
      >
        <div
          className="sm-day-bars"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(16px,1fr))` }}
        >
          {daily.map((d) => (
            <button
              aria-label={`Day ${d.day}, ${money(d.amount)}`}
              aria-pressed={day === d.day}
              key={d.day}
              onMouseEnter={() => setHoverDay(d.day)}
              onFocus={() => setHoverDay(d.day)}
              className={d.day > visibleDay ? "sm-future" : ""}
              onClick={() => {
                setDay(day === d.day ? null : d.day);
                setVisible(Math.max(visibleDay, d.day));
                setPlaying(false);
                setMerchant(null);
              }}
            >
              <span className="sm-day-height">
                <i
                  style={{
                    height: `${d.amount ? Math.max(5, (d.amount / max) * 100) : 2}%`,
                  }}
                />
              </span>
              <span>{String(d.day).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <section className="sm" aria-label="Spendmap personal finance application">
      <aside className="sm-rail">
        <div className="sm-brand">
          <WalletCards size={23} />
          Spendmap<span>.</span>
        </div>
        <p className="sm-rail-label">Your accounts</p>
        <nav aria-label="Spending accounts">
          <button
            aria-pressed={account === "all"}
            onClick={() => {
              setAccount("all");
              setDay(null);
              setMerchant(null);
            }}
          >
            All accounts<small>{accounts.length} accounts</small>
          </button>
          {accounts.map((a) => (
            <button
              key={a}
              aria-pressed={account === a}
              onClick={() => {
                setAccount(a);
                setDay(null);
                setMerchant(null);
              }}
            >
              {a}
            </button>
          ))}
        </nav>
        <div className="sm-rail-footer">
          <span>
            {dataset === "sample"
              ? "Fictional spending data"
              : "Synthetic BankLink sandbox data"}
          </span>
        </div>
      </aside>
      <div className="sm-workspace">
        <header className="sm-topline">
          <div>
            <h2>Your month, made clear.</h2>
            <p>Get to know where your money goes.</p>
          </div>
          <span className="sm-mode">
            {dataset === "sample" ? "Example account" : "BankLink sandbox"}
          </span>
          {signOut && <button onClick={signOut}>Sign out</button>}
        </header>
        <div className="sm-controls">
          <label className="sm-sr-only" htmlFor="sm-period">
            Month
          </label>
          <select
            id="sm-period"
            aria-label="Select month"
            value={month}
            onChange={(e) => selectMonth(e.target.value)}
          >
            {months.length ? (
              months.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))
            ) : (
              <option value={month}>{label(month)}</option>
            )}
          </select>
          <div className="sm-view-tabs" aria-label="Spending views">
            {[
              { name: "Graph", label: "Spending", Icon: ChartPie },
              { name: "Calendar", label: "Calendar", Icon: CalendarDays },
              { name: "Transactions", label: "Activity", Icon: List },
            ].map(({ name, label: viewLabel, Icon }) => (
              <button
                key={name}
                aria-pressed={view === name}
                onClick={() => setView(name)}
              >
                <Icon size={14} />
                {viewLabel}
              </button>
            ))}
          </div>
          {sync && <button
            className="sm-sync"
            disabled={busy}
            onClick={() =>
              run(
                sync,
                s.mode === "sample"
                  ? "Your example transactions are ready. The setup guide explains how to connect a sandbox account."
                  : "BankLink sandbox import complete.",
              )
            }
          >
            <RefreshCw size={14} />
            {busy ? "Updating…" : "Refresh accounts"}
          </button>}

        </div>
        {s.mode === "sandbox" && (
          <div className="sm-dataset">
            <label>
              Show transactions
              <select
                aria-label="Transactions"
                value={dataset}
                onChange={(e) => {
                  setDataset(e.target.value as "sample" | "banklink");
                  setAccount("all");
                  setDay(null);
                  setMerchant(null);
                  setPlaying(false);
                  setVisible(31);
                }}
              >
                <option value="sample">Fictional sample transactions</option>
                <option value="banklink">BankLink sandbox imports</option>
              </select>
            </label>
            <span>
              {s.lastSync
                ? "Updated " + new Date(s.lastSync).toLocaleString("en-ZA")
                : "No sandbox import yet"}
            </span>
          </div>
        )}
        <div className="sm-feedback" aria-live="polite">
          {message && (
            <p>
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={14} />
              </button>
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="sm-error">
            {error}
          </p>
        )}
        <div className="sm-summary">
          <div>
            <span>
              {label(month)} · spending
              {visibleDay < days ? ` through day ${visibleDay}` : ""}
            </span>
            <strong>{money(spend(shown))}</strong>
          </div>
          <p>
            {shown.filter((t) => t.kind === "expense").length} purchases this month
          </p>
        </div>
        <div className="sm-months" aria-label="Months">
          {months.map((m) => (
            <button
              key={m}
              aria-pressed={month === m}
              onClick={() => selectMonth(m)}
            >
              {label(m, true)}
              <small>{m.slice(0, 4)}</small>
            </button>
          ))}
        </div>
        {view === "Graph" && (
          <>
            <SpendingGraph
              transactions={rows}
              visibleDay={visibleDay}
              focusedDay={hoverDay ?? day}
              onMerchant={(id) => {
                setMerchant(id);
                setDay(null);
              }}
            />
            {timeline}
          </>
        )}
        {view === "Calendar" && (
          <>
            <div className="sm-calendar">
              <div className="sm-weekdays">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="sm-calendar-days">
                {Array.from(
                  {
                    length:
                      (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7,
                  },
                  (_, i) => (
                    <span key={"blank" + i} />
                  ),
                )}
                {daily.map((d) => (
                  <button
                    key={d.day}
                    aria-label={`Calendar day ${d.day}, ${money(d.amount)}`}
                    aria-pressed={day === d.day}
                    onClick={() => {
                      setDay(day === d.day ? null : d.day);
                      setVisible(days);
                      setPlaying(false);
                      setMerchant(null);
                    }}
                  >
                    <span>{d.day}</span>
                    <strong>{money(d.amount)}</strong>
                    <small>
                      {
                        rows.filter(
                          (t) =>
                            t.kind === "expense" &&
                            Number(t.date.slice(8)) === d.day,
                        ).length
                      }{" "}
                      purchases
                    </small>
                  </button>
                ))}
              </div>
            </div>
            {timeline}
          </>
        )}
        <div className="sm-details">
          <section className="sm-transactions">
            <div className="sm-section-title">
              <div>
                <h3>
                  {merchant
                    ? merchants[merchant]?.label
                    : day
                      ? `Transactions · day ${day}`
                      : "Your transactions"}
                </h3>
                <p>{filtered.length} transactions shown</p>
              </div>
              <div>
                {(day || merchant) && (
                  <button
                    onClick={() => {
                      setDay(null);
                      setMerchant(null);
                    }}
                  >
                    Show all transactions
                  </button>
                )}
                <button onClick={() => download(filtered)}>Download CSV</button>
              </div>
            </div>
            <label className="sm-search">
              <Search size={15} />
              <input
                aria-label="Search transactions"
                placeholder="Find a merchant or transaction"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="sm-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date / merchant</th>
                    <th>Account / type</th>
                    <th className="sm-number">Amount</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span>{merchants[t.merchantId]?.label ?? "Other"}</span>
                        <small>
                          {t.date} · {t.description}
                        </small>
                      </td>
                      <td>
                        {t.account}
                        <small>{t.kind}</small>
                      </td>
                      <td className="sm-number">{money(t.amount)}</td>
                      <td>
                        <select
                          aria-label={"Merchant for " + t.description}
                          value={t.merchantId}
                          disabled={busy}
                          onChange={(e) => {
                            const merchantId = e.target.value;
                            void run(
                              () =>
                                dispatch({
                                  type: "classify",
                                  id: t.id,
                                  kind: t.kind,
                                  merchantId,
                                }),
                              "Merchant updated.",
                            );
                          }}
                        >
                          {Object.entries(merchants).map(([id, m]) => (
                            <option key={id} value={id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <label className="sm-sr-only" htmlFor={"type-" + t.id}>
                          Type for {t.description}
                        </label>
                        <select
                          id={"type-" + t.id}
                          aria-label={"Type for " + t.description}
                          value={t.kind}
                          disabled={busy}
                          onChange={(e) => {
                            const kind = e.target.value as
                              "expense" | "income" | "transfer";
                            void run(
                              () =>
                                dispatch({
                                  type: "classify",
                                  id: t.id,
                                  kind,
                                  merchantId: t.merchantId,
                                }),
                              "Transaction type updated.",
                            );
                          }}
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="sm-empty">
                  No transactions match this view. Try another month, account or
                  search.
                </div>
              )}
            </div>
          </section>
          <aside className="sm-breakdown">
            <h3>Where it went</h3>
            <p>Your spending by category</p>
            {categories.map((c) => (
              <div className="sm-category" key={c.category}>
                <span>{c.category}</span>
                <strong>{money(c.total)}</strong>
                <i
                  style={{
                    width: `${Math.max(2, (c.total / Math.max(spend(shown), 1)) * 100)}%`,
                  }}
                />
              </div>
            ))}
            <h3 className="sm-merchants-heading">Places you visited</h3>
            <div className="sm-merchant-list">
              {groups.map((g) => (
                <button
                  key={g.id}
                  aria-pressed={merchant === g.id}
                  onClick={() => {
                    setMerchant(merchant === g.id ? null : g.id);
                    setDay(null);
                  }}
                >
                  {g.logo ? (
                    <img src={g.logo} alt="" loading="lazy" />
                  ) : (
                    <span className="sm-initials">{g.mark}</span>
                  )}
                  <span>
                    {g.label}
                    <small>{g.count} purchases</small>
                  </span>
                  <strong>{money(g.total)}</strong>
                </button>
              ))}
            </div>
          </aside>
        </div>
        <footer className="sm-footer">
          {reset && (
            <button
              onClick={() => {
                reset();
                setDataset("sample");
                setAccount("all");
                selectMonth("2026-04");
              }}
            >
              Reset demo
            </button>
          )}
          <span>
            Spending totals exclude income and transfers. Categories are suggestions you can review.
          </span>
        </footer>
      </div>
    </section>
  );
}
