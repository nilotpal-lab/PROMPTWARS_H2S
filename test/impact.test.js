import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHouseholdImpact,
  COMMUTE_FACTORS,
  COMMUNITY_ACTIONS,
  MIN_CADR_ACH_OPTIMAL,
  PROFILE_PARAMS
} from '../lib/impact.js';

describe('lib/impact.js — Indoor Box Model, Dosimetry & Emissions Savings', () => {
  it('models the Indian indoor/outdoor (I/O > 1.0) combustion trap and cleanup reduction', () => {
    const trapped = calculateHouseholdImpact({
      outdoorPm25: 80,
      profile: 'commuter',
      maskType: 'none',
      purifierMode: 'none',
      roomVolumeM3: 36,
      noExhaustTadka: true,
      indoorIncenseOrCoil: true,
      dryJhaduSweeping: true,
      sealed24hNoFlush: true
    });
    assert.ok(trapped.indoorBox.indoorOutdoorRatio > 1.0);
    assert.ok(trapped.indoorBox.cInUgM3 > 80);
    assert.equal(trapped.indoorBox.estimatedCo2Ppm, 2650);
    assert.equal(trapped.dose.avoidedUg, 0);

    const mitigated = calculateHouseholdImpact({
      outdoorPm25: 80,
      profile: 'commuter',
      maskType: 'n95',
      purifierMode: 'diy_cr_box',
      roomVolumeM3: 36,
      noExhaustTadka: false,
      indoorIncenseOrCoil: false,
      dryJhaduSweeping: false,
      sealed24hNoFlush: false
    });
    assert.ok(mitigated.indoorBox.indoorOutdoorRatio < 0.3);
    assert.equal(mitigated.indoorBox.roomSizeGate, 'optimal');
    assert.equal(mitigated.indoorBox.estimatedCo2Ppm, 950);
    assert.ok(mitigated.dose.avoidedUg > 0);
    assert.ok(mitigated.dose.percentReduced > 50);
  });

  it('enforces the CADR Room-Size Gate for oversized open living halls', () => {
    const smallRoom = calculateHouseholdImpact({ purifierMode: 'hepa_purifier', roomVolumeM3: 40 });
    assert.equal(smallRoom.indoorBox.roomSizeGate, 'optimal');

    const mediumRoom = calculateHouseholdImpact({ purifierMode: 'hepa_purifier', roomVolumeM3: 100 });
    assert.equal(mediumRoom.indoorBox.roomSizeGate, 'undersized');

    const giantHall = calculateHouseholdImpact({ purifierMode: 'hepa_purifier', roomVolumeM3: 200 });
    assert.equal(giantHall.indoorBox.roomSizeGate, 'oversized_room');
  });

  it('hard-blocks all masks for infants (< 2 yrs) regardless of requested maskType', () => {
    const infantNoMask = calculateHouseholdImpact({
      outdoorPm25: 250,
      profile: 'infant',
      maskType: 'none'
    });
    const infantRequestedN95 = calculateHouseholdImpact({
      outdoorPm25: 250,
      profile: 'infant',
      maskType: 'n95'
    });

    assert.equal(infantRequestedN95.mask.blockedForInfant, true);
    assert.equal(infantRequestedN95.mask.effective, 'none');
    assert.equal(infantRequestedN95.mask.efficiency, 0);
    assert.equal(infantRequestedN95.dose.commuteOutdoor, infantNoMask.dose.commuteOutdoor);
  });

  it('computes 3-slice inhaled dose rounded to 10 ug and keeps adult cigarette metric separate from infant lung volume', () => {
    const none = calculateHouseholdImpact({ outdoorPm25: 220, profile: 'commuter', maskType: 'none' });
    const cloth = calculateHouseholdImpact({ outdoorPm25: 220, profile: 'commuter', maskType: 'cloth' });
    const surgical = calculateHouseholdImpact({ outdoorPm25: 220, profile: 'commuter', maskType: 'surgical' });
    const n95 = calculateHouseholdImpact({ outdoorPm25: 220, profile: 'commuter', maskType: 'n95' });

    assert.equal(none.dose.commuteOutdoor % 10, 0);
    assert.equal(none.dose.cookingIndoor % 10, 0);
    assert.equal(none.dose.baselineIndoor % 10, 0);
    assert.equal(
      none.dose.totalMitigatedUg,
      none.dose.commuteOutdoor + none.dose.cookingIndoor + none.dose.baselineIndoor
    );
    assert.ok(none.dose.commuteOutdoor > cloth.dose.commuteOutdoor);
    assert.ok(cloth.dose.commuteOutdoor > surgical.dose.commuteOutdoor);
    assert.ok(surgical.dose.commuteOutdoor > n95.dose.commuteOutdoor);

    // Same 24h concentration profile must yield identical adultCigaretteEquivalent regardless of infant vs adult lung volume
    const infant = calculateHouseholdImpact({ outdoorPm25: 220, outdoorHours: 1, profile: 'infant', maskType: 'none' });
    const adult = calculateHouseholdImpact({ outdoorPm25: 220, outdoorHours: 1, profile: 'commuter', maskType: 'none' });
    assert.equal(infant.adultCigaretteEquivalent, adult.adultCigaretteEquivalent);
    assert.ok(infant.dose.totalMitigatedUg < adult.dose.totalMitigatedUg);
  });

  it('calculates Indian commute swaps clamped >= 0 and scales RWA multipliers across 100/500/1000 households', () => {
    assert.equal(Object.keys(PROFILE_PARAMS).length, 6);
    assert.equal(Object.keys(COMMUTE_FACTORS).length, 7);
    assert.equal(Object.keys(COMMUNITY_ACTIONS).length, 3);

    const beneficial = calculateHouseholdImpact({
      commuteFrom: 'diesel_cab',
      commuteTo: 'metro_bus',
      dailyKm: 20,
      commuteDaysPerWeek: 5,
      communityActions: ['compost_leaves', 'watchman_thermal_gear', 'school_no_idling_dg_stagger']
    });
    assert.ok(beneficial.commute.co2eSavedKgPerWeek > 0);
    assert.ok(beneficial.commute.pm25AvoidedGPerWeek > 0);
    assert.equal(beneficial.communityMultipliers.length, 3);
    const [m100, m500, m1000] = beneficial.communityMultipliers;
    assert.equal(m100.households, 100);
    assert.equal(m500.households, 500);
    assert.equal(m1000.households, 1000);
    assert.ok(m100.co2eSavedKgPerWeek < m500.co2eSavedKgPerWeek);
    assert.ok(m500.co2eSavedKgPerWeek < m1000.co2eSavedKgPerWeek);
    assert.ok(m100.pm25AvoidedGPerWeek < m500.pm25AvoidedGPerWeek);
    assert.ok(m500.pm25AvoidedGPerWeek < m1000.pm25AvoidedGPerWeek);

    const antiIdling = calculateHouseholdImpact({
      commuteFrom: 'petrol_car',
      commuteTo: 'anti_idling',
      dailyKm: 20
    });
    assert.ok(antiIdling.commute.co2eSavedKgPerWeek > 0);
    assert.ok(antiIdling.commute.pm25AvoidedGPerWeek > 0);

    // Regression swap (clean -> dirty) must clamp >= 0
    const dirtierSwap = calculateHouseholdImpact({
      commuteFrom: 'metro_bus',
      commuteTo: 'diesel_cab',
      dailyKm: 20
    });
    assert.equal(dirtierSwap.commute.co2eSavedKgPerWeek, 0);
    assert.equal(dirtierSwap.commute.pm25AvoidedGPerWeek, 0);
  });

  it('exports MIN_CADR_ACH_OPTIMAL and guards non-primitive profile/mask objects safely', () => {
    assert.equal(MIN_CADR_ACH_OPTIMAL, 4.0);
    const safe = calculateHouseholdImpact({
      profile: { toString: null },
      maskType: { toString: null },
      purifierMode: { toString: null }
    });
    assert.equal(safe.profile, 'commuter');
    assert.equal(safe.mask.effective, 'none');
    assert.equal(safe.indoorBox.roomSizeGate, 'inactive');
  });
});
