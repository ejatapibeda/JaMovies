const axios = require("axios");

async function getStreams(type, imdbId, season, episode) {
  try {
    let url;
    if (type === "movie") {
      url = `https://vidsrcgw.vercel.app/vidsrc/${imdbId}`;
    } else if (type === "series") {
      url = `https://vidsrcgw.vercel.app/vidsrc/${imdbId}?s=${season}&e=${episode}`;
    }

    const response = await axios.get(url);
    const data = response.data;

    return data
      .map((item) => ({
        url: item.data.file,
        title: `🎞️ VidSrcTo - Auto`,
      }))
      .filter((stream) => stream.url && stream.url.startsWith("https://"));
  } catch (error) {
    throw new Error("Video not found in VidSrc");
  }
}

module.exports = {
  name: "VidSrc",
  getStreams,
};
