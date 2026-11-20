import { useEffect, useMemo, useRef, useState } from "react";
import type ForceGraph from "force-graph";
import type { NodeObject, LinkObject } from "force-graph";
import { merchants } from "./merchants";
import { money, type Transaction } from "./model";
type Node = NodeObject & {
  id: string;
  type: "hub" | "account" | "merchant";
  label: string;
  days: number[];
  merchantId?: string;
  amount: number;
  color: string;
};
type Link = LinkObject<Node> & { days: number[] };
type Props = {
  transactions: Transaction[];
  visibleDay: number;
  focusedDay: number | null;
  onMerchant: (id: string) => void;
};
/** Adapted from the canvas/force-graph renderer in the user's local Spendmap prototype. */
export function SpendingGraph({
  transactions,
  visibleDay,
  focusedDay,
  onMerchant,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraph<Node, Link> | null>(null);
  const images = useRef<Record<string, HTMLImageElement>>({});
  const latest = useRef({ visibleDay, focusedDay, onMerchant });
  latest.current = { visibleDay, focusedDay, onMerchant };
  const [hover, setHover] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const data = useMemo(() => {
    const events = transactions.filter((t) => t.kind === "expense");
    const nodes: Node[] = [
      {
        id: "hub",
        type: "hub",
        label: "You",
        days: events.map((t) => Number(t.date.slice(8))),
        amount: 0,
        color: "#a44e32",
      },
    ];
    const links: Link[] = [];
    for (const account of new Set(events.map((t) => t.account))) {
      const rows = events.filter((t) => t.account === account);
      nodes.push({
        id: "account:" + account,
        type: "account",
        label: account,
        days: rows.map((t) => Number(t.date.slice(8))),
        amount: 0,
        color: "#b87152",
      });
      links.push({
        source: "hub",
        target: "account:" + account,
        days: rows.map((t) => Number(t.date.slice(8))),
      });
    }
    for (const id of new Set(events.map((t) => t.merchantId))) {
      const rows = events.filter((t) => t.merchantId === id);
      const m = merchants[id] ?? merchants.other;
      nodes.push({
        id: "merchant:" + id,
        type: "merchant",
        merchantId: id,
        label: m.label,
        days: rows.map((t) => Number(t.date.slice(8))),
        amount: rows.reduce((n, t) => n + t.amount, 0),
        color: m.color,
      });
      for (const account of new Set(rows.map((t) => t.account)))
        links.push({
          source: "account:" + account,
          target: "merchant:" + id,
          days: rows
            .filter((t) => t.account === account)
            .map((t) => Number(t.date.slice(8))),
        });
    }
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodes.length - 1, 1)) * Math.PI * 2;
      const r = node.type === "hub" ? 0 : node.type === "account" ? 90 : 210;
      node.x = Math.cos(angle) * r;
      node.y = Math.sin(angle) * r;
    });
    return { nodes, links };
  }, [transactions]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const repaint = () =>
    graph.current?.nodeCanvasObject(graph.current.nodeCanvasObject());
  useEffect(() => {
    repaint();
  }, [visibleDay, focusedDay]);
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const el = host.current;
    void import("force-graph")
      .then(({ default: Constructor }) => {
        if (disposed) return;
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const visible = (days: number[]) =>
          days.some((d) => d <= latest.current.visibleDay);
        const radius = (n: Node) =>
          n.type === "hub"
            ? 18
            : n.type === "account"
              ? 6
              : 13 +
                Math.min(
                  17,
                  n.days.filter((d) => d <= latest.current.visibleDay).length *
                    2.6,
                );
        const draw = (n: Node, c: CanvasRenderingContext2D, scale: number) => {
          if (n.x === undefined || n.y === undefined || !visible(n.days))
            return;
          const m = n.merchantId ? merchants[n.merchantId] : undefined;
          const r = radius(n);
          c.save();
          c.globalAlpha =
            latest.current.focusedDay &&
            !n.days.includes(latest.current.focusedDay)
              ? 0.13
              : 1;
          c.beginPath();
          c.arc(n.x, n.y, r, 0, Math.PI * 2);
          c.fillStyle = n.type === "merchant" ? "#ffffff" : n.color;
          c.fill();
          c.strokeStyle = n.type === "merchant" ? "#d8c9b9" : n.color;
          c.lineWidth = 1;
          c.stroke();
          if (m) {
            const image = images.current[n.merchantId!];
            c.save();
            c.beginPath();
            c.arc(n.x, n.y, r - 1, 0, Math.PI * 2);
            c.clip();
            if (image?.complete && image.naturalWidth) {
              const ratio = image.naturalWidth / image.naturalHeight;
              const w = ratio >= 1 ? r * 1.7 : r * 1.7 * ratio;
              const h = ratio >= 1 ? (r * 1.7) / ratio : r * 1.7;
              c.drawImage(image, n.x - w / 2, n.y - h / 2, w, h);
            } else {
              c.fillStyle = "#6f3524";
              c.font = `600 ${Math.max(9, r * 0.55)}px "Red Hat Text Variable", "Red Hat Text", Arial, sans-serif`;
              c.textAlign = "center";
              c.textBaseline = "middle";
              c.fillText(m.mark, n.x, n.y);
            }
            c.restore();
          }
          if (n.type === "hub") {
            c.fillStyle = "#ffffff";
            c.font = '600 12px "Red Hat Text Variable", Arial, sans-serif';
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText("You", n.x, n.y);
          }
          if (n.type === "account" || (n.type === "merchant" && scale > .5)) {
            c.fillStyle = "#5f5147";
            c.font =
              '12px "Red Hat Text Variable", "Red Hat Text", Arial, sans-serif';
            c.textAlign = "left";
            c.fillText(n.label, n.x + r + 7, n.y + 4);
          }
          c.restore();
        };
        const g = new Constructor<Node, Link>(el)
          .backgroundColor("transparent")
          .width(el.clientWidth)
          .height(el.clientHeight)
          .nodeId("id")
          .nodeLabel(() => "")
          .nodeCanvasObject(draw)
          .nodeCanvasObjectMode(() => "replace")
          .nodeVal((n) => radius(n))
          .nodeVisibility((n) => visible(n.days))
          .linkVisibility((l) => visible(l.days))
          .linkColor((l) =>
            latest.current.focusedDay &&
            !l.days.includes(latest.current.focusedDay)
              ? "#d8c9b925"
              : "#bda38b80",
          )
          .linkWidth(0.8)
          .nodePointerAreaPaint((n, color, c) => {
            if (!visible(n.days) || n.x === undefined || n.y === undefined)
              return;
            c.fillStyle = color;
            c.beginPath();
            c.arc(n.x, n.y, radius(n) + 4, 0, Math.PI * 2);
            c.fill();
          })
          .onNodeHover((n) =>
            setHover(n?.type === "merchant" ? (n.merchantId ?? null) : null),
          )
          .onNodeClick((n) => {
            if (n.merchantId) latest.current.onMerchant(n.merchantId);
          })
          .cooldownTicks(reduced ? 0 : 45)
          .warmupTicks(reduced ? 100 : 30)
          .autoPauseRedraw(true);
        g.d3Force("charge")?.strength(-125);
        g.d3Force("link")?.distance(90);
        g.onEngineStop(() => {
          if (!disposed) g.zoomToFit(0, 55);
        });
        graph.current = g;
        g.graphData(dataRef.current);
        g.centerAt(0, 0, 0).zoom(
          Math.min(el.clientWidth / 660, el.clientHeight / 560),
          0,
        );
        requestAnimationFrame(() => {
          if (!disposed) g.zoomToFit(0, 65);
        });
        for (const [id, m] of Object.entries(merchants)) {
          if (!m.logo) continue;
          const image = new Image();
          image.onload = () => {
            if (!disposed) repaint();
          };
          image.src = m.logo;
          images.current[id] = image;
        }
        observer = new ResizeObserver(() => {
          g.width(el.clientWidth).height(el.clientHeight);
          g.zoomToFit(0, 55);
        });
        observer.observe(el);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      graph.current?._destructor();
      graph.current = null;
    };
  }, []);
  useEffect(() => {
    if (graph.current) {
      graph.current.graphData(data);
      setHover(null);
    }
  }, [data]);
  const hoverRows = transactions.filter(
    (t) =>
      t.merchantId === hover &&
      t.kind === "expense" &&
      Number(t.date.slice(8)) <= visibleDay,
  );
  return (
    <div className="sm-graph">
      <div className="sm-graph-canvas" ref={host} aria-hidden="true" />
      {hover && hoverRows.length > 0 && (
        <div className="sm-graph-note">
          {merchants[hover]?.label}
          <small>
            {money(hoverRows.reduce((n, t) => n + t.amount, 0))} ·{" "}
            {hoverRows.length} transactions shown
          </small>
        </div>
      )}
      <span className="sm-graph-help">
        {error
          ? "Graph unavailable. Use the transaction and category views below."
          : "Select a shop to see what you spent there"}
      </span>
      {transactions.filter((t) => t.kind === "expense").length === 0 && (
        <div className="sm-graph-empty">No spending in this view.</div>
      )}
      <button
        className="sm-fit"
        onClick={() => graph.current?.zoomToFit(0, 55)}
      >
        Show full map
      </button>
    </div>
  );
}
