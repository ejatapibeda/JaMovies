const axios = require("axios");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const {
  makeProviders,
  makeStandardFetcher,
  targets,
} = require("@movie-web/providers");

const fetcher = makeStandardFetcher(fetch);
const providers = makeProviders({
  fetcher: fetcher,
  target: targets.NATIVE,
});

async function getTmdbIdFromImdbId(imdbId, type) {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=7ac6de5ca5060c7504e05da7b218a30c&external_source=imdb_id`
    );
    const results =
      type === "movie" ? response.data.movie_results : response.data.tv_results;

    if (results && results.length > 0) {
      return results[0].id;
    } else {
      throw new Error(
        `No ${
          type === "movie" ? "movie" : "TV"
        } results found for the given IMDb ID`
      );
    }
  } catch (error) {
    throw new Error(`Error fetching TMDB ID: ${error.message}`);
  }
}

async function getStreams(url) {
  try {
    const response = await axios.get(url);
    const data = response.data;
    const streams = [];

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

async function getStreamsFromProvider(imdbId, type, season, episode) {
  try {
    const tmdbId = await getTmdbIdFromImdbId(imdbId, type);

    const media = {
      type: type === "movie" ? "movie" : "show",
      title: "",
      releaseYear: "",
      tmdbId: tmdbId,
      episode: type === "series" ? { number: episode } : undefined,
      season: type === "series" ? { number: season } : undefined,
    };

    if (type === "movie") {
      const movieResponse = await axios.get(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=7ac6de5ca5060c7504e05da7b218a30c`
      );
      const movieData = movieResponse.data;

      media.title = movieData.title;
      media.releaseYear = movieData.release_date.split("-")[0];
    } else if (type === "series") {
      const tvResponse = await axios.get(
        `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=7ac6de5ca5060c7504e05da7b218a30c`
      );
      const tvData = tvResponse.data;

      media.title = tvData.name;
      media.releaseYear = tvData.first_air_date.split("-")[0];
    }

    const Stream = await providers.runAll({
      media: media,
      sourceOrder: ["nsbx"],
    });

    const qualities = Object.keys(Stream.stream.qualities);
    const streams = [];
    qualities.forEach((quality) => {
      streams.push({
        url: Stream.stream.qualities[quality].url,
        title: `🎞️ NSBX - ${quality}`,
      });
    });

    return streams;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw new Error("Failed to get streaming links");
  }
}

const builder = new addonBuilder({
  id: "org.jamovies",
  version: "1.2.5",
  name: "JaMovies",
  logo: "https://i.imgur.com/QhZlCx6.jpg",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: [],
});

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    let url;
    if (type === "movie") {
      url = `https://vidsrc-api-bice.vercel.app/${id}`;
    } else if (type === "series") {
      const [imdbId, season, episode] = id.split(":");
      url = `https://vidsrc-api-bice.vercel.app/${imdbId}?s=${season}&e=${episode}`;
    }
    return { streams: await getStreams(url) };
  } catch (error) {
    const [imdbId, season, episode] = id.split(":");
    return {
      streams: await getStreamsFromProvider(imdbId, type, season, episode),
    };
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
