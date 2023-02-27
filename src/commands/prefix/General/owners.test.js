const owners = require("./owners");
const getconfig = require("utils/getconfig");

jest.mock("discord.js", () => ({
  EmbedBuilder: () => {
    return new (class {
      setAuthor = () => {
        return this;
      };

      setDescription = () => {
        return this;
      };

      setFooter = () => {
        return this;
      };

      setColor = () => {
        return this;
      };
    })();
  },
}));

jest.mock("utils/getconfig");

let mockClient;

const mockMessage = {
    reply: jest.fn(),
    guild: {
      id: "",
      members: {
        cache: {
          get: jest.fn(),
        },
      },
    },
  },
  mockArgs = ["!"],
  mockConfig = {},
  prefix = "!",
  mockQuickDB = {
    set: jest.fn(),
  };

describe("prefix command > owners", () => {
  beforeAll(() => {
    // Setup Mock discord API Client
    mockClient = {
      prefix_commands: [
        {
          config: {
            name: "owners",
            description: "Replies with the registered owners only.",
          },
          permissions: ["SendMessages"],
          owner: true,
          run: "",
        },
      ],

      user: {
        tag: "",
        displayAvatarURL: jest.fn(),
      },
    };
  });

  it("should be able to call prefix command 'owners'", async () => {
    getconfig.discordBotOwners = jest.fn().mockImplementation(() => ["1", "2"]);
    await owners.run(mockClient, mockMessage, mockArgs, prefix);
  });
  it("should be able to call prefix command 'owners' f", async () => {
    getconfig.discordBotOwners = jest.fn().mockImplementation(() => []);
    await owners.run(mockClient, mockMessage, mockArgs, prefix);
  });
});
