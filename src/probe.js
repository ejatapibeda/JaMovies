const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const PROBE_TIMEOUT_MS = 7000;
const CONCURRENCY = 5;

function headersFor(_url, extra) {
  return {
    "User-Agent": UA,
    Accept: "*/*",
    Referer: "https://nxsha.space/",
    Origin: "https://nxsha.space",
    ...extra,
  };
}

async function readSome(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < max) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

function isHtml(buf) {
  const head = buf.slice(0, 40).toString("utf8").trim().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}

function nextUri(text, base) {
  if (!text.includes("#EXTM3U")) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const master = lines.some((line) => line.startsWith("#EXT-X-STREAM-INF"));
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    return { url: new URL(line, base).href, master };
  }
  return null;
}

async function open(url, signal) {
  const res = await fetch(url, { signal, redirect: "follow", headers: headersFor(url) });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const buf = await readSome(res, 256 * 1024);
  return { buf, finalUrl: res.url || url };
}

function isDirectFile(url) {
  return /\.(mp4|mkv|webm)(\?|#|$)/i.test(url || "");
}

function isVideoFile(buf) {
  if (!buf || buf.length < 12 || isHtml(buf)) return false;
  if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
  return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

async function directAlive(url, signal) {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: headersFor(url, { Range: "bytes=0-2047" }),
  });
  if (res.status !== 200 && res.status !== 206) {
    await res.body?.cancel().catch(() => {});
    return false;
  }
  const buf = await readSome(res, 2048);
  return isVideoFile(buf);
}

async function segmentAlive(url, signal) {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: headersFor(url, { Range: "bytes=0-2047" }),
  });
  if (res.status !== 200 && res.status !== 206) {
    await res.body?.cancel().catch(() => {});
    return false;
  }
  const buf = await readSome(res, 2048);
  return buf.length > 16 && !isHtml(buf);
}

// Master playlist -> variant playlist -> segmen pertama harus mengembalikan byte.
async function canPlay(stream) {
  const url = stream.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    if (stream._direct || isDirectFile(url)) return await directAlive(url, controller.signal);

    const top = await open(url, controller.signal);
    if (!top || isHtml(top.buf)) return false;

    const text = top.buf.toString("utf8");
    let target = nextUri(text, top.finalUrl);
    if (!target) return top.buf.length > 16;

    if (target.master) {
      const variant = await open(target.url, controller.signal);
      if (!variant) return false;
      const media = nextUri(variant.buf.toString("utf8"), variant.finalUrl);
      if (!media || media.master) return false;
      target = media;
    }
    return await segmentAlive(target.url, controller.signal);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function filterPlayable(streams) {
  const alive = new Array(streams.length).fill(false);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, streams.length) }, async () => {
    while (cursor < streams.length) {
      const index = cursor++;
      alive[index] = await canPlay(streams[index]);
    }
  });
  await Promise.all(workers);
  return {
    streams: streams.filter((_, index) => alive[index]),
    checked: streams.length,
    playable: alive.filter(Boolean).length,
  };
}

module.exports = { filterPlayable };
