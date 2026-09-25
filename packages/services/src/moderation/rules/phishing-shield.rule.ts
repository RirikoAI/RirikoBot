import type {
  AutoModRule,
  AutoModRuleConfig,
  ModerationContext,
  RuleEvaluationResult,
} from '../automod.types.js';

export class PhishingShieldRule implements AutoModRule {
  readonly ruleType = 'PHISHING_SHIELD' as const;
  readonly name = 'Phishing & Malicious Link Shield';

  /**
   * Legitimate Discord and official partner domains that must NEVER be flagged as phishing.
   */
  private static readonly LEGITIMATE_DOMAINS = new Set([
    'discord.com',
    'discord.gg',
    'discordapp.com',
    'discord.media',
    'discordstatus.com',
    'discord.co',
    'discordapp.net',
    'steamcommunity.com',
    'steampowered.com',
  ]);

  /**
   * Homoglyph character lookup table (Cyrillic, Greek, Fullwidth to ASCII).
   */
  private static readonly HOMOGLYPH_MAP: Record<string, string> = {
    // Cyrillic
    '\u0430': 'a', // Cyrillic small letter a
    '\u0410': 'a', // Cyrillic capital letter A
    '\u0441': 'c', // Cyrillic small letter es
    '\u0421': 'c', // Cyrillic capital letter Es
    '\u0435': 'e', // Cyrillic small letter ie
    '\u0415': 'e', // Cyrillic capital letter Ie
    '\u043E': 'o', // Cyrillic small letter o
    '\u041E': 'o', // Cyrillic capital letter O
    '\u0440': 'p', // Cyrillic small letter er
    '\u0420': 'p', // Cyrillic capital letter Er
    '\u0455': 's', // Cyrillic small letter dze
    '\u0405': 's', // Cyrillic capital letter Dze
    '\u0445': 'x', // Cyrillic small letter ha
    '\u0425': 'x', // Cyrillic capital letter Ha
    '\u0443': 'y', // Cyrillic small letter u
    '\u0423': 'y', // Cyrillic capital letter U
    '\u0456': 'i', // Cyrillic small letter byelorussian-ukrainian i
    '\u0406': 'i', // Cyrillic capital letter Byelorussian-Ukrainian I
    '\u0458': 'j', // Cyrillic small letter je
    '\u0408': 'j', // Cyrillic capital letter Je
    '\u0501': 'd', // Cyrillic small letter komi de
    '\u0500': 'd', // Cyrillic capital letter Komi De
    // Greek
    '\u03B1': 'a', // Greek small letter alpha
    '\u03BF': 'o', // Greek small letter omicron
    '\u03BD': 'v', // Greek small letter nu
    '\u03C1': 'p', // Greek small letter rho
  };

  /**
   * Normalizes text by removing zero-width spaces, converting homoglyphs to ASCII,
   * and decoding leetspeak character substitutions.
   */
  public normalizeText(input: string): string {
    if (!input) return '';

    // 1. Strip zero-width and invisible characters
    let cleaned = input.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '');

    // 2. Normalize Unicode (NFKD canonical decomposition)
    cleaned = cleaned.normalize('NFKD');

    // 3. Map known Cyrillic/Greek homoglyphs
    let result = '';
    for (const char of cleaned) {
      result += PhishingShieldRule.HOMOGLYPH_MAP[char] ?? char;
    }

