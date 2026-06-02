/**
 * External drink-database look-up with persistent caching.
 *
 * No API keys are required — every source is either fully open or uses a fixed
 * public endpoint, so all hosts/keys are hardcoded (nothing lives in .env).
 * Each provider can be toggled on/off by the admin via the `settings` table
 * (keys: lookup_enabled master + lookup_<provider>), checked at search time.
 *
 * Upstream responses are cached in SQLite (lookup_cache) keyed by provider+query,
 * so repeat searches cost zero API requests until the TTL expires.
 *
 * Normalised result shape:
 *   { source, name, brewery, style, abv, country, category, thumbnail,
 *     ingredients?, glass?, website?, detail? }
 */
const db = require('./db');

const CACHE_MS = 30 * 86400 * 1000;   // 30 days — reference data is near-static

// Hardcoded endpoints (no secrets)
const OBDB_BASE   = 'https://api.openbrewerydb.org/v1';
const CDB_BASE    = 'https://www.thecocktaildb.com/api/json/v1/1'; // "1" = free public test key
const OFF_BASE    = 'https://world.openfoodfacts.org/cgi/search.pl';
const VIVINO_BASE = 'https://www.vivino.com/api/explore/explore';  // unofficial (aptash/vivino-api)

// ── Settings / toggle helpers ─────────────────────────────────────────────────
function flag(key, dflt = true) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return dflt;
  return row.value === 'true';
}
const lookupsEnabled = () => flag('lookup_enabled');
const providerOn = (name) => lookupsEnabled() && flag(`lookup_${name}`);

// ── Cache helpers ─────────────────────────────────────────────────────────────
function getCache(key) {
  const row = db.prepare('SELECT body, expires_at FROM lookup_cache WHERE key = ?').get(key);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM lookup_cache WHERE key = ?').run(key);
    return null;
  }
  try { return JSON.parse(row.body); } catch { return null; }
}
function setCache(key, value) {
  db.prepare('INSERT OR REPLACE INTO lookup_cache (key, body, expires_at) VALUES (?,?,?)')
    .run(key, JSON.stringify(value), Date.now() + CACHE_MS);
}

/** Fetch JSON with a timeout, caching the raw upstream body under `key`. */
async function cachedJson(key, url, opts = {}) {
  const hit = getCache(key);
  if (hit !== null) return hit;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BeerRates/1.0 (self-hosted)', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
    ...opts,
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const json = await res.json();
  setCache(key, json);
  return json;
}

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
const httpsify = (u) => (u && u.startsWith('//') ? `https:${u}` : clean(u));

// ── Providers ─────────────────────────────────────────────────────────────────

// OpenBreweryDB — brewery directory (no beers/ABV, but brewery + country)
async function searchBreweries(q) {
  const url = `${OBDB_BASE}/breweries?by_name=${encodeURIComponent(q)}&per_page=8`;
  const rows = await cachedJson(`obdb:${q.toLowerCase()}`, url);
  return (Array.isArray(rows) ? rows : []).map((b) => ({
    source: 'openbrewerydb',
    name: clean(b.name),
    brewery: clean(b.name),
    style: null, abv: null,
    country: clean(b.country),
    category: 'Beer',
    thumbnail: null,
    website: clean(b.website_url),
    detail: [clean(b.brewery_type), clean(b.city), clean(b.state_province)].filter(Boolean).join(' · ') || null,
  }));
}

// TheCocktailDB — cocktails, with thumbnails + ingredients
async function searchCocktails(q) {
  const url = `${CDB_BASE}/search.php?s=${encodeURIComponent(q)}`;
  const data = await cachedJson(`cdb:${q.toLowerCase()}`, url);
  const drinks = (data && Array.isArray(data.drinks)) ? data.drinks : [];
  return drinks.slice(0, 10).map((d) => {
    const ingredients = [];
    for (let i = 1; i <= 15; i++) {
      const ing = clean(d[`strIngredient${i}`]);
      if (ing) ingredients.push(ing);
    }
    const nonAlc = (d.strAlcoholic || '').toLowerCase().includes('non');
    return {
      source: 'thecocktaildb',
      name: clean(d.strDrink),
      brewery: null,
      style: clean(d.strCategory),
      abv: null, country: null,
      category: nonAlc ? 'Alcohol Free' : 'Cocktail',
      thumbnail: clean(d.strDrinkThumb),
      glass: clean(d.strGlass),
      ingredients,
      detail: ingredients.slice(0, 4).join(', ') || null,
    };
  });
}

