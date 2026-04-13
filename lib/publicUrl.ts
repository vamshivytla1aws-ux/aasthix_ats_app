function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getPublicBaseUrl() {
  return normalizeBaseUrl(process.env.APP_PUBLIC_URL) || "http://localhost:3000";
}

export function buildPublicUrl(path: string) {
  const base = getPublicBaseUrl();
  return new URL(path, `${base}/`).toString();
}

