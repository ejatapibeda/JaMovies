const { collectSources, BASE } = require("./nxsha");
const { resolveTmdbId } = require("./tmdb");
const { filterPlayable } = require("./probe");
const { playLink } = require("./play");

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

// Semua m3u8 lewat proxy addon: ekstensi .woff / header PNG tidak sampai ke Stremio.
// Host yang cuma butuh Referer dan bukan playlist tetap lewat proxy Stremio.
const REFERER_HOSTS = [/clarvista\.shop/i];

function resolutionOf(source) {
  const text = `${source.quality || ""} ${source.name || ""} ${source.title || ""}`;
  const match = text.match(/(2160|1440|1080|720|480|360)\s*p?/i);
  return match ? Number(match[1]) : 0;
}

function labelOf(source, height) {
  const parts = [source.quality, source.language || source.lang, source.name, source.title].filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (!unique.some((have) => have.toLowerCase() === String(part).toLowerCase())) unique.push(String(part));
  }
  return unique.join(" • ") || (height ? `${height}p` : "Auto");
}

function directKind(source) {
  const type = String(source.type || "").toLowerCase();
  const url = source.url || "";
  if (type === "mkv" || /\.mkv(\?|#|$)/i.test(url)) return "mkv";
  if (type === "mp4" || /\.mp4(\?|#|$)/i.test(url)) return "mp4";
  if (type === "webm" || /\.webm(\?|#|$)/i.test(url)) return "webm";
  return null;
}

function unwrapFile(url) {
  try {
    const inner = new URL(url).searchParams.get("url");
    if (inner && /^https?:\/\//i.test(inner) && /\.(mkv|mp4|webm)(\?|#|$)/i.test(inner)) return inner;
  } catch {
    return url;
  }
  return url;
}

function toStream(server, source) {
  const url = unwrapFile(source.url);
  const playable = { ...source, url };
  const height = resolutionOf(playable);
  const kind = directKind(playable);
  const localProxy = /\.m3u8(\?|#|$)/i.test(url);
  const needsReferer = !localProxy && REFERER_HOSTS.some((re) => re.test(url));
  const behaviorHints = {
    bingeGroup: `jamovies-${server.scraper}`,
    notWebReady: needsReferer || kind === "mkv",
  };
  if (needsReferer) {
    behaviorHints.proxyHeaders = {
      request: {
        Referer: `${BASE}/`,
        Origin: BASE,
      },
    };
  }

  return {
    name: height ? `JaMovies\n${height}p` : "JaMovies\nAuto",
    title: `${server.name || server.scraper}\n${labelOf(playable, height)}`,
    url: localProxy ? playLink(url) : url,
    behaviorHints,
    _height: height,
    _priority: Number(server.high_priority) || 999,
    _direct: kind,
  };
}

async function getStreams(type, id, season, episode) {
  if (type !== "movie" && type !== "series") return [];
  if (type === "series" && (!season || !episode)) return [];

  const tmdbId = await resolveTmdbId(id, type);
  if (!tmdbId) return [];

  const nxType = type === "series" ? "tv" : "movie";
  const query = {
    nxType,
    tmdbId: String(tmdbId),
    season: season ? String(season) : "",
    episode: episode ? String(episode) : "",
  };

  const cacheKey = `${nxType}:${query.tmdbId}:${query.season}:${query.episode}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.streams;

  const rows = await collectSources(query);
  const candidates = rows
    .map(({ server, source }) => toStream(server, source))
    .sort((a, b) => b._height - a._height || a._priority - b._priority);

  const probed = await filterPlayable(candidates);
  const streams = probed.streams.map(({ _height, _priority, _direct, ...stream }) => stream);
  console.log(`[jamovies] probe ${probed.playable}/${probed.checked} bisa play`);

  if (streams.length > 0) {
    cache.set(cacheKey, { streams, exp: Date.now() + CACHE_MS });
  }
  return streams;
}

module.exports = { getStreams };
