import path from 'path';
import fs from 'fs';
import { ReactBase } from '#command/reactions/class/ReactBase.class';

const reactionsDir = path.join(__dirname);

describe('Reactions', () => {
  const reactionFiles = fs
    .readdirSync(reactionsDir)
    .filter(
      (file) => file.endsWith('.command.ts') && !file.endsWith('.spec.ts'),
    );

  reactionFiles.forEach((file) => {
    let reaction: ReactBase;
    const reactionName = path.basename(file, '.command.ts');
    const reactionPath = path.join(reactionsDir, file);
    describe(reactionName, () => {
      console.log(reactionName, reactionPath);
      beforeAll(async () => {
        const reactionModule = await import(reactionPath);
        reaction = new reactionModule[Object.keys(reactionModule)[0]]({
          db: jest.fn(),
        });
      });

      it('should be defined', () => {
        expect(reaction).toBeDefined();
      });

      it('should have relevant values', () => {
        expect(reaction.name).toBeDefined();
        expect(reaction.regex).toBeDefined();
        expect(reaction.description).toBeDefined();
        expect(reaction.category).toBeDefined();
        expect(reaction.usageExamples).toBeDefined();
        expect(reaction.reactionType).toBeDefined();
        expect(reaction.content).toBeDefined();
        expect(reaction.noTargetContent).toBeDefined();
        expect(reaction.slashOptions).toBeDefined();
      });
    });
  });
});
