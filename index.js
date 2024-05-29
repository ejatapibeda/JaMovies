const express = require("express");
const axios = require("axios");
const { parse } = require("url");

const app = express();
const port = process.env.PORT || 3000;

function splitM3U(m3uContent, baseUrl) {
  const resolutions = {
    "640x360": null,
    "854x480": null,
    "1280x720": null,
    "1920x1080": null,
    auto: null,
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

      if (currentResolution === "auto") {
        resolutions[currentResolution] = baseUrl;
      }
    } else if (currentResolution) {
      resolutions[currentResolution] = new URL(line, baseUrl).href;
      currentResolution = null;
    }
  }

  return resolutions;
}

app.use(express.json());

app.post("/split_m3u", async (req, res) => {
  const { m3u_url: m3uUrl } = req.body;

  if (!m3uUrl) {
    return res.status(400).json({ error: "No m3u_url provided" });
  }

  try {
    const response = await axios.get(m3uUrl);

    if (response.status !== 200) {
      return res.status(400).json({ error: "Failed to download M3U file" });
    }

    const m3uContent = response.data;
    const baseUrl = parse(m3uUrl).href;
    const resolutions = splitM3U(m3uContent, baseUrl);

    resolutions["auto"] = m3uUrl;
    return res.json(resolutions);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
