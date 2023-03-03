import { getOrdinalSuffixOf } from "utils/language";

const Canvas = require("canvas");
Canvas.registerFont(path.resolve("assets/fonts/Roboto-Regular.ttf"), {
  family: "Roboto",
});

const Discord = require("discord.js");
const config = require("config");

import path from "path";

const dim = {
  height: 675,
  width: 1200,
  margin: 50,
};

const av = {
  size: 256,
  x: 480,
  y: 170,
};

const { QuickDB } = require("quick.db");
const db = new QuickDB();

const generateImage = async (member) => {
  let username = member.user.username;
  let discrim = member.user.discriminator;
  let avatarURL = member.user.displayAvatarURL({
    extension: "png",
    dynamic: false,
    size: av.size,
  });

  const canvas = Canvas.createCanvas(dim.width, dim.height);
  const ctx = canvas.getContext("2d");

  let bgUrl = await db.get(`guild_welcomer_welcomer_bg_${member.guild.id}`);

  let isDefault = false;

  if (!bgUrl) {
    bgUrl = config.welcomer.defaultImageUrl;
    isDefault = true;
  }

  // draw in the background
  const backimg = await Canvas.loadImage(bgUrl);
  ctx.drawImage(
    backimg,
    0,
    0,
    backimg.width,
    backimg.height, // source rectangle
    0,
    0,
    canvas.width,
    canvas.height
  );

  // draw black tinted box
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(
    dim.margin,
    dim.margin,
    dim.width - 2 * dim.margin,
    dim.height - 2 * dim.margin
  );

  const avimg = await Canvas.loadImage(avatarURL);
  ctx.save();

  ctx.beginPath();
  ctx.arc(
    av.x + av.size / 2,
    av.y + av.size / 2,
    av.size / 2,
    0,
    Math.PI * 2,
    true
  );
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(avimg, av.x, av.y);
  ctx.restore();

  // write in text
  ctx.fillStyle = "white";
  ctx.textAlign = "center";

  // draw in Welcome
  ctx.font = "50px Roboto";
  ctx.fillText(
    `Welcome to ${member.guild.name}`,
    dim.width / 2,
    dim.margin + 70
  );

  // draw in the username
  ctx.font = "60px Roboto";
  ctx.fillText(
    `${member.user.tag}`,
    dim.width / 2,
    dim.height - dim.margin - 125
  );

  const memberCount = getOrdinalSuffixOf(
    (await member.guild.members.fetch((member) => !member.user.bot)).size
  );

  // draw in to the server
  ctx.font = "40px Roboto";
  ctx.fillText(
    `You're the ${memberCount} member`,
    dim.width / 2,
    dim.height - dim.margin - 50
  );

  return {
    attachment: canvas.toBuffer(),
    name: "welcome.png",
  };
};

module.exports = generateImage;
