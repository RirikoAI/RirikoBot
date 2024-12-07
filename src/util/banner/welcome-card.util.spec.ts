import { WelcomeCard, WelcomeCardUtilParams } from './welcome-card.util';

jest.mock('canvas', () => ({
  ...jest.requireActual('canvas'),
  createCanvas: jest.fn().mockReturnValue({
    getContext: jest.fn().mockReturnValue({
      getImageData: jest.fn().mockReturnValue({
        data: new Uint8ClampedArray(100),
      }),
      putImageData: jest.fn(),
      fillRect: jest.fn(),
      createLinearGradient: jest.fn().mockReturnValue({
        addColorStop: jest.fn(),
      }),
      fillStyle: '',
      fill: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      closePath: jest.fn(),
      clip: jest.fn(),
      drawImage: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 100 }),
      fillText: jest.fn(),
      globalAlpha: 1,
      stroke: jest.fn(),
      lineWidth: 0,
      strokeStyle: '',
    }),
    toBuffer: jest.fn().mockReturnValue(Buffer.from('')),
  }),
  loadImage: jest.fn().mockResolvedValue({
    width: 100,
    height: 100,
  }),
}));

describe('WelcomeCard', () => {
  let welcomeCard: WelcomeCard;

  beforeEach(() => {
    welcomeCard = new WelcomeCard();
  });

  it('should create a canvas and context', () => {
    expect(welcomeCard.canvas).toBeDefined();
    expect(welcomeCard.ctx).toBeDefined();
  });

  it('should generate a welcome card', async () => {
    const params: WelcomeCardUtilParams = {
      displayName: 'Test User',
      avatarURL: 'http://example.com/avatar.png',
    };

    const buffer = await welcomeCard.generate(params);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('should draw background', async () => {
    await welcomeCard.drawBackground();
    expect(welcomeCard.ctx.fillRect).toHaveBeenCalled();
  });

  it('should draw bubbles', async () => {
    await welcomeCard.drawBubbles();
    expect(welcomeCard.ctx.fill).toHaveBeenCalled();
  });

  it('should draw profile picture', async () => {
    await welcomeCard.drawProfilePicture('http://example.com/avatar.png');
    expect(welcomeCard.ctx.drawImage).toHaveBeenCalled();
  });

  it('should draw welcome text', async () => {
    await welcomeCard.drawWelcomeText('Welcome');
    expect(welcomeCard.ctx.fillText).toHaveBeenCalled();
  });

  it('should draw user name', async () => {
    await welcomeCard.drawUserName('Test User');
    expect(welcomeCard.ctx.fillText).toHaveBeenCalled();
  });

  it('should draw background image', async () => {
    await welcomeCard.drawBackgroundImage('http://example.com/background.png');
    expect(welcomeCard.ctx.drawImage).toHaveBeenCalled();
  });

  it('should draw border', async () => {
    await welcomeCard.drawBorder();
    expect(welcomeCard.ctx.stroke).toHaveBeenCalled();
  });
});
