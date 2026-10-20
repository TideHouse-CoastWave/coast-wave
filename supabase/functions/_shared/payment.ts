// Native APIs only; privileged database requests never inherit caller headers.
export class PaymentError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), v => v.toString(16).padStart(2, '0')).join('');
export const digest = async (v: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
export async function equal(a: string, b: string) {
  const x = await digest(a), y = await digest(b);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
export async function body(req: Request, limit = 8192): Promise<Record<string, unknown>> {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new PaymentError(415, 'json_required');
  if (!req.body) throw new PaymentError(400, 'invalid_json');
  const reader = req.body.getReader(); let size = 0; const parts: Uint8Array[] = [];
  try {
    while (true) { const {done, value} = await reader.read(); if (done) break;
      size += value.length; if (size > limit) { await reader.cancel(); throw new PaymentError(413, 'body_too_large'); } parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  try { const v = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v;
  } catch { throw new PaymentError(400, 'invalid_json'); }
}
export function fields(v: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(k => !(k in v)) || Object.keys(v).some(k => !required.includes(k) && !optional.includes(k))) throw new PaymentError(400, 'invalid_fields');
}
export type Settings = { url: string; key: string; origins: string[]; [key: string]: any };
export function settings(): Settings {
  const env = (globalThis as any).Deno?.env;
  const get = (n: string) => env?.get(n) ?? '';
  return { url:get('SUPABASE_URL'), key:get('SUPABASE_SERVICE_ROLE_KEY'), origins:get('ALLOWED_ORIGINS').split(',').map((v:string)=>v.trim()).filter(Boolean),
    maxQuantity:Number(get('ORDER_MAX_QUANTITY') || '1'), accessTtl:Number(get('CUSTOMER_ORDER_ACCESS_TTL_SECONDS')), paymentTtl:Number(get('ORDER_RESERVATION_TTL_SECONDS')),
    network:get('NCBA_NETWORK_ENABLED') === 'true', approved:get('NCBA_SANDBOX_APPROVED') === 'true',
    base:get('NCBA_SANDBOX_BASE_URL'), username:get('NCBA_API_USERNAME'), password:get('NCBA_API_PASSWORD'),
    paybill:get('NCBA_PAYBILL'), account:get('NCBA_ACCOUNT_NO'), scope:get('NCBA_MERCHANT_SCOPE'),
    acceptedCode:get('NCBA_CONFIRMED_ACCEPTED_CODE'), contract:get('NCBA_INITIATION_CONTRACT_CONFIRMED') === 'true',
    notificationUser:get('NCBA_NOTIFICATION_USERNAME'), notificationPassword:get('NCBA_NOTIFICATION_PASSWORD'),
    notificationSecret:get('NCBA_NOTIFICATION_SECRET'), hashConfirmed:get('NCBA_NOTIFICATION_HASH_CONFIRMED') === 'true',
    workerSecret:get('PAYMENT_WORKER_SECRET') };
}
export function database(s: Settings, send: typeof fetch = fetch) {
  return async (name: string, input: Record<string, unknown>) => {
    if (!s.url || !s.key) throw new PaymentError(503, 'database_unconfigured');
    const r = await send(`${s.url.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {method:'POST', redirect:'error',
      headers:{'content-type':'application/json', apikey:s.key, Authorization:`Bearer ${s.key}`},
      body:JSON.stringify(input), signal:AbortSignal.timeout(10000)});
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      const codes: Record<string, [number,string]> = {CP001:[403,'order_access_denied'], CP002:[409,'payment_conflict'], CP003:[409,'verification_required'],CP004:[503,'ncba_disabled'],CP005:[503,'database_isolation_unsupported'],CW001:[409,'idempotency_conflict'],CW002:[404,'ticket_not_found'],CW003:[409,'ticket_unavailable'],CW004:[400,'invalid_input'],CW005:[409,'ticket_price_unavailable']};
      const [status, code] = codes[e.code] ?? [503,'payment_store_unavailable']; throw new PaymentError(status,code);
    }
    return r.json();
  };
}
export async function customer(req: Request, s: Settings, send: typeof fetch = fetch) {
  const token = req.headers.get('authorization');
  if (!token?.startsWith('Bearer ') || token === `Bearer ${s.key}`) throw new PaymentError(401,'customer_auth_required');
  const r = await send(`${s.url.replace(/\/$/,'')}/auth/v1/user`, {headers:{apikey:s.key, Authorization:token}, redirect:'error', signal:AbortSignal.timeout(10000)});
  if (!r.ok) throw new PaymentError(401,'customer_auth_required');
  const user = await r.json(); if (!uuid(user.id)) throw new PaymentError(401,'customer_auth_required'); return user.id;
}
export function endpoint(s: Settings, work: (r:Request)=>Promise<unknown>, bank = false) {
  return async (req: Request) => {
    const origin = req.headers.get('origin');
    const headers: Record<string,string> = {'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
    if (!bank && origin && s.origins.includes(origin)) Object.assign(headers, {'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, apikey, content-type, x-client-info'});
    try {
      if (!bank && (!origin || !s.origins.includes(origin))) throw new PaymentError(403,'origin_not_allowed');
      if (!bank && req.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (req.method !== 'POST') throw new PaymentError(405,'post_required');
      return Response.json(await work(req), {status:200,headers});
    } catch (e) {
      const known = e instanceof PaymentError;
      return Response.json(bank ? {ResultCode:'1',ResultDesc:known ? e.message : 'temporarily_unavailable'} : {error:known ? e.message : 'temporarily_unavailable'}, {status:known ? e.status : 503,headers});
    }
  };
}
export function serve(main: boolean | undefined, handler: (r:Request)=>Promise<Response>) {
  if (main) { const d = (globalThis as any).Deno; if (!d) throw new Error('Deno required'); d.serve(handler); }
}
