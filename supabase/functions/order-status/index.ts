import {body,fields,uuid,customer,database,endpoint,settings,serve,PaymentError} from '../_shared/payment.ts';
import type {Settings} from '../_shared/payment.ts';
export function createHandler(s:Settings,send:typeof fetch=fetch) {
 const db=database(s,send);
 return endpoint(s,async req=>{const user=await customer(req,s,send);const v=await body(req);fields(v,['order_id']);
 if(!uuid(v.order_id))throw new PaymentError(400,'invalid_identifier');
 return db('customer_payment_status',{p_order:v.order_id,p_user:user});});
}
serve((import.meta as any).main,createHandler(settings()));
