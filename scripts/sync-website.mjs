import { copyFileSync, cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const repo = process.argv[2];
if (!repo || !existsSync(join(repo, "banklink/website/package.json")))
  throw new Error("Pass the Aurvex checkout path.");
const target = resolve(
  repo,
  "banklink/website/src/components/examples/personal-finance",
);
mkdirSync(target, { recursive: true });
for (const file of [
  "SpendmapApp.tsx",
  "SpendingGraph.tsx",
  "model.ts",
  "merchants.ts",
  "spendmap.css",
])
  copyFileSync(resolve("shared", file), join(target, file));
cpSync(
  resolve("public/personal-finance"),
  join(repo, "banklink/website/public/personal-finance"),
  { recursive: true },
);
console.log("Synchronized Spendmap interface, model and local merchant icons.");
