import type { Pool } from "pg";

/** Lazily created `pg.Pool`; same surface API for callers. */
export const pool: Pool;

export function query(
  text: string,
  params?: unknown[]
): ReturnType<Pool["query"]>;
