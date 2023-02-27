const config = require("config");
const getconfig = require("utils/getconfig");

module.exports = (client) => {
  console.log("[MONGODB] Connecting to MongoDB...".yellow);
  const mongoURI = getconfig.mongoAccessURI();

  if (!mongoURI) {
    console.warn("[WARN] A Mongo URI/URL isn't provided! (Not required)");
  } else {
    // soon will connect MongoDB here
    console.log("[MONGODB] Not implemented".yellow);
  }
};
