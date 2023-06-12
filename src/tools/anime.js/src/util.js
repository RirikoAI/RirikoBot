const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { Anime, Manga } = require("./animeSearchClass");
const { honorifics } = require("./db");
const { nsfw, sfw, nsfwAZ, sfwAZ } = require("./snfw");
const nekoURL = "https://nekos.life/api/v2";
const userAgentTxt = `kitsu.js, a npm module for the kitsu.io API.`;

module.exports.searchAnime = function (search, maxResult = "max") {
  return new Promise((resolve, reject) => {
    let page = 0;
    const searchTerm = encodeURIComponent(search);
    return fetch(
      `https://kitsu.io/api/edge/anime?filter[text]="${searchTerm}"&page[offset]=${page}`,
      {
        userAgent: userAgentTxt,
        options: {
          headers: {
            "User-Agent": userAgentTxt,
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
          },
        },
      }
    )
      .then((res) => res.json())
      .then((json) => {
        function NotIwannis(data) {
          if (maxResult > json.data.length) maxResult = json.data.length;
          if (maxResult == "max") maxResult = json.data.length;
          let roflis = [];
          function paoulo(info) {
            return new Anime(info);
          }
          for (let i = 0; i < maxResult; i++) {
            roflis.push(paoulo(json.data[i]));
          }
          return roflis;
        }
        resolve(NotIwannis());
      })
      .catch((err) => reject(new Error(`Couldn't fetch the api: ${err}`)));
  });
};

module.exports.searchManga = function (search, maxResult = "max") {
  return new Promise((resolve, reject) => {
    const searchTerm = encodeURIComponent(search);
    let page = 0;
    return fetch(
      `https://kitsu.io/api/edge/manga?filter[text]="${searchTerm}"&page[offset]=${page}`,
      {
        userAgent: userAgentTxt,
        options: {
          headers: {
            "User-Agent": userAgentTxt,
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
          },
        },
      }
    )
      .then((res) => res.json())
      .then((json) => {
        function lel(data) {
          if (maxResult > json.data.length) maxResult = json.data.length;
          if (maxResult == "max") maxResult = json.data.length;
          let flipblouk = [];

          function gourgourizeiToKefaliMou(info) {
            return new Manga(info);
          }
          for (let i = 0; i < maxResult; i++) {
            flipblouk.push(gourgourizeiToKefaliMou(json.data[i]));
          }
          return flipblouk;
        }
        resolve(lel());
      })
      .catch((err) => reject(new Error(`Couldn't fetch the api: ${err}`)));
  });
};

const getAnimeList = function (name, status = "all") {
  function exacute(resolve, reject) {
    fetch(`http://myanimelist.net/animelist/${name}/load.json`)
      .then((ress) => ress.json())
      .then((res) => {
        let animeStatus = {
          profileName: name,
          watching: [],
          completed: [],
          dropped: [],
          planToWatch: [],
        };
        for (let i = 0; i < res.length; i++) {
          switch (res[i].status) {
            case 1:
              animeStatus.watching.push(res[i].anime_title);
              break;
            case 2:
              animeStatus.completed.push(res[i].anime_title);
              break;
            case 4:
              animeStatus.dropped.push(res[i].anime_title);
              break;
            case 6:
              animeStatus.planToWatch.push(res[i].anime_title);
              break;
          }
        }
        switch (status) {
          case "all":
            resolve(animeStatus);
            break;
          case "watching":
            resolve({
              profileName: name,
              watching: animeStatus.watching,
            });
            break;
          case "completed":
            resolve({
              profileName: name,
              completed: animeStatus.completed,
            });
            break;
          case "dropped":
            resolve({
              profileName: name,
              dropped: animeStatus.dropped,
            });
            break;
          case "planToWatch":
            resolve({
              profileName: name,
              planTowatch: animeStatus.planToWatch,
            });
            break;
          default:
            reject(`[anime.js]: I don't know this status "${status}"`);
            break;
        }
      });
  }
  return new Promise(exacute);
};

module.exports.getWatchList = getAnimeList;

const getMangaList = function (name, status = "all") {
  function exacute(resolve, reject) {
    fetch(`http://myanimelist.net/mangalist/${name}/load.json`)
      .then((ress) => ress.json())
      .then((res) => {
        let mangaStatus = {
          profileName: name,
          reading: [],
          completed: [],
          dropped: [],
          planToRead: [],
        };
        for (let i = 0; i < res.length; i++) {
          console.info("res[i]", res[i]);
          switch (res[i].status) {
            case 1:
              mangaStatus.reading.push(res[i].manga_title);
              break;
            case 2:
              mangaStatus.completed.push(res[i].manga_title);
              break;
            case 4:
              mangaStatus.dropped.push(res[i].manga_title);
              break;
            case 6:
              mangaStatus.planToRead.push(res[i].manga_title);
              break;
          }
        }
        switch (status) {
          case "all":
            resolve(mangaStatus);
            break;
          case "watching":
            resolve({
              profileName: name,
              watching: mangaStatus.watching,
            });
            break;
          case "completed":
            resolve({
              profileName: name,
              completed: mangaStatus.completed,
            });
            break;
          case "dropped":
            resolve({
              profileName: name,
              dropped: mangaStatus.dropped,
            });
            break;
          case "planToWatch":
            resolve({
              profileName: name,
              planToRead: mangaStatus.planToRead,
            });
            break;
          default:
            resolve({ err: 1 });
            break;
        }
      });
  }
  return new Promise(exacute);
};

