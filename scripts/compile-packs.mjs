import { rm } from "node:fs/promises";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const dest = "public/packs/macros";
await rm(dest, { recursive: true, force: true });
await compilePack("packs/_source/macros", dest);
console.log("packs compiled →", dest);
