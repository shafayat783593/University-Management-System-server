export interface IInitPaymentPayload {
	invoiceId: string;
	/** Optional. Defaults to the next unpaid installment's remaining balance. */
	amount?: number;
}

export interface IRefundPayload {
	/** Optional. Defaults to everything still refundable on the transaction. */
	amount?: number;
	reason: string;
	/**
	 * true  (default): the student owes the money again (installments reopen).
	 * false: money is returned without reopening the balance — e.g. a caution
	 *        deposit going back at graduation, or an overpayment/excess.
	 */
	reverseCharge?: boolean;
}