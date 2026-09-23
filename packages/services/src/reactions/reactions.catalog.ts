/**
 * TASK-1301 — Unified reaction catalog (STORY-130).
 *
 * Every entry below is transcribed VERBATIM from the legacy 1.4.0 per-command files at
 * .local/RirikoBot/src/command/reactions/*.command.ts (each one a subclass of
 * class/ReactBase.class.ts). Do not paraphrase or "improve" any string here — users must
 * see the exact same phrasing they saw in 1.4.0. This module is pure data plus small pure
 * helpers: no I/O, no Discord imports. The /react command and the OtakuGIFs-backed service
 * that consume this catalog are built in TASK-1302, not here.
 */

export interface ReactionDefinition {
  /** Canonical invocation name, e.g. 'hug' for '/react type:hug' or '!hug'. */
  readonly name: string;
  /** otakugifs.xyz reaction slug used to fetch the GIF. */
  readonly reactionType: string;
  /** Slash command / help description, verbatim from legacy. */
  readonly description: string;
  /** Reply fragment used when a target user is mentioned. */
  readonly content: string;
  /** Reply fragment used when no target user is mentioned (self-directed). */
  readonly noTargetContent: string;
  /** Additional legacy prefix aliases beyond the primary name, if any. */
  readonly aliases?: readonly string[] | undefined;
}

