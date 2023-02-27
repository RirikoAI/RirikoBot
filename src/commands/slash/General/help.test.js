const help = require("./help");

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

describe("slash command > help", () => {
  beforeAll(() => {
    // Setup Mock discord API Client
    mockClient = {
      prefix_commands: [
        {
          config: {
            name: "prefix",
            description: "Set the prefix for the guild.",
            usage: "prefix [new prefix]",
          },
          permissions: ["Administrator"],
          owner: false,
          run: "",
        },
      ],

      user: {
        tag: "",
        displayAvatarURL: jest.fn(),
      },
    };
  });

  it("should be able to call slash command 'help'", async () => {
    await help.run(mockClient, mockInteraction, mockArgs, prefix);
  });
});
