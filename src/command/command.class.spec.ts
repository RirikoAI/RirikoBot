import { Command } from './command.class';

import { SharedServices } from "#command/command.module";

describe('ConfigService', () => {
  let exampleCommand: Command;

  beforeEach(async () => {
    exampleCommand = new Command([] as any as SharedServices);
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
