const axios = require("axios");

async function getStreams(type, imdbId, season, episode) {
  try {
    const url =
      type === "movie"
        ? `https://apiejakeren.vercel.app/movie/${imdbId}`
        : `https://apiejakeren.vercel.app/tv/season/${season}/episode/${episode}`;

    const response = await axios.get(url);
    const data = response.data;

    return data.map((item) => ({
      url: item.url,
      title: `🎞️ ApieJakeren - ${item.quality}`,
    }));
  } catch (error) {
    throw new Error(
      "Error fetching streams from ApieJakeren: " + error.message
    );
  }
}

module.exports = {
  name: "ApieJakeren",
  getStreams,
};
