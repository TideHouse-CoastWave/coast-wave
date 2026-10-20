import {normalize} from '../create-order/index.ts';
import {body,customer,database,endpoint,settings,serve,PaymentError,uuid} from '../_shared/payment.ts';
import type {Settings} from '../_shared/payment.ts';
export function createHandler(s:Settings,send:typeof fetch=fetch) {
 const db=database(s,send);
 return endpoint(s,async req=>{
   const user=await customer(req,s,send);
   if(!Number.isInteger(s.maxQuantity)||s.maxQuantity<1||s.maxQuantity>100||!Number.isInteger(s.accessTtl)||s.accessTtl<60||s.accessTtl>31536000||!Number.isInteger(s.paymentTtl)||s.paymentTtl<60||s.paymentTtl>86400||s.accessTtl<s.paymentTtl)throw new PaymentError(503,'order_policy_unconfigured');
   let input;
   try {input=normalize(await body(req,4096));}catch(e){
     if(e instanceof PaymentError)throw e;
     // Reuse existing normalizer, without exposing its internal error object.
     throw new PaymentError(400,'invalid_order_input');
   }
   const result=await db('create_customer_pending_order_secure',{p_user:user,p_input:input,p_max_quantity:s.maxQuantity,p_access_ttl:s.accessTtl,p_payment_ttl:s.paymentTtl});
   if(!uuid(result.order_id)||result.currency!=='KES'||result.payment_status!=='pending'||!Number.isSafeInteger(result.total_amount)||result.total_amount<1||result.quantity!==input.quantity)throw new PaymentError(503,'invalid_order_snapshot');
   return {order_id:result.order_id,quantity:result.quantity,total_amount:result.total_amount,currency:result.currency,payment_status:result.payment_status};
 });
}
serve((import.meta as any).main,createHandler(settings()));
