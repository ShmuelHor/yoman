import type { BatteryStatus } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { attributePower, type FocusSpan } from '../../src/domain/power-by-app.js';
import type { PowerReading } from '../../src/domain/reading.js';

const TEN_MINUTES_S = 600;
const FIFTEEN_MINUTES_S = 900;
const TWENTY_MINUTES_S = 1_200;
const LIGHT_W = 10;
const HEAVY_W = 30;

/** A wall-clock time on the fixture day, `HH:MM` in UTC. */
function at(clock: string): number {
  return Date.parse(`2026-11-08T${clock}:00.000Z`);
}

const RANGE = { fromMs: at('09:00'), toMs: at('10:00') };

function span(appId: string, from: string, to: string): FocusSpan {
  return { appId, startMs: at(from), endMs: at(to) };
}

function reading(
  clock: string,
  powerW: number,
  status: BatteryStatus = 'discharging',
): PowerReading {
  return { tsMs: at(clock), powerW, status };
}

describe('attributePower', () => {
  it('averages the draw of the readings taken while each app was in focus', () => {
    const spans = [span('code', '09:00', '09:10'), span('firefox', '09:10', '09:20')];
    const readings = [
      reading('09:01', LIGHT_W - 2),
      reading('09:05', LIGHT_W + 2),
      reading('09:12', HEAVY_W - 2),
      reading('09:15', HEAVY_W + 2),
    ];

    expect(attributePower(RANGE, spans, readings)).toEqual([
      { appId: 'firefox', averageW: HEAVY_W, seconds: TEN_MINUTES_S },
      { appId: 'code', averageW: LIGHT_W, seconds: TEN_MINUTES_S },
    ]);
  });

  it('charges a reading at a switch to the app that just took focus', () => {
    const spans = [span('code', '09:00', '09:10'), span('firefox', '09:10', '09:20')];

    expect(attributePower(RANGE, spans, [reading('09:10', HEAVY_W)])).toEqual([
      { appId: 'firefox', averageW: HEAVY_W, seconds: TEN_MINUTES_S },
    ]);
  });

  it('adds up an app focus time and readings over all its sessions', () => {
    const spans = [
      span('code', '09:00', '09:05'),
      span('firefox', '09:05', '09:10'),
      span('code', '09:10', '09:20'),
    ];
    const readings = [
      reading('09:01', LIGHT_W),
      reading('09:06', LIGHT_W),
      reading('09:15', HEAVY_W),
    ];

    expect(attributePower(RANGE, spans, readings)).toContainEqual({
      appId: 'code',
      averageW: (LIGHT_W + HEAVY_W) / 2,
      seconds: FIFTEEN_MINUTES_S,
    });
  });

  it('ignores readings taken on the charger', () => {
    const spans = [span('code', '09:00', '09:10')];
    const readings = [
      reading('09:01', HEAVY_W, 'charging'),
      reading('09:02', LIGHT_W),
      reading('09:03', 0, 'full'),
    ];

    expect(attributePower(RANGE, spans, readings)).toEqual([
      { appId: 'code', averageW: LIGHT_W, seconds: TEN_MINUTES_S },
    ]);
  });

  it('leaves out apps without a single discharging reading', () => {
    const spans = [span('code', '09:00', '09:10'), span('vlc', '09:10', '09:20')];
    const result = attributePower(RANGE, spans, [reading('09:01', LIGHT_W)]);

    expect(result.map((app) => app.appId)).toEqual(['code']);
  });

  it('ignores readings in a gap between sessions', () => {
    const spans = [span('code', '09:00', '09:10'), span('firefox', '09:20', '09:30')];
    const readings = [reading('09:15', HEAVY_W), reading('09:25', LIGHT_W)];

    expect(attributePower(RANGE, spans, readings)).toEqual([
      { appId: 'firefox', averageW: LIGHT_W, seconds: TEN_MINUTES_S },
    ]);
  });

  it('clips sessions and readings to the range', () => {
    const spans = [span('code', '08:30', '09:10'), span('firefox', '09:50', '10:30')];
    const readings = [
      reading('08:50', HEAVY_W),
      reading('09:05', LIGHT_W),
      reading('09:55', HEAVY_W),
      reading('10:10', LIGHT_W),
    ];

    expect(attributePower(RANGE, spans, readings)).toEqual([
      { appId: 'firefox', averageW: HEAVY_W, seconds: TEN_MINUTES_S },
      { appId: 'code', averageW: LIGHT_W, seconds: TEN_MINUTES_S },
    ]);
  });

  it('accepts sessions in any order', () => {
    const spans = [span('firefox', '09:10', '09:20'), span('code', '09:00', '09:10')];
    const readings = [reading('09:05', LIGHT_W), reading('09:15', HEAVY_W)];

    expect(attributePower(RANGE, spans, readings).map((app) => app.appId)).toEqual([
      'firefox',
      'code',
    ]);
  });

  it('orders equal draws by focus time, then by app id', () => {
    const spans = [
      span('b', '09:00', '09:05'),
      span('a', '09:05', '09:10'),
      span('c', '09:10', '09:30'),
    ];
    const readings = [
      reading('09:01', LIGHT_W),
      reading('09:06', LIGHT_W),
      reading('09:11', LIGHT_W),
    ];
    const result = attributePower(RANGE, spans, readings);

    expect(result.map((app) => [app.appId, app.seconds])).toEqual([
      ['c', TWENTY_MINUTES_S],
      ['a', TEN_MINUTES_S / 2],
      ['b', TEN_MINUTES_S / 2],
    ]);
  });

  it('is empty without a timeline', () => {
    expect(attributePower(RANGE, [], [reading('09:01', LIGHT_W)])).toEqual([]);
  });
});
