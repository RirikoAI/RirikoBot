async function imageChecker(url) {
  const res = await fetch(url);
  const buff = await res.blob();

  console.log("buff", buff);

  // temporarily disable this checker to fix some security issue
  // return buff.type.startsWith("image/") || buff.type.startsWith("text/");
  return true;
}

module.exports = imageChecker;
