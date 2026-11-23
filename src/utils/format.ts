const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

export function humanUptime(startedAt: Date): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function humanSizeMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GiB`;
  return `${Math.round(mb)} MiB`;
}

export function compactSizeMB(mb: number): string {
  if (mb < 1024) return `${Math.round(mb)}M`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}G`;
}

function count(n: number, one: string, unit: string): string {
  return n <= 1 ? one : `${n} ${unit}`;
}

function relativeSpan(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds <= 44) return 'a few seconds';
  if (seconds <= 89) return 'a minute';
  const minutes = Math.round(ms / 60_000);
  if (minutes <= 44) return count(minutes, 'a minute', 'minutes');
  if (minutes <= 89) return 'an hour';
  const hours = Math.round(ms / 3_600_000);
  if (hours <= 21) return count(hours, 'an hour', 'hours');
  if (hours <= 35) return 'a day';
  const days = Math.round(ms / DAY_MS);
  if (days <= 25) return count(days, 'a day', 'days');
  if (days <= 45) return 'a month';
  const months = Math.round(ms / (DAY_MS * DAYS_PER_MONTH));
  if (months <= 10) return count(months, 'a month', 'months');
  if (months <= 17) return 'a year';
  return count(Math.round(ms / (DAY_MS * DAYS_PER_YEAR)), 'a year', 'years');
}

export function relativeTime(date: Date): string {
  const elapsed = Date.now() - date.getTime();
  const span = relativeSpan(Math.abs(elapsed));
  return elapsed < 0 ? `in ${span}` : `${span} ago`;
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 0) return '';
  return `${s.slice(0, n - 1)}…`;
}

export function truncateMiddle(s: string, maxLen: number, ellipsis = '…'): string {
  if (s.length <= maxLen) return s;
  if (maxLen <= ellipsis.length) return ellipsis.slice(0, maxLen);
  const keep = maxLen - ellipsis.length;
  const left = Math.ceil(keep / 2);
  const right = Math.floor(keep / 2);
  return s.slice(0, left) + ellipsis + s.slice(s.length - right);
}

export function stripTags(s: string): string {
  return s.replace(/\{[^}]+\}/g, '');
}

export function visualLength(s: string): number {
  return stripTags(s).length;
}

export function padEnd(s: string, visualLen: number): string {
  const pad = visualLen - visualLength(s);
  if (pad <= 0) return s;
  return s + ' '.repeat(pad);
}

export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    if (line && line.length + 1 + rest.length <= width) {
      line += ` ${rest}`;
      continue;
    }
    if (line) lines.push(line);
    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}
