/**
 * @fileoverview Deterministic bilingual (en / hi) exposure routing recommender,
 * 3-anchor conflict-resolved family schedule, 230V 4-filter Corsi-Rosenthal
 * safety gate, myth-busters, medical red-flag guardrail, and grounded chat fallback.
 */

import { DAYTIME_VENTILATION_PM25_LIMITS, buildAirQualitySnapshot } from './aqi.js';
import { MIN_CADR_ACH_OPTIMAL, PROFILE_PARAMS, calculateHouseholdImpact } from './impact.js';

/**
 * Shared safety invariants used by both the deterministic recommender
 * and post-LLM validation gates.
 */
export const SAFETY_LIMITS = Object.freeze({
  INFANT_MASK_FORBIDDEN: true,
  PROHIBITED_RECOMMENDATIONS: Object.freeze([
    'infant_mask',
    'ozone_ionizer',
    'wash_n95',
    'outdoor_exercise_severe'
  ]),
  MIN_CR_FILTERS_230V: 4,
  MAX_SAFE_DAYTIME_PM25_UGM3: DAYTIME_VENTILATION_PM25_LIMITS.SAFE_MAX,
  BRIEF_VENTILATION_MAX_PM25_UGM3: DAYTIME_VENTILATION_PM25_LIMITS.BRIEF_MAX,
  MEDICAL_RED_FLAG_NAQI: 300,
  MIN_CADR_ACH_OPTIMAL
});

const CONFIDENCE_LABELS = Object.freeze({
  safe: Object.freeze({ en: 'safe for ventilation', hi: 'हवा बदलने के लिए सुरक्षित' }),
  brief_only: Object.freeze({ en: 'brief 15–20 min CO2 flush only', hi: 'केवल 15–20 मिनट CO2 निकालने हेतु' }),
  avoid: Object.freeze({ en: 'high smog — keep flush under 5 min', hi: 'अधिक धुंध — केवल 5 मिनट हवा बदलें' })
});

const INVERSION_LABELS = Object.freeze({
  High: Object.freeze({ en: 'High', hi: 'उच्च' }),
  Moderate: Object.freeze({ en: 'Moderate', hi: 'मध्यम' }),
  Low: Object.freeze({ en: 'Low', hi: 'कम' })
});

export const RED_FLAG_GUIDANCE = Object.freeze({
  none: Object.freeze({
    en: 'No acute medical alert triggered; maintain clean indoor baseline and monitor symptoms.',
    hi: 'फिलहाल कोई आपात चेतावनी नहीं; घर के अंदर की हवा साफ रखें और लक्षणों पर नज़र रखें।'
  }),
  elevated: Object.freeze({
    en: 'Medical Alert (Elevated): Keep rescue (reliever) inhalers and cardiac medicines accessible. Stop outdoor activity immediately upon wheezing, chest tightness, or unusual fatigue.',
    hi: 'चिकित्सा सतर्कता (उच्च जोखिम): रिलीवर इन्हेलर और हृदय की दवाएं हमेशा पास रखें। घरघराहट, सीने में जकड़न या असामान्य थकान होने पर तुरंत बाहरी गतिविधि रोकें।'
  }),
  critical: Object.freeze({
    en: 'Medical Alert (Critical — Severe NAQI > 400): Stay indoors in filtered air, keep rescue (reliever) inhalers and cardiac medicines within reach, and seek urgent care if breathlessness persists.',
    hi: 'गंभीर चिकित्सा सतर्कता (NAQI > 400): फ़िल्टर किए हुए कमरे के अंदर रहें, रिलीवर इन्हेलर और हृदय की दवाएं तुरंत पास रखें, और सांस फूलने पर तुरंत चिकित्सा सहायता लें।'
  })
});

