const setPrefix = require("./set-prefix");
const Discord = require("discord.js");
const { GatewayIntentBits, Partials } = require("discord.js");

let mockClient;

const mockMessage = {
    reply: jest.fn(),
    guild: {
      id: "",
    },
  },
  mockConfig = {},
  prefix = "!",
  mockQuickDB = {
    set: jest.fn(),
  };

describe("prefix command > set-prefix", () => {
  beforeAll(() => {
    // Setup Mock discord API Client
    mockClient = new Discord.Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction,
      ],
      presence: {
        activities: [
          {
            name: "I am the future 🦾",
            type: 0,
          },
        ],
        status: "dnd",
      },
      restSweepInterval: 0,
    });
  });

  it("should be able to set prefix if correct argument supplied", async () => {
    await setPrefix.run(
      mockClient,
      mockMessage,
      ["!"],
      prefix,
      mockConfig,
      mockQuickDB
    );
  });

  it("shouldn't be able to set prefix if not correct argument supplied", async () => {
    await setPrefix.run(
      mockClient,
      mockMessage,
      [],
      prefix,
      mockConfig,
      mockQuickDB
    );
  });

  it("shouldn't be able to set prefix if not correct argument supplied", async () => {
    await setPrefix.run(
      mockClient,
      mockMessage,
      ["........"],
      prefix,
      mockConfig,
      mockQuickDB
    );
  });
});
