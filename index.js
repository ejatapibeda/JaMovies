const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const { getStreams } = require("./src/streams");
const { runWithRequest } = require("./src/origin");
const play = require("./src/play");

const manifest = {
  id: "org.jamovies",
  version: "2.0.0",
  name: "JaMovies",
  description: "Stream film dan series lewat scraper nxsha (m3u8 langsung).",
  logo: "https://i.imgur.com/QhZlCx6.jpg",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt", "tmdb"],
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  const [mediaId, season, episode] = String(id || "").split(":");
  try {
    const streams = await getStreams(type, mediaId, season, episode);
    console.log(`[jamovies] ${type} ${id} -> ${streams.length} stream`);
    return { streams };
  } catch (error) {
    console.error(`[jamovies] ${type} ${id} gagal:`, error.message);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const path = (req.url || "").split("?")[0];
  runWithRequest(req, () => {
    if (path.startsWith("/play/")) {
      play.handle(req, res);
      return;
    }
    router(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  });
}

module.exports = handler;

if (require.main === module) {
  const http = require("http");
  const port = Number(process.env.PORT) || 7000;
  http.createServer(handler).listen(port, () => {
    console.log(`JaMovies http://localhost:${port}/manifest.json`);
  });
}
