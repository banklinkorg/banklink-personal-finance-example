import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("secrets", { recursive: true, mode: 0o700 });
if (existsSync("secrets/app-password")) {
  console.log("Application password already exists; left unchanged.");
} else {
  writeFileSync("secrets/app-password", randomBytes(24).toString("base64url"), {
    mode: 0o644,
    flag: "wx",
  });
  console.log(
    "Created secrets/app-password. Read this file locally to sign in.",
  );
}