    return result.toLowerCase();
  }

  /**
   * Decodes leetspeak and visual trick substitutes in domain-focused evaluation:
   * 0 -> o, 1/!/| -> l, 3 -> e, 4/@ -> a, 5/$ -> s, 7 -> t, 8 -> b, vv -> w, rn -> m
   */
  public decodeLeetspeak(input: string): string {
    return input
      .replace(/vv/g, 'w')
      .replace(/rn/g, 'm')
      .replace(/cl/g, 'd')
      .replace(/[0]/g, 'o')
      .replace(/[!|]/g, 'i')
      .replace(/[1]/g, 'i')
      .replace(/dlscord/g, 'discord')
      .replace(/[3]/g, 'e')
      .replace(/[4@]/g, 'a')
      .replace(/[5$]/g, 's')
      .replace(/[7]/g, 't')
      .replace(/[8]/g, 'b');
  }

  /**
   * Extracts domain names from URLs or web addresses.
   */
  public extractDomains(text: string): string[] {
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\/[^\s]*)?/gi;
    const domains: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      if (match[1]) {
        domains.push(match[1].toLowerCase());
      }
    }

    return domains;
  }

  async evaluate(
    context: ModerationContext,
    config?: AutoModRuleConfig,
  ): Promise<RuleEvaluationResult> {
    const rawContent = context.content;
    if (!rawContent || rawContent.trim().length === 0) {
      return {
        matched: false,
        ruleType: this.ruleType,
        action: 'ALLOW',
      };
    }

    // Step 1: Normalize homoglyphs and strip zero-width characters
    const normalized = this.normalizeText(rawContent);
    const decodedText = this.decodeLeetspeak(normalized);

    // Step 2: Extract domains from both normalized and leetspeak-decoded text
    const directDomains = this.extractDomains(normalized);
    const decodedDomains = this.extractDomains(decodedText);
    const domains = Array.from(new Set([...directDomains, ...decodedDomains]));

    const blacklist = new Set((config?.blacklist ?? []).map((b) => b.trim().toLowerCase()));

    // Check custom blacklist first
    for (const domain of domains) {
      if (blacklist.has(domain)) {
        return {
          matched: true,
          ruleType: this.ruleType,
          action: config?.action ?? 'DELETE',
          reason: `Blacklisted phishing domain detected: ${domain}`,
          matchedContent: domain,
          metadata: { domain, detectionType: 'BLACKLIST' },
        };
      }
    }

    // Step 3: Evaluate domains for typosquatting and deceptive patterns
    for (const domain of domains) {
      // If domain exactly matches or is a subdomain of a legitimate domain, skip
      const isLegit = Array.from(PhishingShieldRule.LEGITIMATE_DOMAINS).some(
        (legit) => domain === legit || domain.endsWith(`.${legit}`),
      );

      if (isLegit) {
        continue;
      }

      // Decode leetspeak on the domain to uncover disguised names (e.g. d1sc0rd -> discord)
      const decodedDomain = this.decodeLeetspeak(domain);

      // Check Discord phishing signatures:
      // Deceptive domains that mimic discord or nitro
      const isDiscordPhish =
        (decodedDomain.includes('discord') ||
          decodedDomain.includes('discrod') ||
          decodedDomain.includes('dlscord') ||
          decodedDomain.includes('discrd')) &&
        (decodedDomain.includes('nitro') ||
          decodedDomain.includes('gift') ||
          decodedDomain.includes('steam') ||
          decodedDomain.includes('airdrop') ||
          decodedDomain.includes('claim') ||
          decodedDomain.includes('free') ||
          decodedDomain.includes('boost') ||
          decodedDomain.includes('app') ||
          decodedDomain.includes('drop'));

      // Bare deceptive domains mimicking discord with alternate TLDs or hyphens
      const isDiscordSpoof =
        /^([a-z0-9-]+\.)*(?:discord|discrod|dlscord)[a-z0-9-]*\.[a-z]{2,}$/.test(decodedDomain) &&
        !isLegit;

      // Check Steam phishing signatures (e.g., steamcommunilty, steam-gifts, steamcommunity-nitro)
      const isSteamPhish =
        (decodedDomain.includes('steamcommunity') ||
          decodedDomain.includes('steamcommun') ||
          decodedDomain.includes('steam-comm')) &&
        !domain.endsWith('steamcommunity.com') &&
        !domain.endsWith('steampowered.com');

      if (isDiscordPhish || isDiscordSpoof || isSteamPhish) {
        return {
          matched: true,
          ruleType: this.ruleType,
          action: config?.action ?? 'DELETE',
          reason: `Suspected phishing domain detected: ${domain}`,
          matchedContent: domain,
          metadata: {
            domain,
            decodedDomain,
            detectionType: isDiscordPhish
              ? 'DISCORD_NITRO_PHISH'
              : isSteamPhish
                ? 'STEAM_PHISH'
                : 'DISCORD_SPOOF',
          },
        };
      }
    }

    // Step 4: Detect scam messages with free nitro claims + link
    if (domains.length > 0) {
      const decodedContent = this.decodeLeetspeak(normalized);
      const scamPhrases = [
        'free nitro',
        'nitro airdrop',
        'claim your nitro',
        'free discord nitro',
        'steam 50$',
        'steam 100$',
        'take your nitro',
        'giveaway nitro',
      ];

      for (const phrase of scamPhrases) {
        if (decodedContent.includes(phrase)) {
          return {
            matched: true,
            ruleType: this.ruleType,
            action: config?.action ?? 'DELETE',
            reason: `Suspected phishing scam message detected ("${phrase}" with external link)`,
            matchedContent: domains[0],
            metadata: {
              detectedPhrase: phrase,
              domains,
              detectionType: 'SCAM_PHRASE_WITH_LINK',
            },
          };
        }
      }
    }

    return {
      matched: false,
      ruleType: this.ruleType,
      action: 'ALLOW',
    };
  }
}