module.exports.getMangaList = getMangaList;

module.exports.profile = (name, callback) => {
  async function getInfo(resolve, reject) {
    let animeStatistic = await getAnimeList(name, "all");
    let mangaStatistic = await getMangaList(name, "all");
    let profile = {
      name: name,
      gender: null,
      birthday: null,
      last_online: null,
      user_pfp: null,
      friends: [],
      favorite: {
        anime: [],
        manga: [],
        character: [],
        people: [],
      },
      stats: {
        anime: {
          watching: animeStatistic.watching.length,
          completed: animeStatistic.completed.length,
          dropped: animeStatistic.dropped.length,
          planToWatch: animeStatistic.planToWatch.length,
          episodes: 0,
        },
        manga: {
          reading: mangaStatistic.reading.length,
          completed: mangaStatistic.completed.length,
          dropped: mangaStatistic.dropped.length,
          planToRead: mangaStatistic.planToRead.length,
          chapters: 0,
          volumes: 0,
        },
      },
      anime: {
        watching: animeStatistic.watching,
        completed: animeStatistic.completed,
        dropped: animeStatistic.dropped,
        planToWatch: animeStatistic.planToWatch,
      },
      manga: {
        reading: mangaStatistic.reading,
        completed: mangaStatistic.completed,
        dropped: mangaStatistic.dropped,
        planToRead: mangaStatistic.planToRead,
      },
    };
    fetch("https://myanimelist.net/profile/" + name)
      .then((ress) => ress.text())
      .then((res) => {
        let $ = cheerio.load(res);
        let UserNotFound = $('h1[class="h1"]');
        if (UserNotFound && $(UserNotFound).html() == "404 Not Found") {
          return callback(
            null,
            `I don\'t know any user with this name "${name}"`
          );
        }
        let lolota = $('li[class="clearfix mb12"]').find("span").toArray();
        for (let i = 0; i < lolota.length; i++) {
          switch ($(lolota[i]).html()) {
            case "Episodes":
              profile.stats.anime.episodes = parseFloat(
                $(lolota[i + 1])
                  .html()
                  .replace(/\,/g, "")
              );
              break;
            case "Chapters":
              profile.stats.manga.chapters = parseFloat(
                $(lolota[i + 1])
                  .html()
                  .replace(/\,/g, "")
              );
              break;
            case "Volumes":
              profile.stats.manga.volumes = parseFloat(
                $(lolota[i + 1])
                  .html()
                  .replace(/\,/g, "")
              );
              break;
          }
        }
        let cs = $('li[class="clearfix"]').find("span").toArray();
        for (let i = 0; i < cs.length; i++) {
          switch ($(cs[i]).html()) {
            case "Gender":
              profile.gender = $(cs[i + 1]).html();
              break;
            case "Birthday":
              profile.birthday = $(cs[i + 1]).html();
              break;
            case "Last Online":
              profile.last_online = $(cs[i + 1]).html();
              break;
          }
        }
        let user_pfp = $('div[class="user-image mb8"]').find("img")[0].attribs;

        let favoriteTag = $('ul[class="favorites-list anime"]')
          .find('div[class="di-tc va-t pl8 data"] > a')
          .toArray();
        for (let i = 0; i < favoriteTag.length; i++) {
          profile.favorite.anime.push(
            $(favoriteTag[i]).html().replace(/(\s+)/g, "")
          );
        }

        let a_ghost = $('ul[class="favorites-list manga"]')
          .find('div[class="di-tc va-t pl8 data"] > a')
          .toArray();
        for (let i = 0; i < a_ghost.length; i++) {
          profile.favorite.manga.push(
            $(a_ghost[i]).html().replace(/(\s+)/g, "")
          );
        }
        let characterTag = $('ul[class="favorites-list characters"]')
          .find('div[class="di-tc va-t pl8 data"] > a')
          .toArray();
        for (let i = 0; i < characterTag.length; i++) {
          profile.favorite.character.push(
            $(characterTag[i]).html().replace(/(\s+)/g, "")
          );
        }
        let peopleTag = $('ul[class="favorites-list people"]')
          .find('div[class="di-tc va-t pl8 data"] > a')
          .toArray();
        for (let i = 0; i < peopleTag.length; i++) {
          profile.favorite.people.push(
            $(peopleTag[i]).html().replace(/(\s+)/g, "")
          );
        }
        profile.user_pfp = Object.values(user_pfp)[1];
        fetch(`https://myanimelist.net/profile/${name}/friends`)
          .then((ress) => ress.text())
          .then((res) => {
            let friendsList = [];
            let _ = cheerio.load(res);
            let larose = _('div[class="user-friends pt4 pb12"]')
              .find("a")
              .toArray();
            for (let i = 0; i < larose.length; i++) {
              profile.friends.push(_(larose[i]).html());
            }
            callback(profile, null);
          });
      });
  }
  getInfo();
};

module.exports.sfwAll = function () {
  return sfwAZ;
};
