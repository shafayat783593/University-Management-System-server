export interface IAuditLogFilters {
	actorId?: string;
	targetType?: string;
	action?: string;
	from?: string;
	to?: string;
	page?: number;
	limit?: number;
}