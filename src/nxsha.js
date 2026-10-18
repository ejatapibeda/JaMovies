const crypto = require("crypto");

// Passphrase di bundle nxsha: /_next/static/chunks/* (modul encrypt/decrypt).
// CryptoJS.AES + OpenSSL EVP_BytesToKey (MD5), payload "Salted__" + salt + ciphertext.
const PASSPHRASE = "f4488ab4da401203d23baa129fc546153898162524635d6776826d0c867ccaa3";
const BASE = "https://nxsha.space";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const SOURCE_TIMEOUT_MS = 8000;
const CONCURRENCY = 6;

function b64urlDecode(value) {
  let text = String(value).replace(/-/g, "+").replace(/_/g, "/");
  while (text.length % 4 !== 0) text += "=";
  return Buffer.from(text, "base64");
}

function b64urlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function evpKdf(pass, salt, keyLen = 32, ivLen = 16) {
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  const passBuf = Buffer.from(pass, "utf8");
  while (derived.length < keyLen + ivLen) {
    block = crypto.createHash("md5").update(Buffer.concat([block, passBuf, salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

function decrypt(hash) {
  const buf = b64urlDecode(hash);
  if (buf.subarray(0, 8).toString() !== "Salted__") {
    throw new Error("payload bukan format CryptoJS");
  }
  const salt = buf.subarray(8, 16);
  const { key, iv } = evpKdf(PASSPHRASE, salt);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const json = Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString("utf8");
  const obj = JSON.parse(json);
  delete obj._req_ts;
  delete obj._req_salt;
  return obj;
}

function encrypt(obj) {
  const body = {
    ...obj,
    _req_ts: Date.now(),
    _req_salt: Math.random().toString(36).substring(2, 12),
  };
  const salt = crypto.randomBytes(8);
  const { key, iv } = evpKdf(PASSPHRASE, salt);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return b64urlEncode(Buffer.concat([Buffer.from("Salted__"), salt, ct]));
}

async function call(endpoint, payload, signal) {
  const q = encodeURIComponent(encrypt(payload));
  const res = await fetch(`${BASE}/${endpoint}?q=${q}`, {
    signal,
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
  });
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data._hash) return null;
  return decrypt(data._hash);
}

function isPlayable(source) {
  if (!source || source.isEmbed || !source.url) return false;
  if (!/^https?:\/\//i.test(source.url)) return false;
  const type = String(source.type || "").toLowerCase();
  if (["m3u8", "hls", "mp4", "mkv", "webm", "dash"].includes(type)) return true;
  return /\.(m3u8|mp4|mkv|webm|mpd)(\?|#|$)/i.test(source.url);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function sourcesFor(server, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const doc = await call(
      "api/sources",
      {
        ex_lang: false,
        provider: server.scraper,
        tmdbId: query.tmdbId,
        imdb_id: "",
        type: query.nxType,
        season: query.season,
        episode: query.episode,
      },
      controller.signal
    );
    return (doc && doc.sources ? doc.sources : []).filter(isPlayable);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil semua sumber playable (m3u8/mp4/dash) dari scraper nxsha yang web_support-nya nyala.
 * query: { nxType: "movie"|"tv", tmdbId, season, episode }
 * return: [{ server, source }]
 */
async function collectSources(query) {
  const serversDoc = await call("api/servers", {
    tmdbId: query.tmdbId,
    imdb_id: "",
    type: query.nxType,
    season: query.season,
    episode: query.episode,
  });

  const servers = ((serversDoc && serversDoc.servers) || [])
    .filter((s) => s && s.web_support !== false && s.scraper && s.scraper !== "showbox-online")
    .sort((a, b) => (Number(a.high_priority) || 999) - (Number(b.high_priority) || 999));

  const batches = await mapPool(servers, CONCURRENCY, async (server) => {
    const sources = await sourcesFor(server, query);
    return sources.map((source) => ({ server, source }));
  });

  const seen = new Set();
  const rows = [];
  for (const batch of batches) {
    for (const row of batch) {
      if (seen.has(row.source.url)) continue;
      seen.add(row.source.url);
      rows.push(row);
    }
  }
  return rows;
}

module.exports = { collectSources, BASE };
