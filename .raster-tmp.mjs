import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const svg = readFileSync(process.argv[2], "utf8");
const r = new Resvg(svg, { fitTo: { mode: "width", value: Number(process.argv[4] ?? 1100) } });
writeFileSync(process.argv[3], r.render().asPng());
console.log("ok");
