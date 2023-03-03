const colors = require("colors");
const config = require("config");

const getLang = () => {
  const lang = config.LANGUAGE;
  return require(`../../languages/${lang}.js`);
};

function getOrdinalSuffixOf(i) {
  let j = i % 10,
    k = i % 100;
  if (j == 1 && k != 11) {
    return i + "st";
  }
  if (j == 2 && k != 12) {
    return i + "nd";
  }
  if (j == 3 && k != 13) {
    return i + "rd";
  }
  return i + "th";
}

module.exports = { getLang, getOrdinalSuffixOf };
