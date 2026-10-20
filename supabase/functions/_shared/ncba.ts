import { PaymentError, digest, equal } from './payment.ts';
import type { Settings } from './payment.ts';
export function networkReady(s: Settings) {
  // The published host is NOT documented as sandbox. Never default to it.
  if (!s.network || !s.approved || !s.contract || !s.base || !s.username || !s.password || !s.paybill || !s.account || !s.scope || !s.acceptedCode) throw new PaymentError(503,'ncba_disabled_or_unconfirmed');
  const u = new URL(s.base);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new PaymentError(503,'invalid_ncba_configuration');
}
export function provider(s: Settings, send: typeof fetch = fetch) {
  async function post(path: string, data: unknown, authorization: string) {
    const r = await send(`${s.base.replace(/\/$/,'')}${path}`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',Authorization:authorization},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new PaymentError(503,'ncba_outcome_unknown'); return r.json();
  }
  async function token() {
    networkReady(s);
    const bytes = new TextEncoder().encode(`${s.username}:${s.password}`);
    const result = await post('/payments/api/v1/auth/token',{},`Basic ${btoa(String.fromCharCode(...bytes))}`);
    if (typeof result.access_token !== 'string' || result.token_type !== 'Bearer' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new PaymentError(503,'ncba_outcome_unknown');
    return `Bearer ${result.access_token}`;
  }
  return {
    async initiate(phone: string, amount: string) {
      if (!/^254[17]\d{8}$/.test(phone) || !/^[1-9]\d{0,9}$/.test(amount) || Number(amount)>2147483647) throw new PaymentError(503,'invalid_stored_payment_values');
      const auth = await token();
      const r = await post('/payments/api/v1/stk-push/initiate',{TelephoneNo:phone,Amount:amount,PayBillNo:s.paybill,AccountNo:s.account,Network:'Safaricom',TransactionType:'CustomerPayBillOnline'},auth);
      if (r.StatusCode === '1' && r.TransactionID === null && r.ReferenceID === null) return {status:'failed', identifiers:{}};
      if (r.StatusCode !== s.acceptedCode || typeof r.TransactionID !== 'string' || !r.TransactionID || typeof r.ReferenceID !== 'string' || !r.ReferenceID) throw new PaymentError(503,'ncba_outcome_unknown');
      return {status:'pending', identifiers:{TransactionID:r.TransactionID,ReferenceID:r.ReferenceID}};
    },
    async query(id: string) { return post('/payments/api/v1/stk-push/query',{TransactionID:id},await token()); }
  };
}
export const notificationKeys = ['TransType','TransID','TransTime','TransAmount','BusinessShortCode','BillRefNumber','Mobile','name','Username','Password','Hash'];
export async function authenticateNotification(v: Record<string,unknown>, s: Settings) {
  if (!s.hashConfirmed || !s.notificationUser || !s.notificationPassword || !s.notificationSecret || !s.paybill || !s.account || !s.scope) throw new PaymentError(503,'notification_contract_unconfirmed');
  if (notificationKeys.some(k => typeof v[k] !== 'string') || Object.values(v).some(x => typeof x !== 'string' || x.length > 512) || Object.keys(v).some(k => ![...notificationKeys,'FTRef','Narrative','created_at'].includes(k))) throw new PaymentError(400,'invalid_notification');
  if (!['TILLNUMBER','PAYBILL','Pay Bill'].includes(v.TransType as string) || !/^[A-Za-z0-9]{1,128}$/.test(v.TransID as string) || !/^\d{14}$/.test(v.TransTime as string) || !/^\d{1,10}(\.\d{1,2})?$/.test(v.TransAmount as string) || Number(v.TransAmount) <= 0) throw new PaymentError(400,'invalid_notification');
  // Preserve exact signed strings: no trimming, amount normalization, or case changes.
  const input = s.notificationSecret + v.TransType + v.TransID + v.TransTime + v.TransAmount + v.BusinessShortCode + v.BillRefNumber + v.Mobile + v.name + '1';
  const expected = btoa(await digest(input));
  const checks = await Promise.all([equal(v.Username as string,s.notificationUser),equal(v.Password as string,s.notificationPassword),equal(v.Hash as string,expected)]);
  if (checks.some(x => !x)) throw new PaymentError(401,'notification_auth_failed');
  if (v.BusinessShortCode !== s.paybill || v.BillRefNumber !== s.account) throw new PaymentError(403,'merchant_mismatch');
  // Only NCBA Till alias profile is supported; other merchant types need their own mapping.
  if (s.paybill !== '880100' || v.TransType !== 'Pay Bill' || typeof v.FTRef !== 'string') throw new PaymentError(400,'unsupported_notification_profile');
  const safe: Record<string,string> = {};
  for (const k of ['TransType','TransID','TransTime','TransAmount','BusinessShortCode','BillRefNumber','Mobile','name']) safe[k] = v[k] as string;
  // Unsigned FTRef/Narrative/created_at deliberately excluded from financial evidence.
  return safe;
}
