const util = require("./src/util");

const honorifics = util.honorifics;
const nsfwAll = util.nsfwAll;
const sfwAll = util.sfwAll;
const searchAnime = util.searchAnime;
const searchManga = util.searchManga;
const getAnimeList = util.getWatchList;
const getMangaList = util.getMangaList;
const profile = util.profile;
const searchHonorific = util.honoFunction;
const nameHonorific = util.nameHonorific;
const sfw = util.nekoSfw;
const wallpaper = util.nekoWallpaper;

module.exports = {
  honorifics,
  nsfwAll,
  sfwAll,
  searchAnime,
  searchManga,
  getAnimeList,
  getMangaList,
  profile,
  searchHonorific,
  nameHonorific,
  sfw,
  wallpaper,
};
