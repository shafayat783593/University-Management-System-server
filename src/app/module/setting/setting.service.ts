import { prisma } from "../../lib/prisma.js";
import { IUpdateSystemSettingPayload } from "./setting.interface.js";





/**
 * Single-row settings table — no natural unique business key to upsert
 * against, so this just finds the first (only) row and creates it on
 * first use.
 */
const getSettings = async () => {
	const existing = await prisma.systemSetting.findFirst();
	if (existing) return existing;
	return prisma.systemSetting.create({ data: {} });
};

const updateSettings = async (payload: IUpdateSystemSettingPayload) => {
	const existing = await getSettings();
	return prisma.systemSetting.update({
		where: { id: existing.id },
		data: payload,
	});
};

export const SettingService = {
	getSettings,
	updateSettings,
};