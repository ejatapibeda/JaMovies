const { publicOrigin } = require("./origin");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

function headersFor() {
  return {
    "User-Agent": UA,
    Accept: "*/*",
    Referer: "https://nxsha.space/",
    Origin: "https://nxsha.space",
  };
}

function publicBase(req) {
  return publicOrigin(req);
}

function playLink(remoteUrl) {
  return `${publicOrigin()}/play/master.m3u8?u=${encodeURIComponent(remoteUrl)}`;
}

function fileFor(remoteUrl) {
  if (/\.m3u8(\?|#|$)/i.test(remoteUrl)) return "index.m3u8";
  if (/\.vtt(\?|#|$)/i.test(remoteUrl)) return "sub.vtt";
  if (/\.srt(\?|#|$)/i.test(remoteUrl)) return "sub.srt";
  if (/\.(m4s|mp4|m4a|cmfv|cmfa|aac|woff2?)(\?|#|$)/i.test(remoteUrl)) return "seg.mp4";
  return "seg.ts";
}

function tsOffset(buf) {
  if (!buf || buf.length < 188 * 3) return -1;
  const limit = Math.min(buf.length - 376, 8192);
  for (let i = 0; i <= limit; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) return i;
  }
  return -1;
}

function fragmentedMp4(buf) {
  if (!buf || buf.length < 8) return false;
  const box = buf.toString("ascii", 4, 8);
  return box === "ftyp" || box === "styp" || box === "moof";
}

function preferDefaultAudio(text) {
  const lines = text.split(/\r?\n/);
  const audio = [];
  for (let i = 0; i < lines.length; i++) {
    if (/#EXT-X-MEDIA:/i.test(lines[i]) && /TYPE=AUDIO/i.test(lines[i])) audio.push(i);
  }
  if (!audio.length || audio.some((i) => /DEFAULT=YES/i.test(lines[i]))) return text;
  const english = audio.find((i) => /LANGUAGE="en"/i.test(lines[i]) || /NAME="English"/i.test(lines[i]));
  const pick = english == null ? audio[0] : english;
  let line = lines[pick].replace(/DEFAULT=NO/gi, "DEFAULT=YES").replace(/AUTOSELECT=NO/gi, "AUTOSELECT=YES");
  if (!/DEFAULT=/i.test(line)) line += ",DEFAULT=YES";
  if (!/AUTOSELECT=/i.test(line)) line += ",AUTOSELECT=YES";
  lines[pick] = line;
  return lines.join("\n");
}

const AUDIO_STREAM_TYPES = new Set([0x03, 0x04, 0x0f, 0x11, 0x81, 0x87]);

function pmtHasAudio(buf) {
  const start = tsOffset(buf);
  if (start < 0) return false;
  const endScan = Math.min(buf.length, start + 188 * 80);
  for (let i = start; i + 188 <= endScan; i += 188) {
    if (buf[i] !== 0x47) break;
    const pusi = buf[i + 1] & 0x40;
    let off = i + 4;
    const adapt = (buf[i + 3] >> 4) & 3;
    if (adapt === 2 || adapt === 3) off += 1 + buf[off];
    if (!pusi || off >= i + 188) continue;
    const section = off + 1 + buf[off];
    if (section >= i + 188 || buf[section] !== 2) continue;
    const sectionLen = ((buf[section + 1] & 0x0f) << 8) | buf[section + 2];
    let p = section + 10;
    if (p + 2 > i + 188) continue;
    const infoLen = ((buf[p] & 0x0f) << 8) | buf[p + 1];
    p += 2 + infoLen;
    const end = Math.min(section + 3 + sectionLen - 4, i + 188);
    while (p + 5 <= end) {
      if (AUDIO_STREAM_TYPES.has(buf[p])) return true;
      const esLen = ((buf[p + 3] & 0x0f) << 8) | buf[p + 4];
      p += 5 + esLen;
    }
  }
  return false;
}

async function readBytes(url, signal, max) {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { ...headersFor(), Range: `bytes=0-${max - 1}` },
  });
  if (!res.ok && res.status !== 206) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  return { buf: Buffer.from(await res.arrayBuffer()), url: res.url || url };
}

async function videoHasAudio(text, pageUrl, signal) {
  const variants = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const media = variants[variants.length - 1];
  if (!media) return false;
  let page = await readBytes(new URL(media, pageUrl).href, signal, 64 * 1024);
  if (!page) return false;
  let body = page.buf.toString("utf8");
  if (!body.includes("#EXTM3U")) {
    if (fragmentedMp4(page.buf)) return page.buf.toString("latin1").includes("soun");
    return pmtHasAudio(page.buf);
  }
  const map = body.match(/#EXT-X-MAP:URI="([^"]+)"/i);
  if (map) {
    const init = await readBytes(new URL(map[1], page.url).href, signal, 256 * 1024);
    return !!(init && init.buf.toString("latin1").includes("soun"));
  }
  const segment = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
  if (!segment) return false;
  const bin = await readBytes(new URL(segment, page.url).href, signal, 256 * 1024);
  if (!bin) return false;
  if (fragmentedMp4(bin.buf)) return bin.buf.toString("latin1").includes("soun");
  return pmtHasAudio(bin.buf);
}

function videoOnlyCodecs(text) {
  return text.replace(/CODECS="([^"]*)"/gi, (_, codecs) => {
    const keep = codecs.split(",").map((codec) => codec.trim()).filter((codec) => codec && !/^(mp4a|ac-3|ec-3|opus|flac|mp3)/i.test(codec));
    return keep.length ? `CODECS="${keep.join(",")}"` : "";
  });
}

function highestVariant(text) {
  const lines = text.split(/\r?\n/);
  let best = -1;
  let bestBandwidth = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^#EXT-X-STREAM-INF:/i.test(lines[i])) continue;
    const bandwidth = Number((lines[i].match(/BANDWIDTH=(\d+)/i) || [])[1] || 0);
    if (bandwidth >= bestBandwidth) {
      bestBandwidth = bandwidth;
      best = i;
    }
  }
  if (best < 0) return text;
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#EXT-X-STREAM-INF:/i.test(lines[i]) && i !== best) {
      const next = lines[i + 1] ? lines[i + 1].trim() : "";
      if (next && !next.startsWith("#")) i += 1;
      continue;
    }
    kept.push(lines[i]);
  }
  return kept.join("\n");
}

function stripAudio(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/#EXT-X-MEDIA:/i.test(line) || !/TYPE=AUDIO/i.test(line))
    .map((line) => line.replace(/,AUDIO="[^"]*"/gi, "").replace(/AUDIO="[^"]*",?/gi, ""))
    .join("\n");
}

function stripSideMedia(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/#EXT-X-MEDIA:/i.test(line))
    .map((line) =>
      line
        .replace(/,AUDIO="[^"]*"/gi, "")
        .replace(/AUDIO="[^"]*",?/gi, "")
        .replace(/,SUBTITLES="[^"]*"/gi, "")
        .replace(/SUBTITLES="[^"]*",?/gi, "")
    )
    .join("\n");
}

async function audioWorks(text, pageUrl, signal) {
  const tag = text.match(/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*URI="([^"]+)"/i);
  if (!tag) return true;
  const playlistUrl = new URL(tag[1], pageUrl).href;
  const playlistRes = await fetch(playlistUrl, { signal, redirect: "follow", headers: headersFor(playlistUrl) });
  if (!playlistRes.ok) return false;
  const playlist = await playlistRes.text();
  const segLine = playlist.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
  if (!segLine) return false;
  const segUrl = new URL(segLine, playlistRes.url || playlistUrl).href;
  const segRes = await fetch(segUrl, {
    signal,
    redirect: "follow",
    headers: { ...headersFor(segUrl), Range: "bytes=0-2047" },
  });
  if (!segRes.ok && segRes.status !== 206) return false;
  const buf = Buffer.from(await segRes.arrayBuffer());
  return tsOffset(buf) >= 0 || fragmentedMp4(buf);
}

