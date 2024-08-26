const axios = require("axios");
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

async function getStreams(type, imdbId, season, episode) {
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

    if (!Stream || !Stream.stream || !Stream.stream.playlist) {
      throw new Error("Invalid stream data received from provider");
    }
    const playlistUrl = Stream.stream.playlist;
    const url = new URL(playlistUrl).searchParams.get("url");

    if (!url) {
      throw new Error("URL parameter not found in playlist URL");
    }
    const decodedUrl = decodeURIComponent(url);

    return [
      {
        url: decodedUrl,
        title: `🎞️ NSBX - HLS Stream`,
      },
    ];
  } catch (error) {
    throw new Error("Failed to get streaming links from MovieWeb");
  }
}

module.exports = {
  name: "MovieWeb",
  getStreams,
};
