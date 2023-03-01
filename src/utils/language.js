const colors = require("colors");
const config = require("config");

const getLang = () => {
  const lang = config.LANGUAGE;
  return require(`../../languages/${lang}.js`);
};

module.exports = { getLang };