function proxyLink(req, remoteUrl, playlist) {
  const name = playlist || /\.m3u8(\?|#|$)/i.test(remoteUrl) ? "index.m3u8" : fileFor(remoteUrl);
  return `${publicBase(req)}/play/${name}?u=${encodeURIComponent(remoteUrl)}`;
}

function rewritePlaylist(text, pageUrl, req) {
  const master = /#EXT-X-STREAM-INF:/i.test(text);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = new URL(uri, pageUrl).href;
          return `URI="${proxyLink(req, abs, master)}"`;
        });
      }
      const abs = new URL(trimmed, pageUrl).href;
      return proxyLink(req, abs, master);
    })
    .join("\n");
}

// itsnitrox menempelkan header PNG di depan MPEG-TS. ffmpeg berhenti di PNG dan loading terus.
function unwrapMedia(buf) {
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return buf;
  const at = tsOffset(buf);
  return at > 0 ? buf.subarray(at) : buf;
}

const playlistCache = new Map();

function cachedPlaylist(key) {
  const hit = playlistCache.get(key);
  if (!hit || hit.exp < Date.now()) return null;
  return hit.body;
}

function storePlaylist(key, body) {
  playlistCache.set(key, { body, exp: Date.now() + 10 * 60 * 1000 });
}

async function pipeMedia(upstream, req, res) {
  const path = (req.url || "").split("?")[0];
  const reader = upstream.body.getReader();
  const first = await reader.read();
  const head = first.done ? Buffer.alloc(0) : Buffer.from(first.value);
  const atStart = !req.headers.range || /^bytes=0-/i.test(req.headers.range);
  const png = atStart && head.length > 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;

  if (png) {
    const chunks = [head];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(Buffer.from(next.value));
    }
    const media = unwrapMedia(Buffer.concat(chunks));
    res.statusCode = 200;
    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Content-Length", media.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.end(media);
    return;
  }

  const upstreamType = (upstream.headers.get("content-type") || "").toLowerCase();
  let contentType = upstreamType || "application/octet-stream";
  if (head[0] === 0x47) contentType = "video/mp2t";
  else if (fragmentedMp4(head)) contentType = "video/mp4";
  else if (path.endsWith(".vtt") || head.slice(0, 6).toString() === "WEBVTT") contentType = "text/vtt; charset=utf-8";

  res.statusCode = upstream.status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  const len = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (len) res.setHeader("Content-Length", len);
  if (contentRange) res.setHeader("Content-Range", contentRange);
  if (head.length) res.write(head);
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    res.write(Buffer.from(next.value));
  }
  res.end();
}

