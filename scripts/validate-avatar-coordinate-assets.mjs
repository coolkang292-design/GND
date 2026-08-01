import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

execFileSync(
  "python",
  [resolve(process.cwd(), "scripts/validate-avatar-coordinate-assets.py")],
  { stdio: "inherit" },
);
