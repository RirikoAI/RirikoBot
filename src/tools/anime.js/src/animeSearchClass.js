class Anime {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.synopsis = data.attributes.synopsis;
    this.titles = {
      english: data.attributes.titles.en,
      romaji: data.attributes.titles.en_jp,
      japanese: data.attributes.titles.ja_jp
    };
    this.averageRating = data.attributes.averageRating;
    this.ratingFrequencies = data.attributes.ratingFrequencies;
    this.userCount = data.attributes.userCount;
    this.favoritesCount = data.attributes.favoritesCount;
    this.startDate = data.attributes.startDate;
    this.endDate = data.attributes.endDate;
    this.popularityRank = data.attributes.popularityRank;
    this.ratingRank = data.attributes.ratingRank;
    this.ageRating = data.attributes.ageRating;
    this.ageRatingGuide = data.attributes.ageRatingGuide;
    this.subType = data.attributes.subtype;
    this.posterImage = data.attributes.posterImage;
    this.coverImage = data.attributes.coverImage;
    this.episodeCount = data.attributes.episodeCount;
    this.episodeLength = data.attributes.episodeLength;
    this.showType = data.attributes.showType;
    this.nsfw = data.attributes.nsfw;
    this.youtubeVideoId = `https://www.youtube.com/watch?v=${data.attributes.youtubeVideoId}`;
  }
}

module.exports.Anime = Anime;

class Manga {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.synopsis = data.attributes.synopsis;
    this.titles = {
      en: data.attributes.titles.en,
      enJp: data.attributes.titles.en_jp,
      canonicalTitle: data.attributes.canonical_title,
      abbreviatedTitles: data.attributes.abbreviatedTitles
    };
    this.averageRating = data.attributes.averageRating;
    this.ratingFrequencies = data.attributes.ratingFrequencies;
    this.userCount = data.attributes.userCount;
    this.favoritesCount = data.attributes.favoritesCount;
    this.startDate = data.attributes.startDate;
    this.endDate = data.attributes.endDate;
    this.popularityRank = data.attributes.popularityRank;
    this.ratingRank = data.attributes.ratingRank;
    this.ageRating = data.attributes.ageRating;
    this.ageRatingGuide = data.attributes.ageRatingGuide;
    this.subType = data.attributes.subtype;
    this.posterImage = data.attributes.posterImage;
    this.coverImage = data.attributes.coverImage;
    this.chapterCount = data.attributes.chapterCount;
    this.volumeCount = data.attributes.volumeCount;
    this.serialization = data.attributes.serialization;
    this.mangaType = data.attributes.mangaType;
  }
}

module.exports.Manga = Manga;
