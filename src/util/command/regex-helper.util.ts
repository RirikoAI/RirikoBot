/**
 * RegexHelperUtil
 * @description A utility class to help with regex operations
 * @author Earnest Angel (https://angel.net.my)
 */
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
