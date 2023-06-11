/**
 * This will be deprecated before version 1.0.0
 * todo: remove this file before 1.0.0
 */
const { Schema, model } = require("mongoose");
const mongoose = require("mongoose");

const musicbot =
  mongoose.models.musicbot ||
  model(
    "musicbot",
    Schema({
      guildID: String,
      role: String,
      language: String,
      channels: Array,
    })
  );

const playlist =
  mongoose.models.playlist ||
  model(
    "playlist",
    Schema({
      userID: String,
      playlist: Array,
      musics: Array,
    })
  );

module.exports = {
  musicbot: musicbot,
  playlist: playlist,
};
