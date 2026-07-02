import { rm } from "node:fs/promises";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { ClassicLevel } from "classic-level";

const dest = "public/packs/macros";
await rm(dest, { recursive: true, force: true });
await compilePack("packs/_source/macros", dest);

const db = new ClassicLevel(dest, { valueEncoding: "json" });
let count = 0;
for await (const _key of db.keys()) count++;
await db.close();
if (count !== 2) throw new Error(`compile-packs: expected 2 macros, got ${count}`);
console.log(`packs compiled → ${dest} (${count} macros)`);
