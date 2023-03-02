<h1 align="center">Welcome to anime.js 👋</h1>
<p align="center">
  <img src="https://img.shields.io/npm/v/../../tools/modules/anime.js?orange=blue" />
  <a href="https://www.npmjs.com/package/../../tools/modules/anime.js">
    <img alt="downloads" src="https://img.shields.io/npm/dm/../../tools/modules/anime.js.svg?color=blue" target="_blank" />
  </a>
  <a href="https://github.com/freezegr/insta.js/blob/master/LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow.svg" target="_blank" />
  </a>
  <a href="https://discord.gg/pQdhaUBFcc">
    <img src="https://img.shields.io/static/v1?label=owner&message=freezegr&color=blue" alt="owner">
  </a>
</p>

---

- [Installation](#Installation)
    - [Anime-Manga Search](#Anime-Manga-Search)
    - [MyAnimeList profile](#MyAnimeList-profile)
    - [Get my anime list](#Get-my-anime-list)
    - [Honorifics](#Honorifics)
    - [NSFW](#NSFW)
    - [SFW](#SFW)
    - [Wallpaper](#Wallpaper)
- [Coming soon](#Comming-soon)
  - [Seasonal Anime](#Seasonal-Anime)
  - [Meme](#Meme)
- [Support](https://discord.gg/pQdhaUBFcc)

## Installation 

`npm i @freezegole/anime.js --save`

## Anime-Manga Search

```js
const anime = require('../../tools/modules/anime.js');

anime.searchAnime('attack on titan', 1).then(res => { //1 = maxResult
	console.log(res);
});

anime.searchManga('attack on titan', "max").then(res => { 
	console.log(res);
});
```

## MyAnimeList profile

```js
anime.profile('freezegr', (res, err) => { //max = maxResult
	if(err) throw new Error(err)
	console.log(res)
});
```

## Get my anime list

```js
anime.getAnimeList('freezegr', 'watching').then(res => { //freezegr myanimelist account and watching is status
	console.log(res);
})
```

## Honorifics

```js
anime.searchHonorifics('san').then(res => {
	console.log(res)
});

anime.nameHonorifics(freezegr, "san").then(res => {
	console.log(res)
});
```

## NSFW 

```js
anime.nsfw('anal').then(res=> {
	console.log(res)
});
```

## SFW 

```js
anime.sfw('kiss').then(res=> {
	console.log(res)
});
//all nsfw and all sfw => console.log(anime.nfswAll()) / console.log(anime.sfwAll())
```

## Wallpaper 

```js
anime.wallpaper.thne(res=>{
	console.log(res)
});
```
<h1 align="center">Comming soon</h1>

---

## Seasonal Anime

```js
//comming soon
anime.seasonal().then((res) => {
  console.log(res)
});
```
## Meme
```js
//comming soon
anime.meme().then(res => {
	console.log(res)
});
```
