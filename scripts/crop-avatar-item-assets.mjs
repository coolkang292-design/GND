import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

execFileSync(
  "python",
  [resolve(process.cwd(), "scripts/crop-avatar-item-assets.py")],
  { stdio: "inherit" },
);
