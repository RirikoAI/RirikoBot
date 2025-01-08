import { Test, TestingModule } from '@nestjs/testing';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import axios from 'axios';
import { ReactBase } from './ReactBase.class';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class ConcreteReactCommand extends ReactBase {
  name = 'test';
  regex = /^test$/i;
  description = 'Test reaction command';
  category = 'reactions';
  usageExamples = ['test @user'];
  reactionType = 'test';
  content = 'tested on';
  noTargetContent = 'tested without a target';
}

describe('ReactBase', () => {
    let command: ConcreteReactCommand;
  
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConcreteReactCommand],
      }).compile();
  
      command = module.get<ConcreteReactCommand>(ConcreteReactCommand);
    });
  
    describe('runPrefix', () => {
      it('should send a reply with a target user', async () => {
        const mockMessage = {
          author: { id: '123', username: 'User123', toString: () => '<@123>' },
          mentions: {
            users: {
              first: jest.fn().mockReturnValue({ id: '456', toString: () => '<@456>' }),
            },
          },
          reply: jest.fn(),
        } as unknown as DiscordMessage;
  
        mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });
  
        await command.runPrefix(mockMessage);
  
        expect(mockMessage.reply).toHaveBeenCalledWith({
          content: '<@123> tested on <@456>',
          embeds: [
            expect.objectContaining({
              data: {
                image: { url: 'http://test.gif' },
                footer: { text: 'Requested by User123' },
              },
            }),
          ],
        });
      });
  
      it('should send a reply without a target user', async () => {
        const mockMessage = {
          author: { id: '123', username: 'User123', toString: () => '<@123>' },
          mentions: {
            users: {
              first: jest.fn().mockReturnValue(null),
            },
          },
          reply: jest.fn(),
        } as unknown as DiscordMessage;
  
        mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });
  
        await command.runPrefix(mockMessage);
  
        expect(mockMessage.reply).toHaveBeenCalledWith({
          content: '<@123> tested without a target',
          embeds: [
            expect.objectContaining({
              data: {
                image: { url: 'http://test.gif' },
                footer: { text: 'Requested by User123' },
              },
            }),
          ],
        });
      });
    });
  
    describe('runSlash', () => {
      it('should send a reply with a target user', async () => {
        const mockInteraction = {
          user: { id: '123', username: 'User123', toString: () => '<@123>' },
          options: {
            getUser: jest.fn().mockReturnValue({ id: '456', toString: () => '<@456>' }),
          },
          reply: jest.fn(),
        } as unknown as DiscordInteraction;
  
        mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });
  
        await command.runSlash(mockInteraction);
  
        expect(mockInteraction.reply).toHaveBeenCalledWith({
          content: '<@123> tested on <@456>',
          embeds: [
            expect.objectContaining({
              data: {
                image: { url: 'http://test.gif' },
                footer: { text: 'Requested by User123' },
              },
            }),
          ],
        });
      });
    });
  });
  