export const REACTION_CATALOG: readonly ReactionDefinition[] = [
  {
    name: 'airkiss',
    reactionType: 'airkiss',
    description: 'Blow an air kiss to someone who deserves your affection.',
    content: 'blew an air kiss at',
    noTargetContent: 'blew an air kiss into the air, charming no one',
  },
  {
    name: 'angrystare',
    reactionType: 'angrystare',
    description: 'Fix someone with a stare so fiery it could melt steel.',
    content: 'locked an angry stare on',
    noTargetContent: 'stared angrily into the void, radiating fiery frustration',
  },
  {
    name: 'bite',
    reactionType: 'bite',
    description: 'Give someone a mischievous little nibble (or a playful chomp).',
    content: 'sank their teeth into',
    noTargetContent: 'looked around hungrily but ended up biting the air instead',
  },
  {
    name: 'bleh',
    reactionType: 'bleh',
    description: 'Make a bleh expression.',
    content: 'made a bleh expression at',
    noTargetContent: 'stuck out their tongue and made a bleh expression',
  },
  {
    name: 'blush',
    reactionType: 'blush',
    description: 'Turn as red as a tomato because someone caught you off guard.',
    content: 'turned bright red while blushing at',
    noTargetContent: 'turned bright red while blushing shyly to themselves',
  },
  {
    name: 'brofist',
    reactionType: 'brofist',
    description: 'Send an epic brofist to show some solidarity or camaraderie.',
    content: 'threw a legendary brofist at',
    noTargetContent: 'threw a brofist into the air, radiating pure camaraderie to everyone and no one',
  },
  {
    name: 'celebrate',
    reactionType: 'celebrate',
    description: 'Throw confetti, pop the champagne, and celebrate with someone special!',
    content: 'threw a party and celebrated with',
    noTargetContent: 'threw a solo celebration, confetti and all, partying in their own awesome company',
  },
  {
    name: 'cheers',
    reactionType: 'cheers',
    description: 'Raise your glass and share a toast with someone special!',
    content: 'raised a toast and clinked glasses with',
    noTargetContent: 'raised a glass in celebration, toasting to themselves with a satisfied smile',
  },
  {
    name: 'clap',
    reactionType: 'clap',
    description: 'Applaud someone with enthusiasm and appreciation!',
    content: 'gave a round of applause to',
    noTargetContent: 'clapped enthusiastically, celebrating the moment',
  },
  {
    name: 'confused',
    reactionType: 'confused',
    description: 'Tilt your head, scratch your chin, and show utter confusion toward someone.',
    content: 'gave a bewildered look to',
    noTargetContent: 'looked around with a puzzled expression',
  },
  {
    name: 'cool',
    reactionType: 'cool',
    description: 'Put on your shades and show someone just how cool you are.',
    content: 'flashed their coolest moves at',
    noTargetContent: 'casually adjusted their shades and smirked at their own reflection',
  },
  {
    name: 'cry',
    reactionType: 'cry',
    description: 'Let the tears flow because someone tugged at your heartstrings or hurt your feelings.',
    content: 'shed tears because of',
    noTargetContent: 'shed tears quietly, feeling the weight of their emotions alone',
  },
  {
    name: 'cuddle',
    reactionType: 'cuddle',
    description: 'Wrap someone in a warm and loving cuddle to show you care.',
    content: 'snuggled up close to',
    noTargetContent: 'wrapped themselves in a cozy blanket for some self-love snuggles',
  },
  {
    name: 'dance',
    reactionType: 'dance',
    description: 'Bust out some moves alone or invite someone to join the party!',
    content: 'twirled and danced with',
    noTargetContent: 'spun around joyfully, dancing like nobody was watching',
  },
  {
    name: 'drool',
    reactionType: 'drool',
    description: 'Let your jaw drop and drool over someone who is just that amazing.',
    content: 'was left drooling over',
    noTargetContent: 'stared into space, drooling over thoughts too good to handle',
  },
  {
    name: 'evillaugh',
    reactionType: 'evillaugh',
    description: 'Channel your inner villain and unleash a spine-chilling evil laugh.',
    content: 'unleashed a maniacal evil laugh at',
    noTargetContent: 'threw their head back and let out a dramatic "Mwahaha!" echoing into the void',
  },
  {
    name: 'facepalm',
    reactionType: 'facepalm',
    description: 'Plant your palm firmly on your face because someone left you speechless.',
    content: 'facepalmed dramatically at',
    noTargetContent: 'let out a sigh and facepalmed at their own thoughts, questioning everything',
  },
  {
    name: 'handhold',
    reactionType: 'handhold',
    description: 'Reach out and hold hands with someone special.',
    content: 'gently held hands with',
    noTargetContent: 'extended their hand into the air, wishing for someone to hold it',
  },
  {
    name: 'happy',
    reactionType: 'happy',
    description: 'Spread joy and share a moment of happiness with someone special!',
    content: 'shared a joyful moment with',
    noTargetContent: 'smiled brightly to themselves, radiating happiness in their own little bubble',
  },
  {
    name: 'headbang',
    reactionType: 'headbang',
    description: 'Turn up the volume and rock out with a headbang frenzy!',
    content: 'banged their head against the wall because of',
    noTargetContent: 'banged their head against the wall repeatedly, consumed by frustration',
  },
  {
    name: 'hug',
    reactionType: 'hug',
    description: 'Wrap your arms around someone to show them some love and care!',
    content: 'wrapped themselves in a warm hug with',
    noTargetContent: 'wrapped themselves in a warm, self-comforting hug',
  },
  {
    name: 'kiss',
    reactionType: 'kiss',
    description: 'Plant a sweet kiss on someone to show your affection.',
    content: 'gave a sweet kiss to',
    noTargetContent: 'made a valiant effort trying to kiss themselves',
  },
  {
    name: 'laugh',
    reactionType: 'laugh',
    description: 'Burst into laughter and share the joy with someone.',
    content: 'laughed heartily with',
    noTargetContent: 'burst into uncontrollable laughter',
  },
  {
    name: 'lick',
    reactionType: 'lick',
    description: 'Lick someone, because why not?',
    content: 'gave a lick to',
    noTargetContent: 'stuck out their tongue and licked the air, just for fun',
  },
  {
    name: 'love',
    reactionType: 'love',
    description: 'Express your love and affection for someone special.',
    content: 'shared heartfelt love with',
    noTargetContent: 'sent love into the world, embracing their own heart with warmth',
  },
  {
    name: 'mad',
    reactionType: 'mad',
    description: 'Show your frustration or anger toward someone.',
    content: 'is very mad at',
    noTargetContent: 'crossed their arms and fumed silently, steaming like a kettle',
  },
  {
    name: 'nervous',
    reactionType: 'nervous',
    description: 'Fidget awkwardly and show your nervousness around someone.',
    content: 'looked nervously at',
    noTargetContent: 'fidgeted awkwardly, glancing around with a nervous smile',
  },
  {
    name: 'no',
    reactionType: 'no',
    description: 'Firmly reject or refuse someone’s actions or words.',
    content: 'shook their head and said no to',
    noTargetContent: 'crossed their arms and said a firm "No!" to the universe',
  },
  {
    name: 'nom',
    reactionType: 'nom',
    description: 'Give someone a playful nibble or pretend to eat them.',
    content: 'nommed',
    noTargetContent: 'pretended to nom the air, imagining an invisible snack',
  },
  {
    name: 'nosebleed',
    reactionType: 'nosebleed',
    description: 'React with a dramatic nosebleed, overwhelmed by someone.',
    content: 'had a nosebleed because of',
    noTargetContent: 'felt their face heat up and had a sudden, dramatic nosebleed',
  },
  {
    name: 'nuzzle',
    reactionType: 'nuzzle',
    description: 'Snuggle up and gently nuzzle someone to show affection.',
    content: 'nuzzled up close to',
    noTargetContent: 'curled up in a cozy spot and nuzzled into a soft blanket for comfort',
  },
  {
    name: 'nyah',
    reactionType: 'nyah',
    description: 'Let out a cute "nyah~" to tease or charm someone.',
    content: 'teased with a playful "nyah~" at',
    noTargetContent: 'let out a cute "nyah~" to the world, feeling delightfully mischievous',
  },
  {
    name: 'pat',
    reactionType: 'pat',
    description: 'Give someone a gentle pat on the head to show they’re appreciated!',
    content: 'gently patted',
    noTargetContent: 'patted the air awkwardly, hoping someone would appear to receive it',
  },
  {
    name: 'peek',
    reactionType: 'peek',
    description: 'Sneak a shy or curious peek at someone.',
    content: 'peeked curiously at',
    noTargetContent: 'peeked around the corner cautiously, seeing nothing but their own shadow',
  },
  {
    name: 'pinch',
    reactionType: 'pinch',
    description: 'Give someone a playful pinch to grab their attention.',
    content: 'gave a pinch to',
    noTargetContent: 'pinched their own cheek to make sure they weren’t dreaming',
  },
  {
    name: 'poke',
    reactionType: 'poke',
    description: 'Poke someone to grab their attention or just for fun!',
    content: 'gently poked',
    noTargetContent: 'poked the air aimlessly, hoping someone might notice',
  },
  {
    name: 'pout',
    reactionType: 'pout',
    description: 'Show your displeasure or sulk adorably at someone.',
    content: 'pouted adorably at',
    noTargetContent: 'pouted into the void, sulking adorably',
  },
  {
    name: 'punch',
    reactionType: 'punch',
    description: 'Throw a punch at someone!',
    content: 'threw a punch at',
    noTargetContent: 'swung a punch into the air, fighting imaginary foes with style',
  },
  {
    name: 'roll',
    reactionType: 'roll',
    description: 'Roll around playfully or dramatically near someone.',
    content: 'rolled around near',
    noTargetContent: 'rolled around on the floor dramatically, as if life were just too much',
  },
  {
    name: 'run',
    reactionType: 'run',
    description: 'Dash away from someone with panic!',
    content: 'ran away from',
    noTargetContent: 'bolted off in a random direction, running from their own imagination',
  },
  {
    name: 'sad',
    reactionType: 'sad',
    description: 'Express your sadness to someone.',
    content: 'looked sad while thinking about',
    noTargetContent: 'sat quietly with a heavy heart, lost in their own thoughts of sadness',
  },
  {
    name: 'scared',
    reactionType: 'scared',
    description: 'Show someone just how spooked or terrified you are!',
    content: 'looked scared of',
    noTargetContent: 'shivered nervously, looking around for imaginary monsters in the shadows',
  },
  {
    name: 'shout',
    reactionType: 'shout',
    description: 'Raise your voice and shout at someone, whether in excitement or frustration!',
    content: 'shouted loudly at',
    noTargetContent: 'let out a loud shout into the void, their voice echoing like thunder',
  },
  {
    name: 'shrug',
    reactionType: 'shrug',
    description: 'Shrug at someone with a mix of indifference, confusion, or playfulness.',
    content: 'shrugged nonchalantly at',
    noTargetContent: 'shrugged to themselves, as if the universe’s mysteries didn’t concern them',
  },
  {
    name: 'shy',
    reactionType: 'shy',
    description: 'Blush and act shy around someone, avoiding eye contact.',
    content: 'acted shy around',
    noTargetContent: 'is being shy of everyone',
  },
  {
    name: 'sigh',
    reactionType: 'sigh',
    description: 'Let out a deep sigh of exasperation, relief, or melancholy.',
    content: 'let out a heavy sigh while looking at',
    noTargetContent: 'let out a deep sigh, staring into the distance with a wistful expression',
  },
  {
    name: 'sip',
    reactionType: 'sip',
    description: 'Take a calm sip of your drink, maybe while observing someone.',
    content: 'calmly sipped their drink while looking at',
    noTargetContent: 'took a slow, contemplative sip of their drink, savoring the quiet moment',
  },
  {
    name: 'slap',
    reactionType: 'slap',
    description: 'Deliver a powerful slap to someone.',
    content: 'delivered a devastating slap to',
    noTargetContent: 'slapped the air, their hand stinging from the force of it',
  },
  {
    name: 'sleep',
    reactionType: 'sleep',
    description: 'Drift off into dreamland, maybe near someone for comfort.',
    content: 'fell asleep peacefully next to',
    noTargetContent: 'curled up in a cozy spot and drifted off into a peaceful slumber',
  },
  {
    name: 'slowclap',
    reactionType: 'slowclap',
    description: 'Deliver a slow, sarcastic clap to someone.',
    content: 'gave a slow, sarcastic clap to',
    noTargetContent: 'clapped slowly and sarcastically, their eyes filled with mock amusement',
  },
  {
    name: 'smack',
    reactionType: 'smack',
    description: 'Give someone a frustrated smack.',
    content: 'smacked',
    noTargetContent: 'smacked their own forehead, muttering under their breath',
  },
  {
    name: 'smile',
    reactionType: 'smile',
    description: 'Share a warm, cheerful smile with someone.',
    content: 'smiled warmly at',
    noTargetContent: 'smiled softly to themselves, letting their happiness brighten the room',
  },
  {
    name: 'smug',
    reactionType: 'smug',
    description: 'Flash a confident, self-satisfied smug look at someone.',
    content: 'gave a smug look to',
    noTargetContent: 'smirked confidently, feeling undeniably pleased with themselves',
  },
  {
    name: 'sneeze',
    reactionType: 'sneeze',
    description: 'Let out a sudden sneeze, maybe toward someone by accident!',
    content: 'sneezed loudly at',
    noTargetContent: 'sneezed loudly into the air, startling themselves in the process',
  },
  {
    name: 'sorry',
    reactionType: 'sorry',
    description: 'Apologize sincerely or sheepishly to someone.',
    content: 'apologized sincerely to',
    noTargetContent: 'looked down apologetically, muttering a heartfelt "I’m sorry"',
  },
  {
    name: 'stare',
    reactionType: 'stare',
    description: 'Fix your gaze on someone with intensity, curiosity, or confusion.',
    content: 'stared intently at',
    noTargetContent: 'fixed their gaze on the wall, lost in their own thoughts',
  },
  {
    name: 'stopit',
    reactionType: 'stop',
    description: 'Tell someone to halt or cease whatever they’re doing.',
    content: 'firmly demanded a stop from',
    noTargetContent: 'held up a hand and shouted "Stop!" into the empty air, standing their ground',
  },
  {
    name: 'surprised',
    reactionType: 'surprised',
    description: 'Show your shock or astonishment toward someone.',
    content: 'looked completely surprised at',
    noTargetContent: 'gasped in astonishment, their face frozen in shock at the unexpected',
  },
  {
    name: 'sweat',
    reactionType: 'sweat',
    description: 'Break into a nervous sweat while looking at someone.',
    content: 'started sweating nervously at',
    noTargetContent: 'wiped their forehead nervously, beads of sweat forming under the pressure',
  },
  {
    name: 'thumbsup',
    reactionType: 'thumbsup',
    description: 'Give someone an approving thumbs-up!',
    content: 'gave a confident thumbs-up to',
    noTargetContent: 'raised a confident thumbs-up to the air, brimming with positivity',
  },
  {
    name: 'tickle',
    reactionType: 'tickle',
    description: 'Give someone a playful tickle to make them laugh!',
    content: 'playfully tickled',
    noTargetContent: 'wiggled their fingers in the air, pretending to tickle an invisible friend',
  },
  {
    name: 'tired',
    reactionType: 'tired',
    description: 'Show someone just how exhausted you are.',
    content: 'looked utterly tired while glancing at',
    noTargetContent: 'rubbed their eyes and let out a deep yawn, looking completely drained',
  },
  {
    name: 'wave',
    reactionType: 'wave',
    description: 'Greet someone with a friendly wave!',
    content: 'waved cheerfully at',
    noTargetContent: 'waved enthusiastically at no one in particular, spreading good vibes',
  },
  {
    name: 'wink',
    reactionType: 'wink',
    description: 'Flash a playful or flirty wink at someone.',
    content: 'gave a wink to',
    noTargetContent: 'winked at their reflection in the mirror, feeling cheeky',
  },
  {
    name: 'woah',
    reactionType: 'woah',
    description: 'Express amazement or surprise at someone.',
    content: 'was amazed by',
    noTargetContent: 'stared wide-eyed, muttering a stunned "Woah..."',
  },
  {
    name: 'yawn',
    reactionType: 'yawn',
    description: 'Let out a big yawn, showing how tired or bored you are.',
    content: 'yawned sleepily at',
    noTargetContent: 'stretched their arms and let out a long, exaggerated yawn, barely staying awake',
  },
  {
    name: 'yay',
    reactionType: 'yay',
    description: 'Express excitement or joy with a cheerful "Yay!"',
    content: 'cheered excitedly at',
    noTargetContent: 'threw their hands in the air and shouted "Yay!" with pure joy',
  },
  {
    name: 'yes',
    reactionType: 'yes',
    description: 'Express your agreement or excitement with a resounding yes!',
    content: 'enthusiastically said yes to',
    noTargetContent: 'pumped their fist in the air and shouted "Yes!" with boundless enthusiasm',
  },
] as const;

