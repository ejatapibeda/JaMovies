const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const vidsrcProvider = require("./providers/vidsrc");
const mwapi = require("./providers/mwapi");
const apieJakerenProvider = require("./providers/apieJakeren");

const primaryProviders = [mwapi, vidsrcProvider]; // You can change the order or providers here
const secondaryProviders = [apieJakerenProvider];

const builder = new addonBuilder({
  id: "org.jamovies",
  version: "1.2.6",
  name: "JaMovies",
  logo: "https://i.imgur.com/QhZlCx6.jpg",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: [],
});

builder.defineStreamHandler(async ({ type, id }) => {
  let streams = [];
  const [imdbId, season, episode] = id.split(":");

  // Try primary providers first
  for (const provider of primaryProviders) {
    try {
      streams = await provider.getStreams(type, imdbId, season, episode);
      if (streams.length > 0) break;
    } catch (error) {
      console.error(
        `Error in primary provider ${provider.name}:`,
        error.message
      );
    }
  }

  // If no streams found, try secondary providers
  if (streams.length === 0) {
    for (const provider of secondaryProviders) {
      try {
        streams = await provider.getStreams(type, imdbId, season, episode);
        if (streams.length > 0) break;
      } catch (error) {
        console.error(
          `Error in secondary provider ${provider.name}:`,
          error.message
        );
      }
    }
  }

  return { streams };
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
