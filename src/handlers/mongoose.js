const config = require("../../config.js");

module.exports = (client) => {
  console.log("[MONGODB] Connecting to MongoDB...".yellow);
  const mongoURI = process.env.MONGO || config.DATABASE.MongoDB.AccessURI;

  if (!mongoURI) {
    console.warn("[WARN] A Mongo URI/URL isn't provided! (Not required)");
  } else {
    // soon will connect MongoDB here
    console.log("[MONGODB] Not implemented".yellow);
  }
};
