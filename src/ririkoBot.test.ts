const Discord = require("discord.js");
const { GatewayIntentBits, Partials } = require("discord.js");
const config = require("../config");

let mockClient;

jest.mock("ririko", () => ({
  once: jest.fn(),
  on: jest.fn(),
}));

describe("Client", () => {
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

    let guild = new Discord.Guild(mockClient, {
      id: Discord.SnowflakeUtil.generate(),
    });
    let user = new Discord.User(mockClient, {
      id: Discord.SnowflakeUtil.generate(),
    });
    let member = new Discord.GuildMember(
      mockClient,
      { id: Discord.SnowflakeUtil.generate(), user: { id: user.id } },
      guild
    );
    let role = new Discord.Role(
      mockClient,
      { id: Discord.SnowflakeUtil.generate() },
      guild
    );

    config.isMock = true;

    return mockClient;
  });

  it("should be able to load all prefix commands", async () => {
    ["prefix"].forEach((file) => {
      require(`./handlers/${file}.ts`)(mockClient, config);
    });
  });

  it("should be able to load all application commands (slash, user, message)", async () => {
    ["application_commands"].forEach((file) => {
      require(`./handlers/${file}`)(mockClient, config);
    });
  });

  it("should be able to load all prefix commands", async () => {
    ["modals"].forEach((file) => {
      require(`./handlers/${file}`)(mockClient, config);
    });
  });

  it("should be able to register all events", async () => {
    ["events"].forEach((file) => {
      require(`./handlers/${file}`)(mockClient, config);
    });
  });

  // it("should be able to create a MongoDB instance", async () => {
  //   ["mongoose"].forEach((file) => {
  //     require(`./handlers/${file}`)(mockClient, config);
  //   });
  // });
});
