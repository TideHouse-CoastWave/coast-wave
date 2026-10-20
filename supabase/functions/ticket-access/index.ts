import {body,fields,uuid,customer,database,digest,endpoint,settings,serve,PaymentError} from '../_shared/payment.ts';
import type {Settings} from '../_shared/payment.ts';
export function credential() {return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
export function createHandler(s:Settings,send:typeof fetch=fetch) {
 const db=database(s,send);
 return endpoint(s,async req=>{const user=await customer(req,s,send);const v=await body(req);fields(v,['order_id'],['ticket_id']);
 if(!uuid(v.order_id)||(v.ticket_id!==undefined&&!uuid(v.ticket_id)))throw new PaymentError(400,'invalid_identifier');
 if(!v.ticket_id)return {tickets:await db('list_customer_tickets',{p_order:v.order_id,p_user:user})};
 const token=credential();
 const result=await db('retrieve_customer_ticket',{p_order:v.order_id,p_user:user,p_ticket:v.ticket_id,p_hash:await digest(token)});
 // This is the QR encoding payload, not a payment QR. Retrieval rotates the
 // same admission credential: previous copies become invalid, never new tickets.
 return {...result,qr_payload:`cw-ticket:v1:${v.ticket_id}:${token}`};});
}
serve((import.meta as any).main,createHandler(settings()));
