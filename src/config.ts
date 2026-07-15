import { config as loadEnv } from "dotenv";

loadEnv();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

export const config = {
  PORT: Number(process.env.PORT ?? 3000),
  BASE_URL: required("BASE_URL").replace(/\/+$/, ""),
  PROPERTY_ID: required("PROPERTY_ID"),
  PUBLIC_KEY: required("PUBLIC_KEY"),
  PRIVATE_KEY: required("PRIVATE_KEY"),
  // Optional: unset means no gate (local dev). Set it anywhere reachable by others.
  ACCESS_TOKEN: (process.env.ACCESS_TOKEN ?? "").trim(),
};
