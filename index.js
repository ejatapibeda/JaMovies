const axios = require("axios");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const builder = new addonBuilder({
  id: "org.ejaddon",
  version: "1.0.0",
  name: "Eja Keren",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: [],
});

builder.defineStreamHandler(async ({ type, id }) => {
  let url;
  if (type === "movie") {
    url = `https://flixquest-api.vercel.app/vidsrcto/watch-movie?tmdbId=${id}`;
  } else if (type === "series") {
    const [tmdbId, season, episode] = id.split(":");
    url = `https://flixquest-api.vercel.app/vidsrcto/watch-tv?tmdbId=${tmdbId}&season=${season}&episode=${episode}`;
  }

  try {
    const response = await axios.get(url);
    const { sources } = response.data;
    return Promise.resolve({
      streams: sources.map((source) => ({
        url: source.url,
        title: `source: vidsrcto - ${source.quality}`,
      })),
    });
  } catch (error) {
    return Promise.reject();
  }
});

const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: 7000 });

console.log("Addon hosting on http://localhost:7000");
