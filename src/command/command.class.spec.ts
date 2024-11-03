import { Command } from './command.class';
import { CommandServices } from "#command/command.service";

describe('ConfigService', () => {
  let exampleCommand: Command;

  beforeEach(async () => {
    exampleCommand = new Command([] as any as CommandServices);
  });

  it('should be defined', () => {
    expect(exampleCommand).toBeDefined();
  });

  it('should return truthy for correct command regex', () => {
    expect(exampleCommand.test('command suffix1 suffix2')).toBeTruthy();
  });

  it('should return falsy for incorrect command regex', () => {
    expect(exampleCommand.test('wrong suffix1 suffix2')).toBeFalsy();
  });
});