export const PROFILE_GUIDANCE_DATA = Object.freeze({
  infant: Object.freeze({
    en: {
      label: 'Infant (< 2 yrs)',
      maskRule: 'SAFETY RULE (Under 2 yrs): Never place any mask (N95, surgical, or cloth) on infants under 2 years — suffocation and airway resistance risk.',
      outdoorRule: `Keep indoors during morning/evening inversion; only brief stroller air if midday slot is safe (<=${SAFETY_LIMITS.MAX_SAFE_DAYTIME_PM25_UGM3} µg/m³).`,
      priorityAction: 'Run clean bedroom filtration (DIY CR Box or HEPA) with closed door and zero agarbatti/coil smoke.'
    },
    hi: {
      label: 'शिशु (< 2 वर्ष)',
      maskRule: 'सुरक्षा नियम (2 वर्ष से कम): 2 वर्ष से कम के शिशु को कोई भी मास्क न पहनाएं — घुटन और सांस अवरोध का खतरा।',
      outdoorRule: `सुबह/शाम की धुंध में घर के अंदर रखें; केवल सुरक्षित दोपहर अवधि (<=${SAFETY_LIMITS.MAX_SAFE_DAYTIME_PM25_UGM3} µg/m³) में ही हल्की बाहर की हवा दें।`,
      priorityAction: 'बंद बेडरूम में एयर फ़िल्टर (CR बॉक्स या HEPA) चलाएं और अगरबत्ती/कॉइल धुआं बिल्कुल न होने दें।'
    }
  }),
  school_child: Object.freeze({
    en: {
      label: 'School Child (6–14 yrs)',
      maskRule: 'Fit-checked N95/KN95 during morning school bus/auto transit when NAQI > 200.',
      outdoorRule: 'Request indoor assembly & zero outdoor PT/sports when NAQI > 200 (GRAP Stage I+).',
      priorityAction: 'Keep morning commute brief and swap afternoon play indoors on Very Poor/Severe days.'
    },
    hi: {
      label: 'स्कूली बच्चा (6–14 वर्ष)',
      maskRule: 'NAQI > 200 होने पर सुबह स्कूल बस/ऑटो यात्रा के दौरान फिट N95/KN95 मास्क पहनाएं।',
      outdoorRule: 'GRAP Stage I+ (NAQI > 200) पर स्कूल में इनडोर असेंबली व बाहरी खेल बंद करने की मांग करें।',
      priorityAction: 'सुबह की यात्रा छोटी रखें और बहुत खराब/गंभीर दिनों में शाम का खेल घर के अंदर रखें।'
    }
  }),
  elderly_cardiac: Object.freeze({
    en: {
      label: 'Elderly / Cardiac (65+)',
      maskRule: 'Use snug N95 for essential medical trips; monitor comfort and stop exertion if dizzy or breathless.',
      outdoorRule: 'Cancel 6 AM winter walks — move light walking strictly to midday safe slot or indoor corridors.',
      priorityAction: 'Keep prescribed cardiac/BP medicines timely and monitor resting breathlessness during Stage II+.'
    },
    hi: {
      label: 'बुज़ुर्ग / हृदय रोगी (65+)',
      maskRule: 'ज़रूरी डॉक्टर यात्रा में फिट N95 पहनें; चक्कर या सांस फूलने पर तुरंत आराम करें।',
      outdoorRule: 'सुबह 6 बजे की सैर टालें — हल्की टहल केवल सुरक्षित दोपहर अवधि या घर के अंदर करें।',
      priorityAction: 'हृदय/बीपी की दवाएं समय पर लें और Stage II+ में सांस फूलने पर विशेष ध्यान दें।'
    }
  }),
  asthmatic: Object.freeze({
    en: {
      label: 'Asthmatic / Respiratory',
      maskRule: 'Wear tight-seal N95 whenever stepping outside; cloth/loose surgical masks do not block fine PM2.5.',
      outdoorRule: 'Avoid all outdoor exertion above NAQI 200; stay clear of kitchen tadka plumes and roadside smoke.',
      priorityAction: 'Keep rescue (reliever) inhaler within reach and run closed-room HEPA/CR filtration overnight.'
    },
    hi: {
      label: 'दमा / श्वसन संवेदनशील',
      maskRule: 'बाहर निकलते समय हमेशा कसकर फिट N95 पहनें; कपड़े/ढीले मास्क सूक्ष्म PM2.5 नहीं रोकते।',
      outdoorRule: 'NAQI 200 से ऊपर बाहरी व्यायाम टालें; तड़का धुएं और सड़क धुएं से पूरी तरह दूर रहें।',
      priorityAction: 'रिलीवर इन्हेलर पास रखें और रात में बंद कमरे में HEPA/CR फ़िल्टर चलाएं।'
    }
  }),
  commuter: Object.freeze({
    en: {
      label: 'Daily Commuter',
      maskRule: 'Wear snug N95 (nose-clip pinched) on two-wheelers, e-rickshaws, and open buses.',
      outdoorRule: 'Prefer AC Metro/electric bus over open two-wheeler during peak morning/evening rush.',
      priorityAction: 'Set car AC to Recirculate (never Fresh Air) in traffic jams and switch off engine at >15s red lights.'
    },
    hi: {
      label: 'दैनिक यात्री',
      maskRule: 'दोपहिया, ई-रिक्शा व खुली बस में नाक की क्लिप दबाकर कसकर N95 पहनें।',
      outdoorRule: 'सुबह/शाम की भीड़ में दोपहिया के बजाय एसी मेट्रो या इलेक्ट्रिक बस चुनें।',
      priorityAction: 'ट्रैफिक जाम में कार AC को री-सर्कुलेट मोड पर रखें और >15 सेकंड लाल बत्ती पर इंजन बंद करें।'
    }
  }),
  outdoor_worker: Object.freeze({
    en: {
      label: 'Outdoor Worker',
      maskRule: 'Use valved or breathable fitted N95; air-dry overnight in a paper bag and replace when breathing resistance rises (never wash).',
      outdoorRule: 'Avoid standing downwind of waste/leaf bonfires or diesel exhaust; take shaded midday breaks.',
      priorityAction: 'Coordinate staggered heavy physical tasks away from 06:00–09:00 and 19:00–22:00 inversion peaks.'
    },
    hi: {
      label: 'बाहरी कामगार',
      maskRule: 'सांस लेने में आसान फिट N95 पहनें; रात में कागज के लिफाफे (पेपर बैग) में हवा से सुखाएं और सांस लेने में कठिनाई बढ़ने पर बदल दें (कभी धोएं नहीं)।',
      outdoorRule: 'कचरा/पत्ती जलने या डीज़ल धुएं की हवा की दिशा से दूर रहें और दोपहर में छाया में आराम लें।',
      priorityAction: 'भारी शारीरिक काम सुबह 6–9 व शाम 7–10 के चरम प्रदूषण घंटों से हटाकर करने का प्रयास करें।'
    }
  })
});

