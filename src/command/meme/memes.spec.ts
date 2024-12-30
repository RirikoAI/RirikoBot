import path from 'path';
import fs from 'fs';
import { MemeBase } from '#command/meme/class/MemeBase.class';

const memesDir = path.join(__dirname);

describe('Memes', () => {
  const memeFiles = fs
    .readdirSync(memesDir)
    .filter(
      (file) => file.endsWith('.command.ts') && !file.endsWith('.spec.ts'),
    );

  memeFiles.forEach((file) => {
    let meme: MemeBase;
    const memeName = path.basename(file, '.command.ts');
    const memePath = path.join(memesDir, file);
    describe(memeName, () => {
      console.log(memeName, memePath);
      beforeAll(async () => {
        const memeModule = await import(memePath);
        meme = new memeModule[Object.keys(memeModule)[0]]({
          db: jest.fn(),
        });
      });

      it('should be defined', () => {
        expect(meme).toBeDefined();
      });

      it('should have relevant values', () => {
        expect(meme.name).toBeDefined();
        expect(meme.regex).toBeDefined();
        expect(meme.description).toBeDefined();
        expect(meme.category).toBeDefined();
        expect(meme.usageExamples).toBeDefined();
        expect(meme.slashOptions).toBeDefined();
        expect(meme.fileName).toBeDefined();
        expect(meme.textSettings).toBeDefined();
      });
    });
  });
});
