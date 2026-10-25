export interface ICreateAnnouncementPayload {
	title: string;
	body: string;
	isPublished?: boolean;
	category?: string;
	imageUrl?: string;
	imagePublicId?: string;
}

export interface IUpdateAnnouncementPayload {
	title?: string;
	body?: string;
	isPublished?: boolean;
	category?: string;
	imageUrl?: string;
	imagePublicId?: string;
}

export interface IAnnouncementFilters {
	page?: number;
	limit?: number;
	category?: string;
}