async function imageChecker(url) {
  const res = await fetch(url);
  const buff = await res.blob();

  console.log("buff", buff);

  // temporarily add text/ to fix some issue
  return buff.type.startsWith("image/") || buff.type.startsWith("text/");
}

module.exports = imageChecker;
