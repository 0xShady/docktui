import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  humanUptime,
  humanSizeMB,
  compactSizeMB,
  truncate,
  truncateMiddle,
  padEnd,
  relativeTime,
  stripTags,
  visualLength,
} from '@utils/format';

describe('humanUptime', () => {
  const NOW = new Date('2026-05-14T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders seconds for sub-minute uptimes', () => {
    expect(humanUptime(new Date(NOW - 23_000))).toBe('23s');
  });

  it('renders minutes + seconds for sub-hour uptimes', () => {
    expect(humanUptime(new Date(NOW - (5 * 60 + 12) * 1000))).toBe('5m 12s');
  });

  it('renders hours + minutes for sub-day uptimes', () => {
    expect(humanUptime(new Date(NOW - (3 * 3600 + 7 * 60) * 1000))).toBe('3h 7m');
  });

  it('renders days + hours for >24h uptimes', () => {
    expect(humanUptime(new Date(NOW - (2 * 86400 + 5 * 3600) * 1000))).toBe('2d 5h');
  });

  it('clamps negative durations to 0s', () => {
    expect(humanUptime(new Date(NOW + 5000))).toBe('0s');
  });
});

describe('compactSizeMB', () => {
  it('renders whole megabytes under 1 GiB', () => {
    expect(compactSizeMB(512)).toBe('512M');
    expect(compactSizeMB(123.6)).toBe('124M');
  });

  it('renders one decimal under 10 GiB', () => {
    expect(compactSizeMB(1024)).toBe('1.0G');
    expect(compactSizeMB(1.2 * 1024)).toBe('1.2G');
  });

  it('renders whole gigabytes from 10 GiB', () => {
    expect(compactSizeMB(16 * 1024)).toBe('16G');
    expect(compactSizeMB(31.6 * 1024)).toBe('32G');
  });
});

describe('humanSizeMB', () => {
  it('renders MiB for sub-GiB values', () => {
    expect(humanSizeMB(512)).toBe('512 MiB');
  });

  it('rounds MiB values', () => {
    expect(humanSizeMB(123.4)).toBe('123 MiB');
    expect(humanSizeMB(123.6)).toBe('124 MiB');
  });

  it('renders GiB for values >= 1024', () => {
    expect(humanSizeMB(1024)).toBe('1.0 GiB');
    expect(humanSizeMB(2048)).toBe('2.0 GiB');
    expect(humanSizeMB(3584)).toBe('3.5 GiB');
  });

  it('renders 0 cleanly', () => {
    expect(humanSizeMB(0)).toBe('0 MiB');
  });
});

describe('truncate', () => {
  it('returns the string unchanged when shorter than the limit', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('returns the string unchanged when exactly at the limit', () => {
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('truncates with ellipsis when longer than the limit', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });

  it('handles a limit of 1 (single ellipsis)', () => {
    expect(truncate('abc', 1)).toBe('…');
  });
});

describe('padEnd', () => {
  it('pads a plain string with spaces', () => {
    expect(padEnd('hi', 5)).toBe('hi   ');
  });

  it('returns the string unchanged when already at length', () => {
    expect(padEnd('hello', 5)).toBe('hello');
  });

  it('returns the string unchanged when longer than target', () => {
    expect(padEnd('toolong', 3)).toBe('toolong');
  });

  it('measures string length after stripping blessed color tags', () => {
    expect(padEnd('{red-fg}hi{/}', 5)).toBe('{red-fg}hi{/}   ');
  });
});

describe('relativeTime', () => {
  it('returns a dayjs-style relative string', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
    const oneHourAgo = new Date('2026-05-14T11:00:00Z');
    expect(relativeTime(oneHourAgo)).toMatch(/hour|ago/);
    vi.useRealTimers();
  });
});

describe('truncateMiddle', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncateMiddle('hello', 10)).toBe('hello');
    expect(truncateMiddle('exact', 5)).toBe('exact');
  });

  it('keeps head and tail and inserts an ellipsis in the middle', () => {
    expect(truncateMiddle('unix:///var/run/docker.sock', 16)).toBe('unix:///…er.sock');
  });

  it('handles very short limits gracefully', () => {
    expect(truncateMiddle('abcdef', 1)).toBe('…');
    expect(truncateMiddle('abcdef', 0)).toBe('');
  });

  it('respects a custom ellipsis', () => {
    expect(truncateMiddle('abcdefghij', 7, '...')).toBe('ab...ij');
  });
});

describe('stripTags / visualLength', () => {
  it('strips blessed colour tags', () => {
    expect(stripTags('{#5eead4-fg}hello{/}')).toBe('hello');
  });

  it('measures the visible length after stripping tags', () => {
    expect(visualLength('{#fff-fg}abc{/}')).toBe(3);
    expect(visualLength('plain')).toBe(5);
  });
});