export const IAQ_HACKS_DATA = Object.freeze({
  en: Object.freeze({
    zero_cost: Object.freeze([
      {
        title: 'Run Kitchen Exhaust During Tadka / Frying',
        detail: 'High-heat tadka and frying spike indoor PM2.5 above outdoor levels; switch on chimney/exhaust before heating oil and keep kitchen door closed.'
      },
      {
        title: 'Switch Dry Jhadu to Damp Pocha',
        detail: 'Dry sweeping re-suspends settled toxic dust into breathing height; damp mopping removes dust without aerosolizing PM2.5.'
      },
      {
        title: 'Zero Indoor Agarbatti, Dhoop & Mosquito Coils',
        detail: 'One burning mosquito coil emits PM2.5 equivalent to dozens of cigarettes; use physical window mesh, electric rackets, or outdoor-vented alternatives.'
      },
      {
        title: 'Timed 20-Min Mid-Day Cross-Ventilation + Door Draft Stopper',
        detail: 'Open opposite windows for 20 min only during the midday dip to purge >2,500 ppm CO2, then seal bottom door gaps with a rolled cotton towel.'
      }
    ]),
    diy: Object.freeze([
      {
        title: `230V ${SAFETY_LIMITS.MIN_CR_FILTERS_230V}-Filter Corsi-Rosenthal Cube (₹2,500–₹4,000)`,
        detail: `230V SAFETY RULE: Always tape ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} pleated MERV-13 filters into a cube with a 230V/50Hz Indian box fan. ${SAFETY_LIMITS.MIN_CR_FILTERS_230V}× surface area cuts static back-pressure so shaded-pole fan motors never overheat or burn out (never strap 1 filter directly onto a fan).`
      },
      {
        title: 'Activated Carbon Pre-Wrap for Cooking VOCs',
        detail: `Wrap a thin activated carbon pre-filter sheet around the ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} MERV-13 sides if cooking NO2/tadka odors linger; replace pre-wrap every 60–90 days.`
      }
    ]),
    purifier: Object.freeze([
      {
        title: 'True HEPA H13 Matched to Bedroom Volume (₹8,000–₹18,000)',
        detail: `Choose CADR >= ${SAFETY_LIMITS.MIN_CADR_ACH_OPTIMAL} × room volume (m³) — e.g. >= 160–240 m³/h for a closed 40 m³ Indian bedroom. Disable any optional ionizer/plasma/UV-O3 switch.`
      }
    ])
  }),
  hi: Object.freeze({
    zero_cost: Object.freeze([
      {
        title: 'तड़का/तलते समय किचन एग्जॉस्ट या चिमनी चलाएं',
        detail: 'तेज़ आंच पर तड़के से घर के अंदर PM2.5 बाहर से भी अधिक हो जाता है; तेल गर्म करने से पहले एग्जॉस्ट चलाएं और किचन दरवाज़ा बंद रखें।'
      },
      {
        title: 'सूखे झाड़ू की जगह गीला पोंछा लगाएं',
        detail: 'सूखे झाड़ू से बैठी हुई जहरीली धूल दोबारा सांस की ऊंचाई पर उड़ती है; गीला पोंछा PM2.5 को हवा में उड़ाए बिना साफ करता है।'
      },
      {
        title: 'घर के अंदर अगरबत्ती, धूप और मच्छर कॉइल बंद करें',
        detail: 'एक जलती हुई मच्छर कॉइल दर्जनों सिगरेट जितना PM2.5 छोड़ती है; मच्छरदानी, जाली या इलेक्ट्रिक रैकेट अपनाएं।'
      },
      {
        title: 'दोपहर में 20 मिनट क्रॉस-वेंटिलेशन + दरवाज़े के नीचे तौलिया',
        detail: 'बंद कमरे की CO2 (>2,500 ppm) निकालने के लिए केवल दोपहर के सबसे साफ समय में 20 मिनट हवा चलाएं, फिर दरवाज़े के नीचे की दरार बंद करें।'
      }
    ]),
    diy: Object.freeze([
      {
        title: `230V ${SAFETY_LIMITS.MIN_CR_FILTERS_230V}-फ़िल्टर कॉर्सी-रोसेंथल बॉक्स (₹2,500–₹4,000)`,
        detail: `230V सुरक्षा नियम: भारतीय 230V/50Hz बॉक्स फैन के साथ हमेशा ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} MERV-13 फ़िल्टर का क्यूब बनाएं। ${SAFETY_LIMITS.MIN_CR_FILTERS_230V}× सतह क्षेत्र हवा का दबाव कम रखता है जिससे मोटर गर्म होकर जलती नहीं (कभी 1 फ़िल्टर सीधे पंखे पर न चिपकाएं)।`
      },
      {
        title: 'तड़का गैस/गंध के लिए एक्टिवेटेड कार्बन शीट',
        detail: `यदि रसोई की गंध व NO2 बना रहे, तो ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} फ़िल्टरों के बाहर पतली एक्टिवेटेड कार्बन प्री-शीट लपेटें; प्री-रैप को हर 60–90 दिन में बदलें।`
      }
    ]),
    purifier: Object.freeze([
      {
        title: 'कमरे के आकार के अनुसार True HEPA H13 (₹8,000–₹18,000)',
        detail: `कमरे के आयतन नियम: कम से कम ${SAFETY_LIMITS.MIN_CADR_ACH_OPTIMAL} × कमरे का आयतन (m³) वाला CADR चुनें — जैसे बंद 40 m³ भारतीय बेडरूम के लिए >= 160–240 m³/h — और सोते समय दरवाज़ा बंद रखें। आयोनाइज़र/प्लाज़्मा/UV-O3 बटन बंद रखें।`
      }
    ])
  })
});

