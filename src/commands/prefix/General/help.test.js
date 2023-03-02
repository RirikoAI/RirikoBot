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

      setThumbnail = () => {
        return this;
      };

      setTimestamp = () => {
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

describe("prefix command > set-prefix", () => {
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

  it("should be able to call prefix command 'set-prefix'", async () => {
    await help.run(mockClient, mockMessage, mockArgs, prefix);
  });
});
