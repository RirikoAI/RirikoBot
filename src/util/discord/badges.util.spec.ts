import { BadgesUtil } from './badges.util';
import { loadImage } from 'canvas';
import { DiscordGuildMember } from '#command/command.types';

jest.mock('canvas', () => ({
  loadImage: jest.fn(),
}));

describe('BadgesUtil', () => {
  describe('getBadges', () => {
    it('should return badges for guild member flags', async () => {
      const mockGuildMember: DiscordGuildMember = {
        user: {
          flags: {
            toArray: () =>
              ['DISCORD_EMPLOYEE', 'PARTNERED_SERVER_OWNER'] as any,
          },
        } as any,
        premiumSince: null,
      } as any;

      const mockImage = {} as any;
      (loadImage as jest.Mock).mockResolvedValue(mockImage);

      const badges = await BadgesUtil.getBadges(mockGuildMember);

      expect(badges).toHaveLength(2);
      expect(loadImage).toHaveBeenCalledWith(
        './assets/badges/DISCORDEMPLOYEE.svg',
      );
      expect(loadImage).toHaveBeenCalledWith(
        './assets/badges/PARTNEREDSERVEROWNER.svg',
      );
    });

    it('should return badges including nitro badge if premiumSince is set', async () => {
      const mockGuildMember: DiscordGuildMember = {
        user: {
          flags: {
            toArray: () => ['DISCORDEMPLOYEE'] as any,
          },
        },
        premiumSince: new Date(),
      } as any;

      const mockImage = {} as any;
      (loadImage as jest.Mock).mockResolvedValue(mockImage);

      const badges = await BadgesUtil.getBadges(mockGuildMember);

      expect(badges).toHaveLength(2);
      expect(loadImage).toHaveBeenCalledWith(
        './assets/badges/DISCORDEMPLOYEE.svg',
      );
      expect(loadImage).toHaveBeenCalledWith('./assets/badges/nitro.svg');
    });

    it('should handle errors when loading badge images', async () => {
      const mockGuildMember: DiscordGuildMember = {
        user: {
          flags: {
            toArray: () => ['INVALIDFLAG'] as any,
          } as any,
        } as any,
        premiumSince: null,
      } as any;

      (loadImage as jest.Mock).mockRejectedValue(new Error('Image not found'));

      const badges = await BadgesUtil.getBadges(mockGuildMember);

      expect(badges).toHaveLength(0);
      expect(loadImage).toHaveBeenCalledWith('./assets/badges/INVALIDFLAG.svg');
    });
  });
});