export const MYTH_BUSTERS_DATA = Object.freeze({
  en: Object.freeze([
    {
      id: 'houseplants',
      myth: 'Indoor houseplants (Snake Plant / Areca Palm) clean PM2.5 smog',
      reality: 'False at home scale: peer-reviewed studies show you would need ~600+ potted plants per m² to match one small purifier. Keep plants for joy, not PM2.5 protection.'
    },
    {
      id: 'ozone_ionizers',
      myth: 'Air ionizers / plasma "air purifiers" are safer filter-free cleaners',
      reality: 'Harmful myth: corona-discharge ionizers emit ground-level ozone (O3) and secondary aldehydes that inflame lungs and worsen asthma.'
    },
    {
      id: 'washing_n95',
      myth: 'Washing or boiling N95 masks makes them reusable like cloth',
      reality: 'Destructive myth: water, soap, and alcohol neutralize the electrostatic melt-blown fiber charge, collapsing PM2.5 capture from ~95% down to ~25%. Air-dry in a paper bag instead.'
    },
    {
      id: 'ac_mesh_screens',
      myth: 'Split AC dust filters clean indoor PM2.5 smoke',
      reality: 'False: split AC plastic mesh screens only trap coarse lint (>10 µm). Over 95% of toxic PM2.5 passes straight through unless paired with a HEPA/CR box.'
    }
  ]),
  hi: Object.freeze([
    {
      id: 'houseplants',
      myth: 'इनडोर पौधे (स्नेक प्लांट / एरेका पाम) घर का PM2.5 साफ करते हैं',
      reality: 'गलत: वैज्ञानिक अध्ययनों के अनुसार एक छोटे प्यूरीफायर बराबर हवा साफ करने के लिए प्रति वर्ग मीटर 600+ गमले चाहिए। पौधे सजावट के लिए रखें, धुंध से बचाव के लिए नहीं।'
    },
    {
      id: 'ozone_ionizers',
      myth: 'बिना फ़िल्टर वाले आयोनाइज़र / प्लाज़्मा यंत्र हवा साफ करते हैं',
      reality: 'खतरनाक भ्रम: आयोनाइज़र ज़हरीली ओज़ोन (O3) गैस और हानिकारक यौगिक बनाते हैं जो फेफड़ों में सूजन और दमा के दौरे बढ़ा सकती है।'
    },
    {
      id: 'washing_n95',
      myth: 'N95 मास्क को धोने या उबालने से वह फिर से नया हो जाता है',
      reality: 'गलत: पानी, साबुन और अल्कोहल N95 की इलेक्ट्रोस्टैटिक चार्ज परत को नष्ट कर देते हैं, जिससे उसकी क्षमता ~95% से गिरकर ~25% रह जाती है। इसके बजाय कागज के लिफाफे (पेपर बैग) में हवा से सुखाएं।'
    },
    {
      id: 'ac_mesh_screens',
      myth: 'स्प्लिट एसी की जाली कमरा प्रदूषण-मुक्त करती है',
      reality: 'गलत: एसी की प्लास्टिक जाली केवल मोटी धूल (>10 µm) रोकती है; 95% से अधिक सूक्ष्म PM2.5 आर-पार निकल जाता है।'
    }
  ])
});

const TOPIC_RULES = Object.freeze([
  [
    'infant_mask',
    (m) =>
      /(?:infant|baby|newborn|toddler|under\s*2|शिशु|नवजात|2\s*(?:वर्ष|साल)\s*से\s*कम)/.test(m) &&
      /(?:mask|n95|kn95|मास्क)/.test(m)
  ],
  [
    'school_child',
    (m) => /(?:school|child|children|kid|बच्चे|बच्चों|बच्चा|स्कूली)/.test(m) && /(?:mask|n95|kn95|मास्क)/.test(m)
  ],
  [
    'window',
    (m) => /(?:window|ventilat|walk|jog|exercise|खिड़की|वेंटिलेशन|सैर|टहल|व्यायाम|दौड़)/.test(m)
  ],
  [
    'diy_purifier',
    (m) =>
      /(?:corsi|diy|purifier|filter|fan|plant|ionizer|ozone|230v|\bac\b|\bhepa\b|प्यूरीफायर|फ़िल्टर|फिल्टर|पौधे|आयोनाइज़र|ओज़ोन|पंखा|एसी)/.test(
        m
      )
  ],
  [
    'cooking',
    (m) => /(?:cook|tadka|incense|agarbatti|coil|jhadu|तड़का|अगरबत्ती|कॉइल|धूप|झाड़ू|पोंछा)/.test(m)
  ],
  [
    'medical',
    (m) => /(?:asthma|breath|chest|doctor|cardiac|inhaler|दमा|हृदय|सांस|सीने|डॉक्टर|इन्हेलर)/.test(m)
  ],
  [
    'commute',
    (m) => /(?:car|metro|bus|commute|rwa|school|कार|मेट्रो|स्कूल|यात्रा|वाहन|सोसाइटी)/.test(m)
  ]
]);

/**
 * Pick localized text based on language flag.
 * @param {{ en: string, hi: string }} pair
 * @param {boolean} isHi
 * @returns {string}
 */