async function handle(req, res) {
  let target;
  try {
    const host = req.headers.host || "127.0.0.1";
    target = new URL(req.url, `http://${host}`).searchParams.get("u");
  } catch {
    target = null;
  }
  if (!target || !/^https?:\/\//i.test(target)) {
    res.statusCode = 400;
    res.end("missing url");
    return;
  }

  const path = (req.url || "").split("?")[0];
  const isPlaylist = path.endsWith(".m3u8");
  const cacheKey = `${req.headers.host || ""}|${target}`;
  if (isPlaylist) {
    const hit = cachedPlaylist(cacheKey);
    if (hit) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.end(hit);
      return;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isPlaylist ? 20000 : 120000);
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const headers = headersFor(target);
    const targetPath = (() => {
      try {
        return new URL(target).pathname;
      } catch {
        return "";
      }
    })();
    const ranged = !isPlaylist && /\.(ts|mp4|m4s|aac|vtt|srt|png|jpe?g|woff2?)$/i.test(targetPath);
    if (ranged && req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers,
    });
    if (!upstream.ok && upstream.status !== 206) {
      res.statusCode = 502;
      res.end(`upstream ${upstream.status}`);
      return;
    }

    const upstreamType = (upstream.headers.get("content-type") || "").toLowerCase();
    if (isPlaylist || upstreamType.includes("mpegurl")) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      let text = buf.toString("utf8");
      const pageUrl = upstream.url || target;
      if (/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO/i.test(text) && /#EXT-X-STREAM-INF:/i.test(text)) {
        const muxed = await videoHasAudio(text, pageUrl, controller.signal).catch(() => false);
        if (muxed) {
          text = stripSideMedia(text);
        } else {
          const external = await audioWorks(text, pageUrl, controller.signal).catch(() => false);
          text = external ? videoOnlyCodecs(highestVariant(preferDefaultAudio(text))) : stripAudio(text);
        }
      }
      const body = rewritePlaylist(text, pageUrl, req);
      storePlaylist(cacheKey, body);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.end(body);
      return;
    }

    await pipeMedia(upstream, req, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 502;
    res.end(error.name === "AbortError" ? "timeout" : "upstream failed");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handle, playLink };
