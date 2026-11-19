import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  applyAction,
  seed,
  type State,
  type Transaction,
} from "../shared/model.js";
export type Config = {
  dbPath: string;
  password: string;
  origin: string;
  secure: boolean;
  sandbox?: () => Promise<Transaction[]>;
};
const actionSchema = z.object({
  type: z.literal("classify"),
  id: z.string().min(1).max(500),
  kind: z.enum(["expense", "income", "transfer"]),
  merchantId: z.string().min(1).max(100),
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function createApp(config: Config) {
  if (config.password.length < 16)
    throw new Error("The app password must have at least 16 characters.");
  const app = express();
  app.disable("x-powered-by");
  const db = new DatabaseSync(config.dbPath);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profile(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO profile(id,data) VALUES(1,?)").run(
    JSON.stringify(seed()),
  );
  const salt = randomBytes(32);
  const passwordHash = scryptSync(config.password, salt, 64);
  const read = () =>
    JSON.parse(
      (
        db.prepare("SELECT data FROM profile WHERE id=1").get() as {
          data: string;
        }
      ).data,
    ) as State;
  const save = (s: State, action: string) => {
    s.audit = [...s.audit, { date: new Date().toISOString(), action }].slice(
      -1000,
    );
    db.prepare("UPDATE profile SET data=? WHERE id=1").run(JSON.stringify(s));
  };
  app.use(
    helmet({
      strictTransportSecurity: config.secure ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "upgrade-insecure-requests": config.secure ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  // Explicit same-origin checks protect state changes, including login, from CSRF.
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== config.origin
    ) {
      res
        .status(403)
        .json({ error: "Open this application from its configured origin." });
      return;
    }
    next();
  });
  const sessionId = (req: express.Request) => {
    const raw = req
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("spendmap_session="))
      ?.slice("spendmap_session=".length);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? hash(raw) : "";
  };
  const auth = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const session = db
      .prepare("SELECT expires FROM sessions WHERE hash=?")
      .get(sessionId(req)) as { expires: number } | undefined;
    if (!session || session.expires < Date.now()) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    next();
  };
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many attempts. Try again in 15 minutes." },
    }),
    (req, res) => {
      const input = z
        .object({ password: z.string().max(256) })
        .safeParse(req.body);
      if (
        !input.success ||
        !timingSafeEqual(
          scryptSync(input.data.password, salt, 64),
          passwordHash,
        )
      ) {
        res.status(401).json({ error: "That password was not recognised." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires < ? OR hash=?").run(
        Date.now(),
        sessionId(req),
      );
      db.prepare("INSERT INTO sessions(hash,expires) VALUES(?,?)").run(
        hash(token),
        Date.now() + 8 * 60 * 60 * 1000,
      );
      res.cookie("spendmap_session", token, {
        httpOnly: true,
        secure: config.secure,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/",
      });
      res.json({ ok: true });
    },
  );
  app.use("/api", auth);
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE hash=?").run(sessionId(req));
    res.clearCookie("spendmap_session", {
      path: "/",
      httpOnly: true,
      secure: config.secure,
      sameSite: "strict",
    });
    res.json({ ok: true });
  });
  app.get("/api/state", (_req, res) =>
    res.json({ ...read(), mode: config.sandbox ? "sandbox" : "sample" }),
  );
  app.post("/api/actions", (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Choose a transaction type and merchant." });
      return;
    }
    try {
      const s = applyAction(read(), parsed.data);
      save(s, `Classified transaction ${parsed.data.id}`);
      res.json({ ok: true });
    } catch (e) {
      res
        .status(409)
        .json({ error: e instanceof Error ? e.message : "Unable to save." });
    }
  });
  let importing = false;
  app.post(
    "/api/sync",
    rateLimit({
      windowMs: 60000,
      limit: 3,
      message: { error: "Wait a minute before updating again." },
    }),
    async (_req, res) => {
      if (!config.sandbox) {
        res.json({ imported: 0, mode: "sample" });
        return;
      }
      if (importing) {
        res.status(409).json({ error: "An import is already running." });
        return;
      }
      importing = true;
      try {
        const imported = await config.sandbox();
        const s = read();
        const ids = new Set(s.transactions.map((t) => t.id));
        let count = 0;
        for (const t of imported)
          if (!ids.has(t.id)) {
            s.transactions.push(t);
            ids.add(t.id);
            count++;
          }
        s.lastSync = new Date().toISOString();
        s.mode = "sandbox";
        save(s, `Imported ${count} sandbox transactions`);
        res.json({ imported: count });
      } catch {
        res.status(502).json({
          error:
            "Sandbox import failed. Check the server test key and its link, account-read, transaction-read and sync scopes, then try again.",
        });
      } finally {
        importing = false;
      }
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    res
      .status(
        err?.type === "entity.parse.failed" || err?.type === "entity.too.large"
          ? 400
          : 500,
      )
      .json({ error: "Request could not be processed." });
  };
  app.use(errors);
  return { app, db, read };
}
