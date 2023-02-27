const myModal = require("./myModal");
const { TextInputBuilder, TextInputStyle } = require("discord.js");

jest.mock("discord.js", () => ({
  ModalBuilder: () => {
    return new (class {
      setCustomId = () => {
        return this;
      };

      setTitle = () => {
        return this;
      };

      addComponents = jest.fn();
    })();
  },
  TextInputBuilder: () => {
    return new (class {
      setCustomId = () => {
        return this;
      };

      setLabel = () => {
        return this;
      };

      setStyle = () => {
        return this;
      };
    })();
  },
  TextInputStyle: () => {
    return {
      Short: "",
    };
  },
  ActionRowBuilder: () => {
    return {
      addComponents: jest.fn(),
    };
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
  showModal: jest.fn(),
};

describe("slash command > myModal", () => {
  beforeAll(() => {
    // Setup Mock discord API Client
    mockClient = {
      prefix_commands: [
        {
          config: {},
          run: "",
        },
      ],

      user: {
        tag: "",
        displayAvatarURL: jest.fn(),
      },
    };
  });

  it("should be able to call slash command 'myModal'", async () => {
    await myModal.run(mockClient, mockInteraction, mockArgs, prefix);
  });
});
