import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENARIO_PRESETS,
  computeNaqi,
  classifyNaqi,
  usEpaPm25AqiToUgM3,
  computeInversionRisk,
  applyPblCalibration,
  findVentilationWindow,
  buildAirQualitySnapshot
} from '../lib/aqi.js';

describe('lib/aqi.js — CPCB NAQI, Unit Conversions & PBL Physics', () => {
  it('converts Open-Meteo carbon_monoxide from ug/m3 to mg/m3 (800 ug/m3 -> sub-index 40 Good)', () => {
    const fromAlias = computeNaqi({ carbon_monoxide: 800 });
    assert.equal(fromAlias.coMgM3, 0.8);
    assert.equal(fromAlias.subIndices.co, 40);
    assert.equal(fromAlias.naqi, 40);
    assert.equal(fromAlias.category, 'Good');
    assert.equal(fromAlias.dominantPollutant, 'CO');

    const fromUgField = computeNaqi({ coUgM3: 800 });
    assert.equal(fromUgField.subIndices.co, 40);
  });

  it('computes continuous CPCB NAQI breakpoints across PM2.5, PM10, NO2, SO2, O3, CO', () => {
    assert.equal(computeNaqi({ pm25: 30 }).naqi, 50);
    assert.equal(computeNaqi({ pm25: 55 }).naqi, 92);
    assert.equal(computeNaqi({ pm25: 60 }).naqi, 100);
    assert.equal(computeNaqi({ pm25: 90 }).naqi, 200);
    assert.equal(computeNaqi({ pm25: 120 }).naqi, 300);
    assert.equal(computeNaqi({ pm25: 250 }).naqi, 400);
    assert.equal(computeNaqi({ pm25: 380 }).naqi, 500);

    const multi = computeNaqi({ pm25: 45, pm10: 250, no2: 40, so2: 40, o3: 50, coMgM3: 1.0 });
    assert.equal(multi.subIndices.pm10, 200);
    assert.equal(multi.subIndices.no2, 50);
    assert.equal(multi.subIndices.so2, 50);
    assert.equal(multi.subIndices.o3, 50);
    assert.equal(multi.subIndices.co, 50);
    assert.equal(multi.dominantPollutant, 'PM10');
    assert.equal(multi.naqi, 200);
  });

  it('classifies all 6 CPCB categories and CAQM GRAP stage badges accurately', () => {
    assert.deepEqual(
      [0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 450, 451].map((v) => {
        const c = classifyNaqi(v);
        return [c.category, c.grapStage];
      }),
      [
        ['Good', null],
        ['Good', null],
        ['Satisfactory', null],
        ['Satisfactory', null],
        ['Moderately Polluted', null],
        ['Moderately Polluted', null],
        ['Poor', 'Stage I'],
        ['Poor', 'Stage I'],
        ['Very Poor', 'Stage II'],
        ['Very Poor', 'Stage II'],
        ['Severe', 'Stage III'],
        ['Severe', 'Stage III'],
        ['Severe', 'Stage IV (Severe+)']
      ]
    );
  });

  it('inverts US EPA PM2.5 AQI (WAQI) into raw ug/m3 correctly', () => {
    assert.equal(usEpaPm25AqiToUgM3(0), 0);
    assert.equal(usEpaPm25AqiToUgM3(-10), 0);
    assert.equal(usEpaPm25AqiToUgM3(50), 12);
    assert.equal(usEpaPm25AqiToUgM3(100), 35.4);
    assert.equal(usEpaPm25AqiToUgM3(149), 55);
    assert.equal(usEpaPm25AqiToUgM3(200), 150.4);
    assert.equal(usEpaPm25AqiToUgM3(300), 250.4);
  });

  it('computes Ventilation Coefficient and inversionRisk thresholds', () => {
    const shallow = computeInversionRisk(350, 3.0);
    assert.equal(shallow.ventilationCoefficient, 1050);
    assert.equal(shallow.inversionRisk, 'High');

    const calmMid = computeInversionRisk(650, 1.2);
    assert.equal(calmMid.ventilationCoefficient, 780);
    assert.equal(calmMid.inversionRisk, 'High');

    const breezyMid = computeInversionRisk(650, 2.5);
    assert.equal(breezyMid.inversionRisk, 'Moderate');

    const wellMixed = computeInversionRisk(1300, 3.5);
    assert.equal(wellMixed.ventilationCoefficient, 4550);
    assert.equal(wellMixed.inversionRisk, 'Low');
  });

  it('applies PBL-weighted diurnal calibration without linear midday explosion', () => {
    const hourly = [
      { time: '2026-11-25T07:00', pm25: 100, pblMeters: 200, windSpeed10mMs: 0.9 },
      { time: '2026-11-25T14:00', pm25: 60, pblMeters: 1200, windSpeed10mMs: 3.0 }
    ];
    // Morning observation is 3x model (k0 = 3.0), w0 = 1.0, afternoon w = 0.2 -> factor = 1 + 2*0.2 = 1.4
    const calibrated = applyPblCalibration(hourly, 300, 0);
    assert.equal(calibrated[0].pm25, 300);
    assert.equal(calibrated[0].calibrationFactor, 3);
    assert.equal(calibrated[1].calibrationFactor, 1.4);
    assert.equal(calibrated[1].pm25, 84);

    // Clamping bounds [0.5, 4.0]
    const extremeHigh = applyPblCalibration(hourly, 900, 0);
    assert.equal(extremeHigh[0].calibrationFactor, 4);
    const extremeLow = applyPblCalibration(hourly, 10, 0);
    assert.equal(extremeLow[0].calibrationFactor, 0.5);
  });

  it('selects daytime (09:00-18:00 IST) 2h ventilation window and never recommends 3 AM', () => {
    const mock24h = Array.from({ length: 24 }, (_, h) => ({
      istHour: h,
      pm25: h === 3 ? 20 : h >= 13 && h <= 14 ? 75 : 220,
      pblMeters: h >= 12 && h <= 15 ? 1100 : 250,
      windSpeed10mMs: h >= 12 && h <= 15 ? 2.5 : 0.8
    }));
    const win = findVentilationWindow(mock24h);
    assert.equal(win.isDaytime, true);
    assert.equal(win.startHour, 13);
    assert.equal(win.endHour, 15);
    assert.equal(win.label, '13:00–15:00 IST');
    assert.equal(win.confidence, 'safe');

    const briefMock = mock24h.map((item) => ({ ...item, pm25: item.istHour >= 13 && item.istHour <= 14 ? 150 : 260 }));
    assert.equal(findVentilationWindow(briefMock).confidence, 'brief_only');

    const avoidMock = mock24h.map((item) => ({ ...item, pm25: 250 }));
    assert.equal(findVentilationWindow(avoidMock).confidence, 'avoid');
  });

  it('provides 3 curated winter smog presets and builds complete calibrated snapshots', () => {
    assert.ok(SCENARIO_PRESETS['delhi-severe']);
    assert.ok(SCENARIO_PRESETS['igp-very-poor']);
    assert.ok(SCENARIO_PRESETS['coastal-moderate']);

    const delhi = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    assert.equal(delhi.hourly24h.length, 24);
    assert.ok(delhi.current.naqi >= 300);
    assert.equal(delhi.current.inversionRisk, 'High');
    assert.ok(delhi.ventilationWindow.startHour >= 9 && delhi.ventilationWindow.endHour <= 18);
    assert.ok(delhi.whatChangedToday.summaryEn.length > 10);

    const waqiCalibrated = buildAirQualitySnapshot({
      presetId: 'coastal-moderate',
      waqiUsEpaPm25Aqi: 149,
      yesterday: { peakPm25: 40, naqi: 70 }
    });
    assert.equal(waqiCalibrated.calibration.applied, true);
    assert.equal(waqiCalibrated.calibration.observedPm25, 55);
    assert.equal(waqiCalibrated.current.pm25, 55);
    assert.ok(waqiCalibrated.whatChangedToday.summaryEn.includes('yesterday'));
  });

  it('normalizes Open-Meteo raw field aliases and anchors live hourly slices at index 0', () => {
    const liveHourly = [
      { time: '2026-11-25T16:00', pm2_5: 110, carbon_monoxide: 800, boundary_layer_height: 450, wind_speed_10m: 1.2 },
      { time: '2026-11-25T17:00', pm2_5: 130, carbon_monoxide: 900, boundary_layer_height: 300, wind_speed_10m: 0.9 }
    ];
    const snap = buildAirQualitySnapshot({ city: 'Lucknow', source: 'open-meteo', hourly24h: liveHourly });
    assert.equal(snap.location.city, 'Lucknow');
    assert.equal(snap.current.istHour, 16);
    assert.equal(snap.current.coMgM3, 0.8);
    assert.equal(snap.current.subIndices.co, 40);
    assert.equal(snap.current.inversionRisk, 'High');
  });
});