// Vivino — unofficial explore API (no key). Endpoint/shape can drift; parse
// defensively and fail soft. Modelled on github.com/aptash/vivino-api.
async function searchWines(q) {
  const url = `${VIVINO_BASE}?q=${encodeURIComponent(q)}&per_page=8`;
  let data;
  try {
    data = await cachedJson(`vivino:${q.toLowerCase()}`, url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BeerRates/1.0)',
        Accept: 'application/json',
      },
    });
  } catch (e) {
    console.error('Vivino lookup failed:', e.message);
    return [];
  }
  const matches = data?.explore_vintage?.matches
    || data?.matches
    || (Array.isArray(data?.records) ? data.records : [])
    || [];
  return (Array.isArray(matches) ? matches : []).slice(0, 8).map((m) => {
    const v = m.vintage || m;
    const wine = v.wine || m.wine || {};
    return {
      source: 'vivino',
      name: clean(v.name || wine.name || m.name),
      brewery: clean(wine.winery?.name || v.winery?.name),
      style: clean(wine.style?.varietal_name || wine.type_name || wine.style?.name),
      abv: wine.alcohol ?? null,
      country: clean(wine.region?.country?.name || wine.region?.name),
      category: 'Wine',
      thumbnail: httpsify(v.image?.location || wine.image?.location),
      detail: v.year ? `Vintage ${v.year}` : (v.statistics?.ratings_average ? `★ ${v.statistics.ratings_average}` : null),
    };
  }).filter((r) => r.name);
}

// Open Food Facts — open product DB; great for packaged beers/products + photos
async function searchOpenFood(q, category) {
  const url = `${OFF_BASE}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8`
    + '&fields=product_name,brands,countries,image_front_small_url,categories,alcohol_value';
  const data = await cachedJson(`off:${q.toLowerCase()}`, url);
  const products = (data && Array.isArray(data.products)) ? data.products : [];
  return products
    .filter((p) => clean(p.product_name))
    .slice(0, 8)
    .map((p) => ({
      source: 'openfoodfacts',
      name: clean(p.product_name),
      brewery: clean((p.brands || '').split(',')[0]),
      style: null,
      abv: p.alcohol_value != null && p.alcohol_value !== '' ? Number(p.alcohol_value) : null,
      country: clean((p.countries || '').split(',')[0]),
      category: category || 'Other',
      thumbnail: clean(p.image_front_small_url),
      detail: clean(p.categories?.split(',').slice(-1)[0]) || null,
    }));
}

// ── Unified search ────────────────────────────────────────────────────────────
// Only calls enabled providers relevant to the category, to minimise requests.
async function search(category, q) {
  const query = (q || '').trim();
  if (query.length < 2 || !lookupsEnabled()) return [];

  const tasks = [];
  const want = {
    openbrewerydb: providerOn('openbrewerydb'),
    thecocktaildb: providerOn('thecocktaildb'),
    openfoodfacts: providerOn('openfoodfacts'),
    vivino:        providerOn('vivino'),
  };

  switch (category) {
    case 'Cocktail':
      if (want.thecocktaildb) tasks.push(searchCocktails(query));
      break;
    case 'Wine':
      if (want.vivino)        tasks.push(searchWines(query));
      if (want.openfoodfacts) tasks.push(searchOpenFood(query, 'Wine'));
      break;
    case 'Alcohol Free':
      if (want.thecocktaildb) tasks.push(searchCocktails(query));
      if (want.openfoodfacts) tasks.push(searchOpenFood(query, 'Alcohol Free'));
      break;
    case 'Beer':
      if (want.openbrewerydb) tasks.push(searchBreweries(query));
      if (want.openfoodfacts) tasks.push(searchOpenFood(query, 'Beer'));
      break;
    default:
      if (want.openfoodfacts) tasks.push(searchOpenFood(query, 'Other'));
  }

  const settled = await Promise.allSettled(tasks);
  const results = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') results.push(...s.value);
    else console.error('lookup provider failed:', s.reason?.message || s.reason);
  }
  const seen = new Set();
  return results.filter((r) => {
    if (!r.name) return false;
    const k = `${r.source}|${r.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 15);
}

// Reflects both the master switch and per-provider toggles.
function providerStatus() {
  const master = lookupsEnabled();
  return {
    enabled: master,
    openbrewerydb: master && flag('lookup_openbrewerydb'),
    thecocktaildb: master && flag('lookup_thecocktaildb'),
    openfoodfacts: master && flag('lookup_openfoodfacts'),
    vivino:        master && flag('lookup_vivino'),
  };
}

module.exports = { search, providerStatus };
