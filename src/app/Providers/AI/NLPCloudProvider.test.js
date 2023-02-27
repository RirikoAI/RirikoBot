const nlpcloud = require("nlpcloud"),
  { NLPCloudProvider } = require("./NLPCloudProvider");

jest.mock("nlpcloud", () => {
  return class {
    chatbot = () => {
      return {
        data: {
          response: "example response",
        },
      };
    };
  };
});

describe("NLPCloudProvider", () => {
  beforeAll(() => {});

  it("should be able to create new instance", async () => {
    const nlpCloudProvider = new NLPCloudProvider();
    expect(typeof nlpCloudProvider.getClient()).toBe("object");
  });

  it("should be able return answer when we chat", async () => {
    const nlpCloudProvider = new NLPCloudProvider();
    const response = await nlpCloudProvider.sendChat(
      "hello",
      "This is a chat",
      {}
    );
    expect(response).toBe("example response");
  });
});
