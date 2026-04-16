import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import pg from "pg";

const { Pool } = pg;

/** @type {import("pg").Pool | null} */
let _pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    });
  }
  return _pool;
}

/** Lazily created so `next build` can load API route modules without DATABASE_URL. */
export const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      const p = getPool();
      const value = Reflect.get(p, prop, p);
      return typeof value === "function" ? value.bind(p) : value;
    },
  }
);

export const query = (text, params) => getPool().query(text, params);
