// No caller Authorization header is forwarded to the privileged database client.
// Deployment and the accompanying review-only SQL migration require approval.
type Settings = {
  supabaseUrl: string;
  serviceKey: string;
  origins: string[];
  maxQuantity: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["customer_name", "customer_email", "customer_phone", "ticket_id", "quantity", "idempotency_key"];
const MAX_BODY_BYTES = 4096;

class RequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

async function readBody(req: Request): Promise<unknown> {
  if (!req.body) throw new RequestError(400, "invalid_json");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "request_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestError(400, "invalid_json"); }
}

export function normalize(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError(400, "invalid_input");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !FIELDS.includes(key)) || FIELDS.some((key) => !(key in input))) {
    throw new RequestError(400, "unexpected_or_missing_fields");
  }
  for (const field of FIELDS.filter((key) => key !== "quantity")) {
    if (typeof input[field] !== "string") throw new RequestError(400, "invalid_input");
  }
  const name = (input.customer_name as string).trim();
  const email = (input.customer_email as string).trim().toLowerCase();
  const phone = (input.customer_phone as string).trim().replace(/[ ()\-]/g, "");
  const normalizedPhone = phone.replace(/^\+254/, "254").replace(/^0(?=[17])/, "254");
  if (name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new RequestError(400, "invalid_name");
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) throw new RequestError(400, "invalid_email");
  if (!/^254[17]\d{8}$/.test(normalizedPhone)) throw new RequestError(400, "invalid_phone");
  if (!UUID.test(input.ticket_id as string) || !UUID.test(input.idempotency_key as string)) throw new RequestError(400, "invalid_identifier");
  // Validate the absolute input bound here. The RPC applies the current business
  // limit only to new orders, allowing committed requests to replay after a cut.
  if (!Number.isSafeInteger(input.quantity) || (input.quantity as number) < 1 || (input.quantity as number) > 100) {
    throw new RequestError(400, "invalid_quantity");
  }
  return {
    customer_name: name, customer_email: email, customer_phone: normalizedPhone,
    ticket_id: (input.ticket_id as string).toLowerCase(), quantity: input.quantity as number,
    idempotency_key: (input.idempotency_key as string).toLowerCase(),
  };
}

// Exported for offline tests. Production settings come exclusively from server env.
export function createHandler(settings: Settings, send: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const origin = req.headers.get("origin");
    const allowed = origin !== null && settings.origins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
      "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId,
    };
    if (allowed) {
      headers["Access-Control-Allow-Origin"] = origin!;
      headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    }
    const respond = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
    try {
      // Missing/invalid configuration fails closed, including malformed origins.
      if (!settings.supabaseUrl || !settings.serviceKey || !settings.origins.length ||
          !Number.isSafeInteger(settings.maxQuantity) || settings.maxQuantity < 1 || settings.maxQuantity > 100 ||
          settings.origins.some((value) => { try { return new URL(value).origin !== value || value === "null"; } catch { return true; } })) {
        throw new RequestError(503, "service_unavailable");
      }
      if (!allowed) throw new RequestError(403, "origin_not_allowed");
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (req.method !== "POST") { headers.Allow = "POST, OPTIONS"; throw new RequestError(405, "method_not_allowed"); }
      if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError(415, "json_required");
      const input = normalize(await readBody(req));
      // This RPC loads/locks the ticket using service-role credentials, derives
      // integer KES amounts, and commits order + idempotency result atomically.
      const result = await send(`${settings.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/create_pending_order_secure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": settings.serviceKey, "Authorization": `Bearer ${settings.serviceKey}` },
        body: JSON.stringify({ p_input: input, p_max_quantity: settings.maxQuantity }),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) {
        // Never log/return PostgreSQL details, response bodies, names or secrets.
        const error = await result.json().catch(() => ({}));
        const mapped: Record<string, [number, string]> = {
          CW001: [409, "idempotency_conflict"], CW002: [404, "ticket_not_found"],
          CW003: [409, "ticket_unavailable"], CW004: [400, "invalid_input"],
          CW005: [409, "ticket_price_unavailable"],
        };
        const [status, code] = mapped[error.code] ?? [503, "order_creation_unavailable"];
        throw new RequestError(status, code);
      }
      const data = await result.json();
      if (!data || !UUID.test(data.order_id) || !Number.isSafeInteger(data.total_amount) || data.total_amount < 1 ||
          !Number.isSafeInteger(data.quantity) || data.quantity !== input.quantity || data.currency !== "KES" ||
          data.payment_status !== "pending" || typeof data.replayed !== "boolean") {
        throw new RequestError(503, "order_creation_unavailable");
      }
      return respond(data.replayed ? 200 : 201, {
        order_id: data.order_id, quantity: data.quantity, total_amount: data.total_amount,
        currency: "KES", payment_status: "pending",
      });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 503;
      const code = error instanceof RequestError ? error.code : "order_creation_unavailable";
      if (status >= 500) console.error(JSON.stringify({ event: "create_order_failed", request_id: requestId, code }));
      return respond(status, { error: code, request_id: requestId });
    }
  };
}

// Type only the runtime boundary used here. This keeps the module checkable by
// VS Code's standard TypeScript service and importable by offline Node tests
// without installing Deno types or declaring misleading project-wide globals.
// These types do not provide/polyfill Deno; execution still requires its runtime.
type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};
const runtime = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
const entrypoint = (import.meta as ImportMeta & { readonly main?: boolean }).main;

if (entrypoint) {
  if (!runtime) throw new Error("create-order requires the Deno Edge Function runtime");
  runtime.serve(createHandler({
    supabaseUrl: runtime.env.get("SUPABASE_URL") ?? "",
    serviceKey: runtime.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    origins: (runtime.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    // Default preserves the current one-ticket checkout until a limit is approved.
    maxQuantity: Number(runtime.env.get("ORDER_MAX_QUANTITY") ?? "1"),
  }));
}
