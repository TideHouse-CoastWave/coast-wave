import { endpoint, settings, serve, PaymentError } from '../_shared/payment.ts';
// The supplied STK guide defines no dedicated callback authentication contract.
export const createHandler = () => endpoint(settings(),async () => { throw new PaymentError(503,'stk_callback_contract_not_documented'); },true);
serve((import.meta as any).main,createHandler());
