const ping = require("./ping");

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

let mockClient;

const mockMessage = {
    reply: jest.fn(),
    guild: {
      id: "",
    },
  },
  mockArgs = ["!"],
  mockConfig = {},
  prefix = "!",
  mockQuickDB = {
    set: jest.fn(),
  };

const mockInteraction = {
  followUp: jest.fn(),
  reply: jest.fn(),
};

describe("slash command > ping", () => {
  beforeAll(() => {
    // Setup Mock discord API Client
    mockClient = {
      prefix_commands: {
        permissions: ["Administrator"],
        owner: false,
        run: "",
      },
      user: {
        tag: "",
        displayAvatarURL: jest.fn(),
      },
      ws: {
        ping: jest.fn(),
      },
    };
  });

  it("should be able to call slash command 'ping'", async () => {
    await ping.run(mockClient, mockInteraction, mockArgs, prefix);
  });
});
