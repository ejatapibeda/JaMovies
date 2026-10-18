const DEFAULT_KEY = "7ac6de5ca5060c7504e05da7b218a30c";
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, exp: Date.now() + 24 * 60 * 60 * 1000 });
}

/**
 * Stremio kirim IMDb id (tt...). nxsha butuh TMDB id.
 * Menerima "tt0137523" atau "tmdb:550".
 */
async function resolveTmdbId(rawId, type) {
  const id = String(rawId || "").trim();
  if (!id) return null;

  const tmdbDirect = id.match(/^(?:tmdb:)?(\d+)$/i);
  if (tmdbDirect && !id.startsWith("tt")) return tmdbDirect[1];

  const imdb = id.match(/tt\d+/i);
  if (!imdb) return null;

  const cacheKey = `${type}:${imdb[0]}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const key = process.env.TMDB_API_KEY || DEFAULT_KEY;
  const url =
    `https://api.themoviedb.org/3/find/${imdb[0]}` +
    `?api_key=${encodeURIComponent(key)}&external_source=imdb_id`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  const data = await res.json();
  const list = type === "series" ? data.tv_results : data.movie_results;
  const tmdbId = list && list[0] ? String(list[0].id) : null;
  cacheSet(cacheKey, tmdbId);
  return tmdbId;
}

module.exports = { resolveTmdbId };
