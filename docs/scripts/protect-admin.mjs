#!/usr/bin/env node
/**
 * Encrypts every admin page in the built site (dist/) with StatiCrypt, so they can be
 * published on a public static host. Runs automatically after `astro build`.
 *
 * - Password: DOCS_ADMIN_PASSWORD (env var; docs/.env locally; a build secret in the docs Docker image).
 * - The build FAILS if the password is missing, if any admin page is left unencrypted,
 *   or if admin pages leaked into the Pagefind search index. Never publish a dist/ that
 *   didn't pass this script.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const STATICRYPT = join(ROOT, 'node_modules', 'staticrypt', 'cli', 'index.js');

// Not secret: a fixed salt keeps "remember me" working across deploys. Changing it logs everyone out.
const SALT = '6f0c47b25019b7af8b5802413539e102';
const REMEMBER_DAYS = '30';
const MIN_PASSWORD_LENGTH = 12;

// Keep in sync with src/admin.ts.
const ADMIN_DIRS = [
	{
		dir: 'admin',
		template: {
			title: 'Kun for administratorer',
			instructions: 'Denne siden er beskyttet. Skriv inn admin-passordet for dokumentasjonen.<br><a href="/docs/">← Tilbake til dokumentasjonen</a>',
			button: 'Lås opp',
			placeholder: 'Passord',
			remember: 'Husk meg i 30 dager',
			error: 'Feil passord',
			'toggle-show': 'Vis passord',
			'toggle-hide': 'Skjul passord',
		},
	},
	{
		dir: 'en/admin',
		template: {
			title: 'Administrators only',
			instructions: 'This page is protected. Enter the docs admin password.<br><a href="/docs/en/">← Back to the docs</a>',
			button: 'Unlock',
			placeholder: 'Password',
			remember: 'Remember me for 30 days',
			error: 'Wrong password',
			'toggle-show': 'Show password',
			'toggle-hide': 'Hide password',
		},
	},
];

function fail(message) {
	console.error(`\n✖ protect-admin: ${message}\n`);
	process.exit(1);
}

function htmlFiles(dir) {
	return readdirSync(dir, { recursive: true })
		.map((entry) => join(dir, entry))
		.filter((path) => path.endsWith('.html') && statSync(path).isFile());
}

const password = process.env.DOCS_ADMIN_PASSWORD ?? '';
if (!password) {
	fail('DOCS_ADMIN_PASSWORD is not set. Refusing to leave admin pages unencrypted.');
}
if (password.length < MIN_PASSWORD_LENGTH) {
	fail(`DOCS_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}
if (!existsSync(DIST)) {
	fail('dist/ not found. Run `astro build` first.');
}

let encrypted = 0;
for (const { dir, template } of ADMIN_DIRS) {
	const target = join(DIST, dir);
	if (!existsSync(target)) continue;

	const files = htmlFiles(target);
	const tmp = mkdtempSync(join(tmpdir(), 'staticrypt-'));
	try {
		const templateArgs = Object.entries(template).flatMap(([key, value]) => [`--template-${key}`, value]);
		execFileSync(
			process.execPath,
			[
				STATICRYPT,
				target,
				'--recursive',
				'--directory', tmp,
				'--config', 'false',
				'--salt', SALT,
				'--remember', REMEMBER_DAYS,
				'--short',
				'--template-color-primary', '#d98706',
				'--template-color-secondary', '#2b1a0b',
				...templateArgs,
			],
			{ env: { ...process.env, STATICRYPT_PASSWORD: password }, stdio: ['ignore', 'ignore', 'inherit'] },
		);
		// StatiCrypt writes to <tmp>/<basename of input>/...
		const output = join(tmp, basename(target));
		const outputFiles = htmlFiles(output);
		if (outputFiles.length !== files.length) {
			fail(`expected ${files.length} encrypted files in ${dir}/, got ${outputFiles.length}.`);
		}
		cpSync(output, target, { recursive: true });
		encrypted += files.length;
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// Every admin page is encrypted on its own, so without "Remember me" each page asks for the password
// again. Tick it by default (it can still be unticked on a shared computer): the browser then keeps a
// hash of the password for REMEMBER_DAYS and opens the other admin pages by itself.
const REMEMBER_BOX = '<input id="staticrypt-remember" type="checkbox" name="remember" />';
for (const { dir } of ADMIN_DIRS) {
	const target = join(DIST, dir);
	if (!existsSync(target)) continue;
	for (const file of htmlFiles(target)) {
		const html = readFileSync(file, 'utf8');
		if (!html.includes(REMEMBER_BOX)) fail(`${relative(DIST, file)}: the "Remember me" checkbox wasn't found.`);
		writeFileSync(file, html.replace(REMEMBER_BOX, REMEMBER_BOX.replace(' />', ' checked />')));
	}
}

// --- Verification -----------------------------------------------------------------

for (const { dir } of ADMIN_DIRS) {
	const target = join(DIST, dir);
	if (!existsSync(target)) continue;
	for (const file of htmlFiles(target)) {
		const html = readFileSync(file, 'utf8');
		if (!html.includes('staticrypt') || html.includes('data-pagefind-body') || html.includes('sl-markdown-content')) {
			fail(`${relative(DIST, file)} does not look encrypted.`);
		}
	}
}

// Pagefind fragments are gzip-compressed; make sure no admin page was indexed.
const fragments = join(DIST, 'pagefind', 'fragment');
if (existsSync(fragments)) {
	for (const name of readdirSync(fragments)) {
		const raw = readFileSync(join(fragments, name));
		let text;
		try {
			text = gunzipSync(raw).toString('utf8');
		} catch {
			text = raw.toString('utf8');
		}
		if (/"url":"\/(en\/)?admin\//.test(text)) {
			fail(`search index fragment ${name} contains an admin page.`);
		}
	}
}

console.log(`✔ protect-admin: encrypted ${encrypted} admin page(s); search index is clean.`);
