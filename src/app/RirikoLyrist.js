import { lyristUrl } from "../helpers/getconfig";

const { getLang } = require("../helpers/language");
import axios from "axios";

class RirikoLyrist {
  constructor() {
    this.lang = getLang();
  }

  /**
   * Search lyrics by title only
   * @param {string} title
   * @returns {Promise<any|null>} Returns from Lyrist server {lyrics: "", title: "", artist: "", image: ""}
   */
  async search(title) {
    try {
      const res = await axios.get(`${lyristUrl()}/${processUrl(title)}`);
      return res.data;
    } catch (e) {
      console.error("Error getting lyrics from Lyrist", e.message);
      return null;
    }
  }

  /**
   * Search lyrics by title and artist
   * @param {string} title
   * @param {string} artist
   * @returns {Promise<any|null>} Returns from Lyrist server {lyrics: "", title: "", artist: "", image: ""}
   */
  async searchWithArtist(title, artist) {
    try {
      const res = await axios.get(
        `${lyristUrl()}/${processUrl(title)}/${processUrl(artist)}`
      );
      return res.data;
    } catch (e) {
      console.error("Error getting lyrics from Lyrist", e.message);
      return null;
    }
  }
}

function processUrl(value) {
  return value === undefined
    ? ""
    : value
        .replace(/[^a-z0-9_]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
}

module.exports = {
  RirikoLyrist,
};
