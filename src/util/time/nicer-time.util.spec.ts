import { NicerTimeUtil } from './nicer-time.util';

describe('NicerTimeUtil', () => {
  describe('timeSince', () => {
    it('should return the correct time since the given date', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      expect(NicerTimeUtil.timeSince(oneMinuteAgo)).toBe('60 seconds');
      expect(NicerTimeUtil.timeSince(oneHourAgo)).toBe('60 minutes');
      expect(NicerTimeUtil.timeSince(oneDayAgo)).toBe('24 hours');
      expect(NicerTimeUtil.timeSince(oneMonthAgo)).toBe('30 days');
      expect(NicerTimeUtil.timeSince(oneYearAgo)).toBe('12 months');
    });
  });

  describe('getDateTime', () => {
    it('should return the current date and time in the correct format', () => {
      const dateTime = NicerTimeUtil.getDateTime();
      const weekday = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const now = new Date();
      const expectedDay = weekday[now.getDay()];
      const expectedDateTime = `${expectedDay} ${now.toLocaleString()} GMT+8`;

      expect(dateTime).toBe(expectedDateTime);
    });
  });
});
