const nlpcloud = require("nlpcloud"),
  { OpenAIProvider } = require("./OpenAIProvider");
const { Configuration } = require("openai");

jest.mock("openai", () => {
  return {
    OpenAIApi: class {
      createCompletion = () => {
        return {
          data: {
            choices: [{ text: "Friend: example response" }],
          },
        };
      };
    },
    Configuration: jest.fn(),
  };
});

describe("OpenAIProvider", () => {
  beforeAll(() => {});

  it("should be able to create new instance", async () => {
    const openAIProvider = new OpenAIProvider();
    expect(typeof openAIProvider.getClient()).toBe("object");
  });

  it("should be able return answer when we chat", async () => {
    const openAIProvider = new OpenAIProvider();
    const response = await openAIProvider.sendChat(
      "hello",
      "This is a chat",
      ""
    );
    expect(response).toBe("example response");
  });
});
