export const RegexHelperUtil = {
  getPrefixRegExp: (guildPrefix: string): RegExp => {
    return new RegExp(
      `^(${RegexHelperUtil.escapePrefixForRegexp(guildPrefix)})`,
      'i',
    );
  },
  escapePrefixForRegexp: (serverPrefix: string): string => {
    const char = serverPrefix[0];
    if ('./+\\*!?)([]{}^$'.split('').includes(char)) return `\\${serverPrefix}`;
    return serverPrefix;
  },
};

export default RegexHelperUtil;
