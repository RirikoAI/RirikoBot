const chunkByLines = (text, length) => {
  const lines = text.split("\n");
  const chunks = [];
  const chunk = [];

  for (const line of lines) {
    if (chunk.concat(line).join("\n").length > length) {
      chunks.push([...chunk].join("\n"));
      chunk.length = 0;
    }

    chunk.push(line);
  }

  chunks.push(chunk.join("\n"));

  return chunks;
};

module.exports = { chunkByLines };
