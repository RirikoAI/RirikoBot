import { RankCard, RankCardUtilParams } from './rank-card.util';
import { loadImage } from 'canvas';

jest.mock('canvas', () => ({
  ...jest.requireActual('canvas'),
  createCanvas: jest.fn().mockReturnValue({
    getContext: jest.fn().mockReturnValue({
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
      getImageData: jest.fn().mockReturnValue({
        data: new Uint8ClampedArray(100),
      }),
    }),
    toBuffer: jest.fn().mockReturnValue(Buffer.from('')),
  }),
  loadImage: jest.fn().mockResolvedValue({
    width: 100,
    height: 100,
  }),
}));

describe('RankCard', () => {
  let rankCard: RankCard;

  beforeEach(() => {
    rankCard = new RankCard();
  });

  it('should create a canvas and context', () => {
    expect(rankCard.canvas).toBeDefined();
    expect(rankCard.ctx).toBeDefined();
  });

  it('should generate a banner', async () => {
    const params: RankCardUtilParams = {
      presenceStatus: 'online',
      displayName: 'Test User',
      level: '10',
      currentExp: 500,
      requiredExp: 1000,
      avatarURL: 'http://example.com/avatar.png',
      badges: [],
    };

    const buffer = await rankCard.generateBanner(params);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('should draw background', () => {
    rankCard.drawBackground();
    expect(rankCard.ctx.fillRect).toHaveBeenCalled();
  });

  it('should draw bubbles', () => {
    rankCard.drawBubbles();
    expect(rankCard.ctx.fill).toHaveBeenCalled();
  });

  it('should draw profile picture', async () => {
    await rankCard.drawProfilePicture(
      'http://example.com/avatar.png',
      'online',
    );
    expect(rankCard.ctx.drawImage).toHaveBeenCalled();
  });

  it('should draw progress bar', async () => {
    await rankCard.drawProgressBar(500, 1000);
    expect(rankCard.ctx.fill).toHaveBeenCalled();
  });

  it('should draw display name', async () => {
    await rankCard.drawDisplayName('Test User');
    expect(rankCard.ctx.fillText).toHaveBeenCalled();
  });

  it('should draw left footer text', async () => {
    await rankCard.drawLeftFooterText('500 / 1000 Karma', 'Rank #1');
    expect(rankCard.ctx.fillText).toHaveBeenCalled();
  });

  it('should draw right footer text', async () => {
    await rankCard.drawRightFooterText('Level 10');
    expect(rankCard.ctx.fillText).toHaveBeenCalled();
  });

  it('should draw badges', async () => {
    const badges = [await loadImage('http://example.com/badge.png')];
    await rankCard.drawBadges(badges);
    expect(rankCard.ctx.drawImage).toHaveBeenCalled();
  });

  it('should draw background image', async () => {
    await rankCard.drawBackgroundImage('http://example.com/background.png');
    expect(rankCard.ctx.drawImage).toHaveBeenCalled();
  });

  it('should draw border', () => {
    rankCard.drawBorder();
    expect(rankCard.ctx.stroke).toHaveBeenCalled();
  });
});
