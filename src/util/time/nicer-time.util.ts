/**
 * Nicer Time Util
 * @author Earnest Angel (https://angel.net.my)
 */
export const NicerTimeUtil = {
  timeSince: timeSince,
  getDateTime: getDateTime,
};

function timeSince(date: any) {
  const seconds: any = Math.floor(((new Date() as any) - date) / 1000);

  let interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + ' years';
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + ' months';
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + ' days';
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + ' hours';
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + ' minutes';
  }
  return Math.floor(seconds) + ' seconds';
}

function getDateTime() {
  const weekday = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return `${weekday[new Date().getDay().toLocaleString()]}, ${new Date().toLocaleString(
    'en-UK',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    },
  )}`;
}

export default NicerTimeUtil;
