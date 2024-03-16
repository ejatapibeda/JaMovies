const axios = require("axios");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

async function getTmdbIdFromImdbId(imdbId) {
  const response = await axios.get(
    `https://api.themoviedb.org/3/find/${imdbId}?api_key=7ac6de5ca5060c7504e05da7b218a30c&external_source=imdb_id`
  );
  if (response.data.tv_results && response.data.tv_results.length > 0) {
    return response.data.tv_results[0].id;
  } else {
    throw new Error("No TV results found for the given IMDb ID");
  }
}

const builder = new addonBuilder({
  id: "org.ejakeren",
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
    const [imdbId, season, episode] = id.split(":");
    const tmdbId = await getTmdbIdFromImdbId(imdbId);
    url = `https://flixquest-api.vercel.app/vidsrcto/watch-tv?tmdbId=${tmdbId}&season=${season}&episode=${episode}`;
  }

  try {
    const response = await axios.get(url);
    const { sources } = response.data;
    return Promise.resolve({
      streams: sources.map((source) => ({
        url: source.url,
        title: `🎞️ VidSrcTo - ${source.quality}`,
      })),
    });
  } catch (error) {
    return Promise.reject();
  }
});

const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: 7000 });

console.log("Addon hosting on http://localhost:7000");
