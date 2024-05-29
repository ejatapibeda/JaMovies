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

async function getStreamsFlixquest(url) {
  try {
    const response = await axios.get(url);
    const { sources } = response.data;
    return sources.map((source) => ({
      url: source.url,
      title: `🎞️ VidSrcTo - ${source.quality}`,
    }));
  } catch (error) {
    throw new Error("Video not found");
  }
}

async function getStreamsVsrcme(url) {
  try {
    const response = await axios.get(url);
    const data = response.data;
    let streams = [];

    for (const item of data) {
      if (
        !item.data ||
        !item.data.file ||
        !item.data.file.startsWith("https://")
      ) {
        continue;
      }

      streams.push({
        url: item.data.file,
        title: `🎞️ ${item.name} - Auto`,
      });
    }

    return streams;
  } catch (error) {
    throw new Error("Video not found");
  }
}

async function getStreamsNewLink(url) {
  try {
    const response = await axios.get(url);
    const data = response.data;
    let streams = [];

    if (data.source && data.source.startsWith("https://")) {
      streams.push({
        url: data.source,
        title: `🎞️ VidSrcTo - Auto`,
      });
    }

    return streams;
  } catch (error) {
    throw new Error("Video not found");
  }
}

const builder = new addonBuilder({
  id: "org.jamovies",
  version: "1.2.1",
  name: "JaMovies",
  logo: "https://i.imgur.com/QhZlCx6.jpg",
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
    if (url.includes("flixquest")) {
      return { streams: await getStreamsFlixquest(url) };
    }
  } catch (error) {
    if (type === "movie") {
      url = `https://vidsrc-api-bice.vercel.app/${id}`;
    } else if (type === "series") {
      const [imdbId, season, episode] = id.split(":");
      url = `https://vidsrc-api-bice.vercel.app/${imdbId}?s=${season}&e=${episode}`;
    }

    try {
      return { streams: await getStreamsNewLink(url) };
    } catch (error) {
      if (type === "movie") {
        url = `https://srcvid.vercel.app/vsrcme/${id}`;
      } else if (type === "series") {
        const [imdbId, season, episode] = id.split(":");
        const tmdbId = await getTmdbIdFromImdbId(imdbId);
        url = `https://srcvid.vercel.app/${tmdbId}?s=${season}&e=${episode}`;
      }

      try {
        return { streams: await getStreamsVsrcme(url) };
      } catch (error) {
        return Promise.reject();
      }
    }
  }
});

process.on("uncaughtException", function (err) {
  console.error("Caught exception: ", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: 7000 });

console.log("Addon hosting on http://localhost:7000");
