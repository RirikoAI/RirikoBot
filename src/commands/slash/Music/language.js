const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("../../../helpers/language");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  name: "language",
  description: "It allows you to set the language of the bot.",
  permissions: "0x0000000000000020",
  options: [],
  voiceChannel: false,
  type: 1,
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   * @author umutxyp https://github.com/umutxyp/MusicBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Interaction} interaction
   *
   * @returns {Promise<*>}
   */
  run: async (client, interaction) => {
    let lang = getLang();
    try {
      // Create the first row of buttons
      const buttons = new ActionRowBuilder().addComponents(
        languageMappings.tr.button,
        languageMappings.en.button,
        languageMappings.nl.button,
        languageMappings.fr.button,
        languageMappings.ar.button
      );

      // Create the second row of buttons
      const buttons2 = new ActionRowBuilder().addComponents(
        languageMappings.pt.button,
        languageMappings.zh_TW.button,
        languageMappings.it.button,
        languageMappings.id.button,
        languageMappings.es.button
      );

      // Create the third row of buttons
      const buttons3 = new ActionRowBuilder().addComponents(
        languageMappings.ru.button
      );

      // Helper function to update language in the database

      // Create embed for language selection
      const embed = new EmbedBuilder()
        .setColor(client.config.embedColor)
        .setTitle("Select a language")
        .setTimestamp()
        .setFooter({ text: lang.footer1 });

      // Send the embed and buttons to the user
      interaction
        ?.reply({ embeds: [embed], components: [buttons, buttons2, buttons3] })
        .then(async (Message) => {
          const filter = (i) => i.user.id === interaction?.user?.id;
          const col = await Message.createMessageComponentCollector({
            filter,
            time: 30000,
          });

          col.on("collect", async (button) => {
            if (button.user.id !== interaction?.user?.id) return;

            const languageData = languageMappings[button.customId];
            if (!languageData) return;

            await updateLanguage(
              interaction?.guild?.id,
              languageData.language,
              languageData.content,
              interaction
            );
            await button?.deferUpdate().catch((e) => {});
            await col?.stop();
          });

          col.on("end", async (button, reason) => {
            if (reason === "time") {
              buttons.components.forEach((button) => {
                button.setDisabled(true);
              });

              buttons2.components.forEach((button) => {
                button.setDisabled(true);
              });

              buttons3.components.forEach((button) => {
                button.setDisabled(true);
              });

              embed
                .setTitle("Time ended, please try again.")
                .setFooter({ text: lang.footer1 });

              await interaction
                ?.editReply({
                  embeds: [embed],
                  components: [buttons, buttons2, buttons3],
                })
                .catch((e) => {});
            }
          });
        })
        .catch((e) => {});
    } catch (e) {
      console.error("error in ", e);
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};

// Helper function to create a button
function createButton(label, customId, emoji) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(emoji);
}

async function updateLanguage(guildID, language, content, interaction) {
  await db?.musicbot
    ?.updateOne(
      { guildID },
      {
        $set: {
          language,
        },
      },
      { upsert: true }
    )
    .catch((e) => {});

  await interaction
    ?.editReply({
      content,
      embeds: [],
      components: [],
      ephemeral: true,
    })
    .catch((e) => {});
}

const languageMappings = {
  tr: {
    language: "tr",
    content: "Botun dili başarıyla türkçe oldu. :flag_tr:",
    button: createButton("Türkçe", "tr", "🇹🇷"),
  },
  en: {
    language: "en",
    content: "Bot language successfully changed to english. :flag_gb:",
    button: createButton("English", "en", "🇬🇧"),
  },
  nl: {
    language: "nl",
    content: "De taal van de boot werd veranderd in nederlands. :flag_nl:",
    button: createButton("Nederlands", "nl", "🇳🇱"),
  },
  fr: {
    language: "fr",
    content:
      "La langue du bot a été modifiée avec succès en français. :flag_fr:",
    button: createButton("Français", "fr", "🇫🇷"),
  },
  pt: {
    language: "pt",
    content:
      "Língua do bot definida para Português - Brasil com sucesso. :flag_br:",
    button: createButton("Português", "pt", "🇧🇷"),
  },
  ar: {
    language: "ar",
    content: "تم تغيير لغة البوت بنجاح إلى اللغة العربية: :flag_ps:",
    button: createButton("العربية", "ar", "🇸🇦"),
  },
  zh_TW: {
    language: "zh_TW",
    content: "機器人成功設為正體中文 :flag_cn:",
    button: createButton("正體中文", "zh_TW", "🇨🇳"),
  },
  it: {
    language: "it",
    content: "La lingua del bot è stata cambiata in italiano. :flag_it:",
    button: createButton("Italiano", "it", "🇮🇹"),
  },
  id: {
    language: "id",
    content: "Bahasa bot dibuat dalam bahasa indonesia. :flag_id:",
    button: createButton("Indonesia", "id", "🇮🇩"),
  },
  es: {
    language: "es",
    content: "El idioma del bot se cambió con éxito al español. :flag_es:",
    button: createButton("Español", "es", "🇪🇸"),
  },
  ru: {
    language: "ru",
    content: "Язык бота успешно изменен на русский. :flag_ru:",
    button: createButton("Русский", "ru", "🇷🇺"),
  },
};