/** All valid reaction invocation names, in catalog order. */
export const REACTION_NAMES: readonly string[] = REACTION_CATALOG.map((r) => r.name);

const REACTION_BY_NAME: ReadonlyMap<string, ReactionDefinition> = new Map(
  REACTION_CATALOG.flatMap((r) => {
    const entries: Array<[string, ReactionDefinition]> = [[r.name, r]];
    if (r.aliases) {
      for (const alias of r.aliases) {
        entries.push([alias, r]);
      }
    }
    return entries;
  }),
);

/**
 * Looks up a reaction definition by its primary name or a legacy alias (case-insensitive).
 * Returns undefined when the name is not a known reaction.
 */
export function getReaction(name: string): ReactionDefinition | undefined {
  return REACTION_BY_NAME.get(name.toLowerCase().trim());
}

const AUTOCOMPLETE_LIMIT = 25;

/**
 * Filters the catalog for Discord autocomplete: prefix matches are ranked before
 * substring matches (both case-insensitive), and results are capped at Discord's 25-choice
 * autocomplete limit. An empty/blank query returns the first 25 catalog entries in
 * declared order, which keeps the dropdown populated before the user types anything.
 */
export function searchReactions(
  query: string,
  limit: number = AUTOCOMPLETE_LIMIT,
): readonly ReactionDefinition[] {
  const cappedLimit = Math.max(0, Math.min(limit, AUTOCOMPLETE_LIMIT));
  const normalized = query.toLowerCase().trim();

  if (!normalized) {
    return REACTION_CATALOG.slice(0, cappedLimit);
  }

  const prefixMatches: ReactionDefinition[] = [];
  const substringMatches: ReactionDefinition[] = [];

  for (const reaction of REACTION_CATALOG) {
    const lowerName = reaction.name.toLowerCase();
    if (lowerName.startsWith(normalized)) {
      prefixMatches.push(reaction);
    } else if (lowerName.includes(normalized)) {
      substringMatches.push(reaction);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, cappedLimit);
}
