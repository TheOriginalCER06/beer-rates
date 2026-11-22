// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// Served at øl.cer06.no/docs: the app's nginx forwards /docs/ to the docs container.
	site: 'https://xn--l-4ga.cer06.no',
	base: '/docs',
	integrations: [
		starlight({
			title: { nb: 'Drikke Vurderinger', en: 'Drikke Vurderinger' },
			description: 'Dokumentasjon for Drikke Vurderinger / documentation for Drikke Vurderinger.',
			logo: { src: './src/assets/logo.svg', replacesTitle: false },
			favicon: '/favicon.svg',
			// Norwegian is served at /, English at /en/.
			defaultLocale: 'root',
			locales: {
				root: { label: 'Norsk bokmål', lang: 'nb' },
				en: { label: 'English', lang: 'en' },
			},
			customCss: ['./src/styles/custom.css'],
			// Keeps admin pages out of the search index and marks them with a banner.
			// The pages themselves are encrypted after the build (scripts/protect-admin.mjs).
			routeMiddleware: './src/routeData.ts',
			sidebar: [
				{
					label: 'Brukerveiledning',
					translations: { en: 'User guide' },
					items: [{ autogenerate: { directory: 'guide' } }],
				},
				{
					label: 'Administrasjon 🔒',
					translations: { en: 'Administration 🔒' },
					collapsed: true,
					items: [{ autogenerate: { directory: 'admin' } }],
				},
			],
		}),
	],
});
