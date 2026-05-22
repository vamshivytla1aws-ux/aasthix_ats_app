export function resolveCallCorrelationId(input: {
  correlationHeader?: string | null;
  idempotencyHeader?: string | null;
}) {
  const correlation = String(input.correlationHeader || "").trim();
  if (correlation) return correlation.slice(0, 120);
  const idempotency = String(input.idempotencyHeader || "").trim();
  if (idempotency) return idempotency.slice(0, 120);
  return `call-${Date.now()}`;
}

