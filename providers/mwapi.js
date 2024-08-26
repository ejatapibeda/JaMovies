const axios = require("axios");

async function getStreams(type, id, season, episode) {
  try {
    const url =
      type === "movie"
        ? `https://mwapi.vercel.app/api/${id}`
        : `https://mwapi.vercel.app/api/${id}/${season}/${episode}`;

    const response = await axios.get(url);
    const data = response.data;

    // Check if data is an array
    if (Array.isArray(data)) {
      return data.map(processStreamItem).filter((item) => item !== null);
    }
    // Check if data is an object
    else if (typeof data === "object" && data !== null) {
      // If it's a single object, wrap it in an array
      return [processStreamItem(data)].filter((item) => item !== null);
    } else {
      throw new Error("Unexpected response structure");
    }
  } catch (error) {
    console.error("Full error:", error);
    throw new Error(
      "Error fetching streams from MWAPI: " +
        (error.response?.data || error.message)
    );
  }
}

function processStreamItem(item) {
  if (item.sourceId === "whvx") {
    const qualities = item.stream?.qualities;
    if (qualities) {
      const availableQualities = Object.keys(qualities);
      const highestQuality = availableQualities[availableQualities.length - 1];

      return {
        url: qualities[highestQuality].url,
        title: `🎞️ MWAPI - ${item.sourceId} - ${highestQuality}`,
        quality: highestQuality,
        type: "mp4",
      };
    }
  } else if (item.sourceId === "nsbx") {
    if (item.stream?.playlist) {
      return {
        url: item.stream.playlist,
        title: `🎞️ MWAPI - ${item.sourceId} - Auto`,
        quality: "Auto",
        type: "hls",
      };
    }
  }
  // Handle other sourceIds if needed
  return null;
}

module.exports = {
  name: "MWAPI",
  getStreams,
};
