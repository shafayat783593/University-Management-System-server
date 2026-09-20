export interface ICreateAnnouncementPayload {
	title: string;
	body: string;
	isPublished?: boolean;
}

export interface IUpdateAnnouncementPayload {
	title?: string;
	body?: string;
	isPublished?: boolean;
}

export interface IAnnouncementFilters {
	page?: number;
	limit?: number;
}