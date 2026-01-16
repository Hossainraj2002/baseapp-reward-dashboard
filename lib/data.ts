import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export function readJson<T>(filename: string): T {
  const p = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as T;
}
