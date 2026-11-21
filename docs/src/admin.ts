/**
 * Everything under `src/content/docs/admin/` (and `en/admin/`) is admin-only.
 * Keep this in sync with ADMIN_DIRS in scripts/protect-admin.mjs.
 */
export function isAdminPage(entryId: string): boolean {
	return /^(en\/)?admin(\/|$)/.test(entryId);
}
