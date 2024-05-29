const axios = require("axios");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { URL } = require("url");

// Fungsi splitM3UFromUrl
async function splitM3UFromUrl(m3uUrl) {
  try {
    const response = await axios.get(m3uUrl);

    if (response.status !== 200) {
      throw new Error("Failed to download M3U file");
    }

    const m3uContent = response.data;
    const baseUrl = new URL(m3uUrl);

    const resolutions = {
      "640x360": null,
      "854x480": null,
      "1280x720": null,
      "1920x1080": null,
      auto: m3uUrl, // Default to the base m3u URL for auto
    };

    const lines = m3uContent.split("\n");
    let currentResolution = null;

    for (const line of lines) {
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        if (line.includes("RESOLUTION=")) {
          currentResolution = line.split("RESOLUTION=")[1].split(",")[0];
        } else {
          currentResolution = "auto";
        }
      } else if (currentResolution) {
        resolutions[currentResolution] = new URL(line, baseUrl.href).href;
        currentResolution = null;
      }
    }

    return resolutions;
  } catch (error) {
    throw new Error(`Error processing M3U file: ${error.message}`);
  }
}

class StreamHandler {
  static async getTmdbIdFromImdbId(imdbId) {
    const response = await axios.get(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=7ac6de5ca5060c7504e05da7b218a30c&external_source=imdb_id`
    );
    if (response.data.tv_results && response.data.tv_results.length > 0) {
      return response.data.tv_results[0].id;
    } else {
      throw new Error("No TV results found for the given IMDb ID");
    }
  }

  static async getStreamsNewLink(url) {
    try {
      const response = await axios.get(url);
      const data = response.data;
      let streams = [];

      if (data.source && data.source.startsWith("https://")) {
        const sources = await splitM3UFromUrl(data.source);

        for (const resolution in sources) {
          if (sources.hasOwnProperty(resolution) && sources[resolution]) {
            streams.push({
              url: sources[resolution],
              title: `🎞️ VidSrcTo - ${resolution}`,
            });
          }
        }
      }

      return streams;
    } catch (error) {
      throw new Error("Video not found");
    }
  }
}

const builder = new addonBuilder({
  id: "org.jamovies",
  version: "1.2.2",
  name: "JaMovies",
  logo: "https://i.imgur.com/QhZlCx6.jpg",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: [],
});

builder.defineStreamHandler(async ({ type, id }) => {
  let url;
  if (type === "movie") {
    url = `https://vidsrc-api-bice.vercel.app/${id}`;
  } else if (type === "series") {
    const [imdbId, season, episode] = id.split(":");
    url = `https://vidsrc-api-bice.vercel.app/${imdbId}?s=${season}&e=${episode}`;
  }

  try {
    return { streams: await StreamHandler.getStreamsNewLink(url) };
  } catch (error) {
    throw new Error("Failed to retrieve streams");
  }
});

const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: 7000 });

console.log("Addon hosting on http://localhost:7000");
