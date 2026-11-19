import express from "express";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { fetchSandbox } from "./banklink.js";
const secret = (name: string, fallback?: string) => {
  const path = process.env[name] ?? fallback;
  return path ? readFileSync(path, "utf8").trim() : "";
};
const password = secret("APP_PASSWORD_FILE", "./secrets/app-password");
const key = secret("BANKLINK_API_KEY_FILE");
if (key && !key.startsWith("sk_test_"))
  throw new Error("Only BankLink sk_test_ keys may be used by this example.");
const data = process.env.DATA_DIR ?? "./data";
mkdirSync(data, { recursive: true, mode: 0o700 });
const origin = process.env.APP_ORIGIN ?? "http://localhost:3110";
const secure = new URL(origin).protocol === "https:";
if (
  process.env.NODE_ENV === "production" &&
  !secure &&
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
)
  throw new Error("Public deployments require an HTTPS APP_ORIGIN.");
const { app, db } = createApp({
  dbPath: resolve(data, "spendmap.sqlite"),
  password,
  origin,
  secure,
  sandbox: key ? () => fetchSandbox(key) : undefined,
});
app.use(express.static(resolve("dist"), { index: "index.html" }));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(
  Number(process.env.PORT ?? 3110),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Spendmap is ready."),
);
const close = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on("SIGINT", close);
process.on("SIGTERM", close);