function t(pair, isHi) {
  return isHi ? pair.hi : pair.en;
}

/**
 * Check if value is a plain non-array object.
 * @param {unknown} val
 * @returns {boolean}
 */
function isObjectRecord(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Extract valid deduplicated household profile IDs.
 * @param {Record<string, unknown>} household
 * @returns {string[]}
 */
function resolveSelectedProfiles(household) {
  const raw = Array.isArray(household.profiles) ? household.profiles : [household.profile ?? 'commuter'];
  const valid = Array.from(new Set(raw)).filter(
    (id) => typeof id === 'string' && Object.hasOwn(PROFILE_PARAMS, id)
  );
  return valid.length > 0 ? valid : ['commuter'];
}

/**
 * Resolve normalized snapshot and impact objects for recommender/chat helpers.
 * Preserves household.profile whenever valid instead of overwriting with profiles[0].
 * @param {Record<string, unknown>} input
 * @returns {{ snapshot: Record<string, unknown>, impact: Record<string, unknown>, profiles: string[], isHi: boolean }}
 */
function resolvePlanInputs(input) {
  const safe = isObjectRecord(input) ? input : {};
  const isHi = safe.lang === 'hi';
  const snapshot = isObjectRecord(safe.snapshot)
    ? safe.snapshot
    : buildAirQualitySnapshot({ presetId: safe.presetId, calibratedPm25: safe.calibratedPm25 });

  const household = isObjectRecord(safe.household) ? safe.household : safe;
  const profiles = resolveSelectedProfiles(household);
  const focusProfile =
    typeof household.profile === 'string' && Object.hasOwn(PROFILE_PARAMS, household.profile)
      ? household.profile
      : profiles[0];
  const currentPm25 = Number(snapshot.current?.pm25 ?? safe.pm25 ?? 180);
  const impact = isObjectRecord(safe.impact)
    ? safe.impact
    : calculateHouseholdImpact({ ...household, profile: focusProfile, outdoorPm25: currentPm25 });

  return { snapshot, impact, profiles, isHi };
}

/**
 * Build empowerment headline integrating "What Changed Today" and dose reduction.
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} impact
 * @param {boolean} isHi
 * @returns {string}
 */
export function buildHeadline(snapshot, impact, isHi) {
  const cur = snapshot.current;
  const grapPart = cur.grapStage ? ` (${cur.grapStage})` : '';
  const deltaText = isHi ? snapshot.whatChangedToday.summaryHi : snapshot.whatChangedToday.summaryEn;
  const reducedPct = impact.dose?.percentReduced ?? 0;

  if (isHi) {
    return `${snapshot.location.city}: NAQI ${cur.naqi} — ${cur.categoryHi}${grapPart}। ${deltaText} इन सरल बदलावों से आपका दैनिक फेफड़ों का PM2.5 भार ${reducedPct}% तक घट सकता है।`;
  }
  return `${snapshot.location.city}: NAQI ${cur.naqi} — ${cur.category}${grapPart}. ${deltaText} Timing fresh-air slots, kitchen exhaust, and commute choices cuts daily inhaled PM2.5 by ${reducedPct}%.`;
}

/**
 * Build Medical Red-Flag Guardrail whenever NAQI > 300 or asthmatic/elderly_cardiac selected.
 * @param {number} naqi
 * @param {readonly string[]} profiles
 * @param {boolean} isHi
 * @returns {Record<string, unknown>}
 */
export function buildMedicalRedFlag(naqi, profiles, isHi) {
  const hasSensitive = profiles.includes('asthmatic') || profiles.includes('elderly_cardiac');
  const highNaqi = naqi > SAFETY_LIMITS.MEDICAL_RED_FLAG_NAQI;
  const active = highNaqi || hasSensitive;

  let severity = 'none';
  if (naqi > 400 && active) {
    severity = 'critical';
  } else if (active) {
    severity = 'elevated';
  }

  return {
    active,
    severity,
    triggers: [
      ...(highNaqi ? [`naqi>${SAFETY_LIMITS.MEDICAL_RED_FLAG_NAQI}`] : []),
      ...(hasSensitive ? ['sensitive_profile'] : [])
    ],
    guidance: t(RED_FLAG_GUIDANCE[severity], isHi),
    emergencySigns: isHi
      ? ['सांस लेने में तेज़ कठिनाई या सीने में दर्द', 'SpO2 < 94% या होंठ नीले पड़ना', 'इन्हेलर से राहत न मिलना — तुरंत डॉक्टर/इमरजेंसी से संपर्क करें']
      : ['Persistent breathlessness or chest pain', 'SpO2 < 94% or bluish lips', 'Wheezing unresponsive to inhaler — seek emergency medical care']
  };
}

/**
 * Select localized midday flush guidance string by confidence band.
 * @param {Record<string, unknown>} win
 * @param {boolean} isHi
 * @returns {string}
 */
function buildMiddayActionText(win, isHi) {
  const byConfidence = {
    safe: {
      en: `Open opposite windows 20–30 min during ${win.label} (${win.avgPm25} µg/m³); safe slot for brief elderly walk.`,
      hi: `${win.label} (${win.avgPm25} µg/m³) के दौरान 20–30 मिनट खिड़कियां खोलें; बुज़ुर्गों की हल्की सैर संभव।`
    },
    brief_only: {
      en: `Brief 15–20 min cross-flush only during ${win.label} (${win.avgPm25} µg/m³) to purge indoor CO2; skip outdoor elderly exercise.`,
      hi: `CO2 निकालने के लिए केवल ${win.label} (${win.avgPm25} µg/m³) में 15–20 मिनट हवा चलाएं; बुज़ुर्ग घर के अंदर टहलें।`
    },
    avoid: {
      en: `Outdoor PM2.5 stays >${SAFETY_LIMITS.BRIEF_VENTILATION_MAX_PM25_UGM3} µg/m³ (${win.label}): limit flush to 5 min post-cooking and keep purifier on High.`,
      hi: `बाहर PM2.5 >${SAFETY_LIMITS.BRIEF_VENTILATION_MAX_PM25_UGM3} µg/m³ है (${win.label}): केवल खाना बनने के बाद 5 मिनट हवा बदलें और प्यूरीफायर तेज़ रखें।`
    }
  };
  return t(byConfidence[win.confidence] ?? byConfidence.brief_only, isHi);
}

/**
 * Build the 3-Anchor Conflict-Resolved Family Routine.
 * @param {Record<string, unknown>} snapshot
 * @param {readonly string[]} profiles
 * @param {boolean} isHi
 * @returns {Record<string, unknown>[]}
 */
export function buildThreeAnchorRoutine(snapshot, profiles, isHi) {
  const hasInfant = profiles.includes('infant');
  const win = snapshot.ventilationWindow;
  const morningConflict = hasInfant
    ? t(
        {
          en: 'Infant (<2 yrs) safety vs morning rush: keep infants indoors in filtered air with zero mask.',
          hi: 'शिशु (<2 वर्ष) सुरक्षा बनाम सुबह की भागदौड़: शिशु को बिना मास्क के फ़िल्टर कमरे में रखें।'
        },
        isHi
      )
    : t(
        {
          en: 'Morning inversion smog vs school/office rush: avoid outdoor exertion and protect transit.',
          hi: 'सुबह का धुंध स्तर बनाम स्कूल/ऑफिस यात्रा: बाहरी व्यायाम टालें और सफर में बचाव करें।'
        },
        isHi
      );
  const memberAction = hasInfant
    ? t(
        {
          en: 'Keep infants (<2 yrs) indoors in a closed filtered room — never use any mask on under-2s',
          hi: '2 वर्ष से कम के शिशु को बंद फ़िल्टर कमरे में रखें — शिशु को कभी मास्क न पहनाएं'
        },
        isHi
      )
    : t(
        {
          en: 'Wear a snug N95 for morning school/work transit when NAQI > 200',
          hi: 'NAQI > 200 होने पर सुबह स्कूल/ऑफिस यात्रा में फिट N95 पहनें'
        },
        isHi
      );

  return [
    {
      id: 'morning_shield',
      timeWindow: '06:30–09:00 IST',
      title: t({ en: 'Morning Departure Shield', hi: 'सुबह का बचाव' }, isHi),
      status: snapshot.current.inversionRisk === 'High' ? 'shield' : 'caution',
      conflictNote: morningConflict,
      actions: [
        t(
          {
            en: 'Keep windows sealed against morning inversion trap; cancel dawn jogs',
            hi: 'खिड़कियां बंद रखें और सुबह की बाहर दौड़/सैर रद्द करें'
          },
          isHi
        ),
        memberAction
      ]
    },
    {
      id: 'midday_flush',
      timeWindow: win.label,
      title: t({ en: 'Mid-Day 20-Min Flush & Window', hi: 'दोपहर वेंटिलेशन और फ्लश' }, isHi),
      status: win.confidence,
      conflictNote: t(
        {
          en: 'Resolves indoor CO2 (>2,500 ppm) vs outdoor smog conflict.',
          hi: 'बंद कमरे की CO2 और बाहरी धुंध के बीच संतुलन।'
        },
        isHi
      ),
      actions: [buildMiddayActionText(win, isHi)]
    },
    {
      id: 'evening_lockdown',
      timeWindow: '17:30–22:00 IST',
      title: t({ en: 'Pre-Inversion Evening Lock-Down', hi: 'शाम का इन्वर्ज़न लॉक-डाउन' }, isHi),
      status: 'lockdown',
      conflictNote: t(
        {
          en: 'Prevent evening inversion buildup and dinner cooking smoke trapped indoors.',
          hi: 'शाम के इन्वर्ज़न व रात के तड़का धुएं को अंदर फंसने से रोकें।'
        },
        isHi
      ),
      actions: [
        t(
          {
            en: 'Close exterior gaps before 18:00 boundary-layer collapse; run kitchen exhaust during dinner tadka',
            hi: 'सूर्यास्त से पहले खिड़कियां/दरवाज़े सील करें; रात के खाने में एग्जॉस्ट अनिवार्य चलाएं'
          },
          isHi
        ),
        t(
          {
            en: 'Zero incense/mosquito coils; switch DIY CR box or HEPA purifier to high in closed bedroom',
            hi: 'कोई अगरबत्ती/कॉइल न जलाएं और बेडरूम में CR बॉक्स/HEPA प्यूरीफायर चालू करें'
          },
          isHi
        )
      ]
    }
  ];
}

/**
 * Build WhatsApp-ready RWA / School share brief.
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} impact
 * @param {boolean} isHi
 * @returns {string}
 */
export function buildWhatsappBrief(snapshot, impact, isHi) {
  const m500 = impact.communityMultipliers?.find((m) => m.households === 500) ?? {
    co2eSavedKgPerWeek: 0,
    pm25AvoidedGPerWeek: 0
  };
  if (isHi) {
    return `*VayuMitra दैनिक कार्य संदेश (${snapshot.location.city})* — NAQI ${snapshot.current.naqi} (${snapshot.current.categoryHi})। सबसे सुरक्षित दोपहर वेंटिलेशन समय: ${snapshot.ventilationWindow.label}। यदि हमारी सोसाइटी के 500 परिवार सूखी पत्तियों की खाद, गार्ड हीटर और स्कूल नो-आइडलिंग अपनाएं, तो साप्ताहिक *${m500.co2eSavedKgPerWeek} kg CO2e* व *${m500.pm25AvoidedGPerWeek} g PM2.5* की बचत होगी।`;
  }
  return `*VayuMitra Action Brief (${snapshot.location.city})* — NAQI ${snapshot.current.naqi} (${snapshot.current.category}). Best daytime ventilation slot: ${snapshot.ventilationWindow.label}. If 500 households in our RWA adopt dry-leaf composting, watchman heaters & school no-idling, we avoid *${m500.pm25AvoidedGPerWeek} g PM2.5/wk* and *${m500.co2eSavedKgPerWeek} kg CO2e/wk* locally.`;
}

/**
 * Generate the complete deterministic bilingual Action Plan.
 * @param {Record<string, unknown>} [input]
 * @returns {Record<string, unknown>}
 */
export function generateDeterministicPlan(input = {}) {
  const { snapshot, impact, profiles, isHi } = resolvePlanInputs(input);
  const lang = isHi ? 'hi' : 'en';

  const profileGuidance = profiles.map((id) => ({
    profileId: id,
    ...PROFILE_GUIDANCE_DATA[id][lang]
  }));

  return {
    source: 'deterministic',
    lang,
    headlinePlainEnglish: buildHeadline(snapshot, impact, isHi),
    medicalRedFlag: buildMedicalRedFlag(Number(snapshot.current.naqi), profiles, isHi),
    threeAnchorRoutine: buildThreeAnchorRoutine(snapshot, profiles, isHi),
    profileGuidance,
    iaqHacks: IAQ_HACKS_DATA[lang],
    mythBusters: MYTH_BUSTERS_DATA[lang],
    commuteAndCommunity: {
      co2eSavedKgPerWeek: impact.co2eSavedKgPerWeek,
      pm25AvoidedGPerWeek: impact.pm25AvoidedGPerWeek,
      communityMultipliers: impact.communityMultipliers,
      whatsappBrief: buildWhatsappBrief(snapshot, impact, isHi)
    }
  };
}

/**
 * Detect intent topic in English or Hindi user chat message.
 * @param {string} msgLower
 * @returns {'infant_mask' | 'school_child' | 'window' | 'diy_purifier' | 'cooking' | 'medical' | 'commute' | 'general'}
 */
function detectChatTopic(msgLower) {
  for (const [topic, matchFn] of TOPIC_RULES) {
    if (matchFn(msgLower)) {
      return topic;
    }
  }
  return 'general';
}

/**
 * Format grounded topic reply text in English or Hindi.
 * @param {string} topic
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} impact
 * @param {boolean} isHi
 * @returns {string}
 */
function formatTopicReply(topic, snapshot, impact, isHi) {
  const cur = snapshot.current;
  const win = snapshot.ventilationWindow;
  const avoidedUg = impact.dose.avoidedUg;
  const cIn = impact.indoorBox.cInUgM3;
  const m500 = impact.communityMultipliers?.[1] ?? { pm25AvoidedGPerWeek: 0, co2eSavedKgPerWeek: 0 };
  const confText = t(CONFIDENCE_LABELS[win.confidence] ?? CONFIDENCE_LABELS.brief_only, isHi);
  const invRiskText = t(INVERSION_LABELS[cur.inversionRisk] ?? INVERSION_LABELS.Moderate, isHi);

  const table = {
    infant_mask: {
      en: `NEVER put any mask on an infant under 2 years — it creates suffocation and airway resistance risk. At NAQI ${cur.naqi} (${cur.pm25} µg/m³), keep infants in a closed bedroom with HEPA/CR filtration and zero indoor smoke.`,
      hi: `2 वर्ष से कम के शिशु को कभी कोई मास्क न पहनाएं — घुटन का गंभीर खतरा होता है। अभी NAQI ${cur.naqi} (${cur.pm25} µg/m³) है; शिशु को बंद कमरे में CR बॉक्स/HEPA फ़िल्टर और धुआं-रहित हवा में रखें।`
    },
    school_child: {
      en: `Children over 2 years (including school students 6–14 yrs) can safely wear a fit-checked N95/KN95 mask during morning school commute when NAQI > 200 (current NAQI ${cur.naqi}, ${cur.pm25} µg/m³), and move PE/assembly indoors. Never put masks on infants under 2 years.`,
      hi: `2 वर्ष से अधिक उम्र के स्कूली बच्चे NAQI > 200 होने पर (अभी NAQI ${cur.naqi}, ${cur.pm25} µg/m³) सुबह स्कूल सफर में सही फिट N95/KN95 मास्क पहन सकते हैं और खेल/प्रार्थना घर के अंदर रखें। 2 वर्ष से कम के शिशु को कभी कोई मास्क न पहनाएं।`
    },
    window: {
      en: `Best daytime slot for ${snapshot.location.city} is ${win.label} (avg ${win.avgPm25} µg/m³, ${confText}). Avoid early morning/night when PBL drops (${cur.pblMeters} m, inversion risk: ${invRiskText}).`,
      hi: `${snapshot.location.city} के लिए दोपहर वेंटिलेशन का सबसे बेहतर समय ${win.label} है (औसत ${win.avgPm25} µg/m³, ${confText})। सुबह/रात के कम PBL (${cur.pblMeters} m, इन्वर्ज़न जोखिम: ${invRiskText}) में खिड़कियां बंद रखें।`
    },
    diy_purifier: {
      en: `For 230V Indian fans, use ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} pleated MERV-13 filters in a Corsi-Rosenthal cube (${SAFETY_LIMITS.MIN_CR_FILTERS_230V}× area prevents shaded-pole motor overheating) and skip ozone ionizers, houseplants, or split AC mesh screens alone. Current indoor box estimate is ${cIn} µg/m³.`,
      hi: `230V भारतीय पंखे के लिए ${SAFETY_LIMITS.MIN_CR_FILTERS_230V} MERV-13 फ़िल्टर वाला कॉर्सी-रोसेंथल क्यूब बनाएं ताकि मोटर गर्म न हो। पौधे, ओज़ोन आयोनाइज़र या केवल स्प्लिट एसी की जाली पर निर्भर न रहें (एसी जाली सूक्ष्म PM2.5 नहीं रोकती)। अभी घर के अंदर का अनुमान ${cIn} µg/m³ है।`
    },
    cooking: {
      en: `High-heat tadka, agarbatti, and mosquito coils easily push indoor PM2.5 above outdoor (${cur.pm25} µg/m³). Run kitchen exhaust + damp pocha + 20-min ${win.label} flush to cut ${avoidedUg} µg/day inhaled PM2.5.`,
      hi: `तड़का, अगरबत्ती व मच्छर कॉइल से घर के अंदर PM2.5 बाहर (${cur.pm25} µg/m³) से अधिक हो सकता है। एग्जॉस्ट, गीला पोंछा और ${win.label} में 20 मिनट फ्लश से ${avoidedUg} µg/दिन की बचत होती है।`
    },
    medical: {
      en: `Current NAQI is ${cur.naqi} (${cur.category}). Keep rescue (reliever) inhalers and cardiac medicines handy, avoid exertion outside ${win.label}, and seek medical care for persistent wheezing, chest tightness, or SpO2 < 94%.`,
      hi: `वर्तमान NAQI ${cur.naqi} (${cur.categoryHi}) है। रिलीवर इन्हेलर और हृदय की दवाएं पास रखें, ${win.label} के बाहर व्यायाम टालें और सांस फूलने, सीने में जकड़न या SpO2 < 94% पर तुरंत डॉक्टर से मिलें।`
    },
    commute: {
      en: `Switching commutes + RWA actions saves ${impact.co2eSavedKgPerWeek} kg CO2e/wk and ${impact.pm25AvoidedGPerWeek} g PM2.5/wk per household (500 homes = ${m500.pm25AvoidedGPerWeek} g PM2.5/wk).`,
      hi: `यात्रा बदलाव और सोसाइटी कदमों से प्रति परिवार ${impact.co2eSavedKgPerWeek} kg CO2e/सप्ताह और ${impact.pm25AvoidedGPerWeek} g PM2.5/सप्ताह बचता है (500 परिवार = ${m500.pm25AvoidedGPerWeek} g PM2.5/सप्ताह और ${m500.co2eSavedKgPerWeek} kg CO2e/सप्ताह)।`
    },
    general: {
      en: `${snapshot.location.city} is at NAQI ${cur.naqi} (${cur.category}, PM2.5 ${cur.pm25} µg/m³, inversion risk: ${invRiskText}). Best daytime flush slot: ${win.label}. Your active routine cuts ${avoidedUg} µg/day inhaled PM2.5.`,
      hi: `${snapshot.location.city} में NAQI ${cur.naqi} (${cur.categoryHi}, PM2.5 ${cur.pm25} µg/m³, इन्वर्ज़न जोखिम: ${invRiskText}) है। दोपहर वेंटिलेशन समय: ${win.label}। आपके उपायों से सांस में जाने वाला दैनिक PM2.5 भार ${avoidedUg} µg/दिन कम होता है।`
    }
  };
  return t(table[topic] ?? table.general, isHi);
}

/**
 * Generate a grounded deterministic fallback reply for /api/chat.
 * Enforces safety limits and cites live AQI, ventilation window, and dose numbers.
 * @param {Record<string, unknown>} [input]
 * @returns {{
 *   reply: string,
 *   source: 'fallback',
 *   citedMetrics: { naqi: number, pm25: number, ventilationWindow: string, avoidedUg: number }
 * }}
 */
export function generateFallbackChatReply(input = {}) {
  const { snapshot, impact, isHi } = resolvePlanInputs(input);
  const topic = detectChatTopic(String(input?.message ?? '').toLowerCase());
  const reply = formatTopicReply(topic, snapshot, impact, isHi);

  return {
    reply,
    source: 'fallback',
    citedMetrics: {
      naqi: Number(snapshot.current.naqi),
      pm25: Number(snapshot.current.pm25),
      ventilationWindow: snapshot.ventilationWindow.label,
      avoidedUg: Number(impact.dose.avoidedUg)
    }
  };
}
