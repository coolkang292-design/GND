import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

execFileSync(
  "python",
  [resolve(process.cwd(), "scripts/build-avatar-thumbnails.py")],
  { stdio: "inherit" },
);
