

export interface IGenerateFeesPayload {
	semesterId: string;
	amount: number;
	installmentCount?: number;
	firstDueDate?: string;
}