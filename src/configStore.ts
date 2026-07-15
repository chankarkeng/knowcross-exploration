import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
export const CONFIG_PATH = join(DATA_DIR, "config.json");

export async function saveMasterConfig(data: unknown): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  const payload = {
    fetchedAt: new Date().toISOString(),
    data,
  };
  await writeFile(CONFIG_PATH, JSON.stringify(payload, null, 2));
}

export async function readMasterConfig(): Promise<string | null> {
  try {
    return await readFile(CONFIG_PATH, "utf8");
  } catch {
    return null;
  }
}
