import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { isAdminPage } from './admin';

const BANNER = {
	nb: '🔒 Denne siden er kun for administratorer. Den krypteres med admin-passordet når dokumentasjonen publiseres.',
	en: '🔒 This page is for administrators only. It is encrypted with the admin password when the docs are published.',
};

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	if (!isAdminPage(route.entry.id)) return;

	// Admin pages must never end up in the (unencrypted) Pagefind search index.
	route.entry.data.pagefind = false;
	route.entry.data.banner = { content: route.lang === 'en' ? BANNER.en : BANNER.nb };
});
