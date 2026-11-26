import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeterministicPlan,
  generateFallbackChatReply,
  SAFETY_LIMITS
} from '../lib/recommender.js';
import { buildAirQualitySnapshot } from '../lib/aqi.js';

describe('lib/recommender.js — Bilingual Plan, Safety Guardrails & Chat Fallback', () => {
  it('generates complete 3-anchor English plan with 230V 4-filter CR gate, 4 myth-busters, and all 6 profiles', () => {
    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const allProfiles = ['infant', 'school_child', 'elderly_cardiac', 'asthmatic', 'commuter', 'outdoor_worker'];
    const plan = generateDeterministicPlan({
      snapshot,
      profiles: allProfiles,
      lang: 'en',
      communityActions: ['compost_leaves', 'watchman_thermal_gear']
    });

    assert.equal(plan.source, 'deterministic');
    assert.equal(plan.lang, 'en');
    assert.ok(plan.headlinePlainEnglish.includes('NAQI'));
    assert.equal(plan.threeAnchorRoutine.length, 3);
    assert.deepEqual(
      plan.threeAnchorRoutine.map((a) => a.id),
      ['morning_shield', 'midday_flush', 'evening_lockdown']
    );

    assert.equal(plan.profileGuidance.length, 6);
    const infant = plan.profileGuidance.find((p) => p.profileId === 'infant');
    assert.match(infant.maskRule, /never place any mask/i);

    assert.ok(plan.iaqHacks.zero_cost.length >= 3);
    const crHack = plan.iaqHacks.diy.find((h) => /Corsi-Rosenthal/i.test(h.title));
    assert.ok(crHack);
    assert.match(crHack.detail, /230V/i);
    assert.match(crHack.detail, /FOUR|4/);
    assert.ok(plan.iaqHacks.diy.some((h) => /carbon/i.test(h.title) || /carbon/i.test(h.detail)));

    assert.equal(plan.mythBusters.length, 4);
    assert.deepEqual(
      plan.mythBusters.map((m) => m.id),
      ['houseplants', 'ozone_ionizers', 'washing_n95', 'ac_mesh_screens']
    );

    assert.equal(plan.medicalRedFlag.active, true);
    assert.equal(plan.medicalRedFlag.severity, 'critical');
    assert.match(plan.medicalRedFlag.guidance, /Critical/i);
    assert.doesNotMatch(plan.medicalRedFlag.guidance, /SABA/);
    assert.match(plan.commuteAndCommunity.whatsappBrief, /500 households/i);

    const morningAnchor = plan.threeAnchorRoutine[0];
    assert.equal(morningAnchor.actions.includes(morningAnchor.conflictNote), false);
    assert.doesNotMatch(infant.maskRule, /HARD BLOCK/i);
    assert.doesNotMatch(crHack.detail, /CRITICAL 230V SAFETY GATE/i);
    assert.doesNotMatch(plan.threeAnchorRoutine[2].conflictNote, /I\/O > 1 trap/);
  });

  it('activates Medical Red-Flag when NAQI > 300 or sensitive profiles selected, and stays quiet otherwise', () => {
    const cleanSnapshot = buildAirQualitySnapshot({ presetId: 'coastal-moderate' });
    const quiet = generateDeterministicPlan({
      snapshot: cleanSnapshot,
      profiles: ['commuter'],
      lang: 'en'
    });
    assert.equal(quiet.medicalRedFlag.active, false);
    assert.equal(quiet.medicalRedFlag.severity, 'none');

    const sensitive = generateDeterministicPlan({
      snapshot: cleanSnapshot,
      profiles: ['asthmatic'],
      lang: 'en'
    });
    assert.equal(sensitive.medicalRedFlag.active, true);
    assert.equal(sensitive.medicalRedFlag.severity, 'elevated');
  });

  it('supports full Hindi (हिन्दी) output across headline, routine, myths, and chat fallback', () => {
    const planHi = generateDeterministicPlan({
      presetId: 'igp-very-poor',
      profiles: ['infant', 'elderly_cardiac'],
      lang: 'hi'
    });
    assert.equal(planHi.lang, 'hi');
    assert.match(planHi.headlinePlainEnglish, /[\u0900-\u097F]/);
    assert.match(planHi.threeAnchorRoutine[0].title, /[\u0900-\u097F]/);
    assert.match(planHi.profileGuidance[0].maskRule, /मास्क न पहनाएं/);
    assert.match(planHi.mythBusters[0].reality, /[\u0900-\u097F]/);
    assert.match(planHi.iaqHacks.diy[1].detail, /60–90 दिन/);
    assert.match(planHi.iaqHacks.purifier[0].detail, /40 m³/);
    assert.match(planHi.mythBusters[2].reality, /पेपर बैग/);
    assert.doesNotMatch(planHi.profileGuidance[0].outdoorRule, /दोपहर खिड़की/);
    assert.doesNotMatch(planHi.profileGuidance[1].outdoorRule, /दोपहर खिड़की/);
    assert.doesNotMatch(planHi.iaqHacks.zero_cost[3].detail, /साफ खिड़की/);

    const chatHi = generateFallbackChatReply({
      message: 'क्या मैं शिशु को मास्क पहनाऊं?',
      lang: 'hi'
    });
    assert.equal(chatHi.source, 'fallback');
    assert.match(chatHi.reply, /कभी कोई मास्क न पहनाएं/);
  });

  it('preserves household.profile over profiles[0], routes school children separately from infants, and localizes chat confidence/keywords', () => {
    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const commuterFocus = generateFallbackChatReply({
      snapshot,
      profiles: ['infant', 'commuter'],
      profile: 'commuter',
      maskType: 'n95',
      purifierMode: 'diy_cr_box',
      message: 'How much PM2.5 do I avoid?',
      lang: 'en'
    });
    const infantFocus = generateFallbackChatReply({
      snapshot,
      profiles: ['infant', 'commuter'],
      profile: 'infant',
      maskType: 'n95',
      purifierMode: 'diy_cr_box',
      message: 'How much PM2.5 do I avoid?',
      lang: 'en'
    });
    assert.ok(commuterFocus.citedMetrics.avoidedUg > infantFocus.citedMetrics.avoidedUg);

    const schoolMaskHi = generateFallbackChatReply({
      snapshot,
      message: 'क्या 10 साल के बच्चे स्कूल के लिए मास्क पहन सकते हैं?',
      lang: 'hi'
    });
    assert.match(schoolMaskHi.reply, /स्कूली बच्चे/);
    assert.match(schoolMaskHi.reply, /N95/);

    const windowHi = generateFallbackChatReply({
      snapshot,
      message: 'व्यायाम और दौड़ का समय क्या है?',
      lang: 'hi'
    });
    assert.doesNotMatch(windowHi.reply, /brief_only|safe|avoid/);
    assert.doesNotMatch(windowHi.reply, /बेहतर खिड़की/);

    const filterHi = generateFallbackChatReply({
      snapshot,
      message: 'क्या एसी का फिल्टर काफी है?',
      lang: 'hi'
    });
    assert.match(filterHi.reply, /कॉर्सी-रोसेंथल/);

    const coilHi = generateFallbackChatReply({
      snapshot,
      message: 'मच्छर कॉइल जलाने से क्या नुकसान है?',
      lang: 'hi'
    });
    assert.match(coilHi.reply, /कॉइल/);

    const cardiacHi = generateFallbackChatReply({
      snapshot,
      message: 'हृदय और दमा रोगी क्या करें?',
      lang: 'hi'
    });
    assert.match(cardiacHi.reply, /रिलीवर इन्हेलर/);

    const travelHi = generateFallbackChatReply({
      snapshot,
      message: 'यात्रा बदलाव से कितनी बचत होगी?',
      lang: 'hi'
    });
    assert.match(travelHi.reply, /500 परिवार/);

    const generalHi = generateFallbackChatReply({
      snapshot,
      message: 'आज का हाल बताएं',
      lang: 'hi'
    });
    assert.doesNotMatch(generalHi.reply, /प्रतिदिन.*µg\/दिन/);
    assert.match(generalHi.reply, /PM2\.5/);
  });

  it('grounds fallback chat replies with live metrics and enforces safety invariants', () => {
    assert.equal(SAFETY_LIMITS.INFANT_MASK_FORBIDDEN, true);
    assert.equal(SAFETY_LIMITS.MIN_CR_FILTERS_230V, 4);

    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const windowReply = generateFallbackChatReply({
      message: 'When should I open windows for fresh air?',
      snapshot,
      lang: 'en'
    });
    assert.equal(windowReply.source, 'fallback');
    assert.ok(windowReply.reply.includes(snapshot.ventilationWindow.label));
    assert.equal(windowReply.citedMetrics.naqi, snapshot.current.naqi);

    const infantReply = generateFallbackChatReply({
      message: 'Can my infant baby wear an N95 mask outside?',
      snapshot,
      lang: 'en'
    });
    assert.match(infantReply.reply, /NEVER put any mask on an infant/i);
  });
});
