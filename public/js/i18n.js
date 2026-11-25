/**
 * @fileoverview Bilingual (English / Hindi) UI dictionary, dynamic label
 * formatters, and DOM localization helpers.
 */

export const I18N_STRINGS = Object.freeze({
  en: Object.freeze({
    skipToContent: 'Skip to main content',
    brandTag: 'Daily Smog & Exposure Router',
    langGroupLabel: 'Language selection',
    printSheetBtn: 'Print Fridge Sheet',
    askCopilotBtn: 'Ask VayuMitra',
    heroEyebrow: 'CPCB NAQI + PBL Atmospheric Routing',
    heroTitle: 'Route your family around winter smog peaks',
    heroSubtitle: 'Combine live hyper-local pollution, planetary boundary layer trapping, and indoor air physics into a clear daily plan.',
    locationHeading: 'Location, Winter Presets & Station Calibration',
    citySearchLabel: 'Indian city or locality',
    cityPlaceholder: 'Delhi, Patna, Mumbai, Noida',
    checkAirBtn: 'Check Air',
    presetsLabel: 'Winter smog scenarios',
    presetDelhi: 'Delhi Severe',
    presetIgp: 'IGP Very Poor',
    presetCoastal: 'Coastal Breeze',
    calibrationLabel: 'Local monitor calibration (NAQI 1–999)',
    calibrationPlaceholder: 'e.g. 385',
    applyCalBtn: 'Calibrate',
    resetCalBtn: 'Reset',
    fireAlertTitle: 'Upwind Stubble-Fire Smoke Alert',
    inversionTitle: 'Winter Thermal Inversion Status',
    telemetryHeading: 'Current Air Quality & 24-Hour Forecast',
    cpcbNaqiUnit: 'CPCB NAQI',
    ventCardHeading: 'Best Daytime Ventilation Window',
    peakSmogLabel: 'Peak smog hours',
    changedCardHeading: 'What Changed Today',
    pblHeightLabel: 'Boundary layer (PBL)',
    windSpeedLabel: 'Wind 10m',
    vcLabel: 'Ventilation Coeff.',
    chartCardHeading: '24-Hour PM2.5 Curve & Daytime Flush Slot',
    chartCardSub: 'Highlights the 09:00–18:00 IST daytime dispersion window vs nocturnal inversion peaks.',
    showTableBtn: 'Show 24-hour data table',
    hideTableBtn: 'Hide 24-hour data table',
    tableCaption: '24-hour forecast readings (IST), boundary layer height, and CPCB NAQI category',
    colHour: 'Hour (IST)',
    colPm25: 'PM2.5 (µg/m³)',
    colNaqi: 'NAQI',
    colPbl: 'PBL (m)',
    colVc: 'VC (m²/s)',
    colCategory: 'Category / GRAP',
    inversionDiagramCaption: 'Why VayuMitra never tells families to open windows at 3 AM: cold winter nights collapse the thermal lid below 400 m, trapping smoke at breathing height until midday heating lifts dispersion.',
    simulatorHeading: 'Household & Impact Simulator',
    simulatorSub: 'Instant dosimetry updates as you adjust household members, indoor habits, and commute mode.',
    simDoseLabel: 'Mitigated dose',
    simReducedLabel: 'Avoided vs baseline',
    simIndoorLabel: 'Indoor PM2.5 (I/O)',
    householdMembersLegend: 'Household members in routine',
    focusProfileLabel: 'Dose simulator focus member',
    maskLabel: 'Outdoor mask fit',
    infantMaskBlock: 'HARD BLOCK: Never place any mask on infants under 2 years (suffocation risk). Mask filtration is locked to 0% for infant dosimetry; rely on filtered indoor rooms instead.',
    purifierLabel: 'Indoor air filtration',
    roomVolumeLabel: 'Bedroom / room volume',
    outdoorHoursLabel: 'Daily outdoor / transit hours',
    indoorSourcesLegend: 'Indoor smoke & ventilation habits',
    toggleTadka: 'High-heat tadka / frying without kitchen exhaust',
    toggleIncense: 'Indoor agarbatti, dhoop, or mosquito coil',
    toggleJhadu: 'Dry jhadu sweeping (instead of damp pocha)',
    toggleSealed: 'Sealed 24h without midday CO₂ flush',
    commuteLegend: 'Daily commute swap',
    commuteFromLabel: 'Current mode',
    commuteToLabel: 'Cleaner swap',
    dailyKmLabel: 'Round-trip km/day',
    commuteDaysLabel: 'Days/week',
    rwaLegend: 'RWA & school collective actions',
    workspaceHeading: 'Your Action Plan & Verified Science',
    tablistAria: 'Action plan sections',
    tabRoutine: 'Daily Routine',
    tabIaq: 'Indoor Air Hacks',
    tabSwaps: 'Sustainable Swaps',
    tabImpact: 'Impact & Math',
    redFlagHeading: 'Medical Red-Flag Guardrail',
    anchorsHeading: '3-Anchor Conflict-Resolved Family Routine',
    downloadIcsBtn: 'Add Reminders (.ics)',
    profileGuidanceHeading: 'Member-Specific Guardrails',
    iaqTiersHeading: 'Budget-Tiered Indoor Air Interventions',
    diyDiagramCaption: '230V/50Hz safety rule: always pair 4 pleated MERV-13 filters in a sealed cube so low static resistance keeps Indian shaded-pole box fans cool.',
    mythBustersHeading: 'Smog Myth-Busters',
    weeklyCo2Label: 'Household CO₂e saved',
    weeklyPm25Label: 'Local PM2.5 avoided',
    multiplierHeading: 'RWA / Neighbourhood Scale Multiplier',
    multiplierCaption: 'Weekly collective impact if 100, 500, or 1,000 households adopt these actions',
    colHouseholds: 'Households',
    colCo2Saved: 'CO₂e Saved (kg/wk)',
    colPmAvoided: 'Local PM2.5 Avoided (g/wk)',
    whatsappHeading: 'RWA / School WhatsApp Action Brief',
    copyWhatsappBtn: 'Copy WhatsApp Brief',
    copyFallbackLabel: 'Clipboard access unavailable — select and copy below',
    doseAttributionHeading: 'Daily Inhaled PM2.5 Dose Breakdown (µg/day)',
    cigHeading: 'Adult Epidemiological Risk Equivalent',
    boxHeading: 'Steady-State Indoor Box Model',
    showMathLabel: 'Show the Math: Physics & Dosimetry Equations',
    footerNotice: 'VayuMitra provides physics-grounded air quality exposure guidance and is not a substitute for emergency medical care.',
    copilotTitle: 'Ask VayuMitra',
    closeBtn: 'Close',
    copilotInputLabel: 'Ask a question about today\'s air quality or routine',
    copilotPlaceholder: 'Ask about window timing, masks, DIY filters, or cooking smoke',
    sendBtn: 'Send',
    prof_infant: 'Infant (< 2 yrs)',
    prof_school_child: 'School Child (6–14)',
    prof_elderly_cardiac: 'Elderly / Cardiac',
    prof_asthmatic: 'Asthmatic',
    prof_commuter: 'Daily Commuter',
    prof_outdoor_worker: 'Outdoor Worker',
    act_compost_leaves: 'Compost dry leaves (stop RWA bonfires)',
    act_watchman_thermal_gear: 'Watchman thermal gear + electric heater',
    act_school_no_idling_dg_stagger: 'School-gate no-idling + noon DG test stagger',
    mask_n95: 'Snug N95 / KN95 (85% fit)',
    mask_surgical: 'Loose Surgical (45% fit)',
    mask_cloth: 'Cloth Mask (20% fit)',
    mask_none: 'No Mask (0%)',
    purifier_none: 'None (Natural settling only)',
    purifier_diy_cr_box: '230V 4-Filter DIY CR Cube (320 m³/h)',
    purifier_hepa_purifier: 'True HEPA H13 Purifier (260 m³/h)',
    commute_petrol_car: 'Petrol Car (Solo)',
    commute_diesel_cab: 'Diesel Cab / Auto',
    commute_two_wheeler: 'Two-Wheeler',
    commute_metro_bus: 'Metro / Electric Bus',
    commute_ev: 'Electric Vehicle (EV)',
    commute_wfh: 'Work From Home (WFH)',
    commute_anti_idling: 'Engine-Off Anti-Idling',
    tierZeroCost: 'Zero Cost (₹0)',
    tierDiy: 'DIY 230V Build',
    tierPurifier: 'True HEPA Purifier',
    maskRuleLabel: 'Mask rule',
    outdoorRuleLabel: 'Outdoor timing',
    priorityActionLabel: 'Priority action',
    mythClaimLabel: 'Common myth',
    mythFactLabel: 'Physics fact',
    anchorDoneLabel: 'Completed today',
    sourceGemini: 'Gemini Grounded Plan',
    sourceFallback: 'Verified Deterministic Baseline',
    copiedDone: 'Copied brief to clipboard for WhatsApp.',
    copyFailed: 'Automatic copy blocked — use the text box below.',
    loadingStatus: 'Updating local air forecast and atmospheric boundary layer...',
    staleNotice: 'Showing cached / baseline forecast while upstream station refreshes.',
    errorPrefix: 'Could not reach live station: ',
    quickChips: [
      'Best time to open windows today?',
      'Can my infant wear a mask outdoors?',
      'How to build a safe 230V DIY purifier?',
      'How much does cooking tadka raise indoor PM2.5?'
    ]
  }),
  hi: Object.freeze({
    skipToContent: 'मुख्य सामग्री पर जाएं',
    brandTag: 'दैनिक धुंध और संपर्क मार्गदर्शक',
    langGroupLabel: 'भाषा चुनें',
    printSheetBtn: 'फ्रिज शीट प्रिंट करें',
    askCopilotBtn: 'वायुमित्र से पूछें',
    heroEyebrow: 'CPCB NAQI + PBL वायुमंडलीय योजना',
    heroTitle: 'सर्दियों की धुंध से अपने परिवार को सुरक्षित रखें',
    heroSubtitle: 'स्थानीय प्रदूषण, वायुमंडलीय परत (PBL) और घर के अंदर की हवा के विज्ञान को स्पष्ट दैनिक योजना में बदलें।',
    locationHeading: 'स्थान, धुंध परिदृश्य और स्थानीय कैलिब्रेशन',
    citySearchLabel: 'भारतीय शहर या क्षेत्र',
    cityPlaceholder: 'दिल्ली, पटना, मुंबई, नोएडा',
    checkAirBtn: 'हवा जांचें',
    presetsLabel: 'सर्दियों की धुंध परिदृश्य',
    presetDelhi: 'दिल्ली गंभीर',
    presetIgp: 'गंगा मैदान बहुत खराब',
    presetCoastal: 'तटीय हवा',
    calibrationLabel: 'नज़दीकी मॉनिटर कैलिब्रेशन (NAQI 1–999)',
    calibrationPlaceholder: 'जैसे 385',
    applyCalBtn: 'लागू करें',
    resetCalBtn: 'रीसेट',
    fireAlertTitle: 'पराली धुएं की चेतावनी',
    inversionTitle: 'शीतकालीन थर्मल इन्वर्ज़न स्थिति',
    telemetryHeading: 'वर्तमान वायु गुणवत्ता और 24-घंटे का पूर्वानुमान',
    cpcbNaqiUnit: 'CPCB NAQI',
    ventCardHeading: 'दोपहर वेंटिलेशन की सबसे अच्छी खिड़की',
    peakSmogLabel: 'चरम धुंध के घंटे',
    changedCardHeading: 'आज क्या बदला',
    pblHeightLabel: 'बाउंड्री लेयर (PBL)',
    windSpeedLabel: 'हवा (10 मी)',
    vcLabel: 'वेंटिलेशन गुणांक',
    chartCardHeading: '24-घंटे PM2.5 ग्राफ और दोपहर की खिड़की',
    chartCardSub: 'रात के इन्वर्ज़न शिखर की तुलना में 09:00–18:00 IST के बीच हवा बदलने का समय दिखाता है।',
    showTableBtn: '24-घंटे की डेटा तालिका दिखाएं',
    hideTableBtn: 'डेटा तालिका छिपाएं',
    tableCaption: '24-घंटे के पूर्वानुमान (IST), PBL ऊँचाई और CPCB NAQI श्रेणी',
    colHour: 'समय (IST)',
    colPm25: 'PM2.5 (µg/m³)',
    colNaqi: 'NAQI',
    colPbl: 'PBL (मी)',
    colVc: 'VC (m²/s)',
    colCategory: 'श्रेणी / GRAP',
    inversionDiagramCaption: 'वायुमित्र रात 3 बजे खिड़की खोलने की सलाह क्यों नहीं देता: ठंडी रातों में वायुमंडलीय ढक्कन 400 मी से नीचे आकर धुएं को सांस की ऊँचाई पर रोक लेता है।',
    simulatorHeading: 'परिवार और प्रभाव सिम्युलेटर',
    simulatorSub: 'परिवार के सदस्यों, घरेलू आदतों और यात्रा के विकल्प बदलते ही फेफड़ों पर भार तुरंत देखें।',
    simDoseLabel: 'दैनिक PM2.5 भार',
    simReducedLabel: 'आधार से कमी',
    simIndoorLabel: 'इनडोर PM2.5 (I/O)',
    householdMembersLegend: 'परिवार के सदस्य चुनें',
    focusProfileLabel: 'डोज़ सिम्युलेटर मुख्य सदस्य',
    maskLabel: 'बाहर मास्क का प्रकार',
    infantMaskBlock: 'सख्त चेतावनी: 2 वर्ष से कम के शिशु को कभी कोई मास्क न पहनाएं (घुटन का खतरा)। शिशु गणना में मास्क सुरक्षा 0% रखी गई है; बंद फ़िल्टर कमरे का उपयोग करें।',
    purifierLabel: 'कमरे का एयर फ़िल्टर',
    roomVolumeLabel: 'कमरे का आयतन',
    outdoorHoursLabel: 'रोज़ बाहर बिताने के घंटे',
    indoorSourcesLegend: 'घर के अंदर धुआं और वेंटिलेशन आदतें',
    toggleTadka: 'बिना एग्जॉस्ट के तेज़ आंच पर तड़का / तलना',
    toggleIncense: 'घर के अंदर अगरबत्ती, धूप या मच्छर कॉइल',
    toggleJhadu: 'सूखा झाड़ू लगाना (गीले पोंछे के बजाय)',
    toggleSealed: 'दोपहर में बिना CO₂ फ्लश किए 24 घंटे घर बंद',
    commuteLegend: 'यात्रा माध्यम बदलाव',
    commuteFromLabel: 'वर्तमान वाहन',
    commuteToLabel: 'स्वच्छ विकल्प',
    dailyKmLabel: 'दैनिक दूरी (किमी)',
    commuteDaysLabel: 'सप्ताह में दिन',
    rwaLegend: 'सोसाइटी (RWA) व स्कूल सामूहिक कदम',
    workspaceHeading: 'दैनिक कार्य योजना और प्रमाणित विज्ञान',
    tablistAria: 'कार्य योजना अनुभाग',
    tabRoutine: 'दैनिक दिनचर्या',
    tabIaq: 'घरेलू हवा उपाय',
    tabSwaps: 'स्वच्छ बदलाव',
    tabImpact: 'प्रभाव व गणित',
    redFlagHeading: 'चिकित्सा सतर्कता (Red-Flag)',
    anchorsHeading: '3-चरणीय पारिवारिक दिनचर्या',
    downloadIcsBtn: 'रिमाइंडर डाउनलोड (.ics)',
    profileGuidanceHeading: 'सदस्य के अनुसार सुरक्षा निर्देश',
    iaqTiersHeading: 'बजट के अनुसार इनडोर उपाय',
    diyDiagramCaption: '230V/50Hz सुरक्षा नियम: भारतीय बॉक्स फैन की मोटर को गर्म होने से बचाने के लिए हमेशा 4 MERV-13 फ़िल्टर का क्यूब बनाएं।',
    mythBustersHeading: 'प्रदूषण से जुड़े भ्रम और सच',
    weeklyCo2Label: 'साप्ताहिक CO₂e बचत',
    weeklyPm25Label: 'स्थानीय PM2.5 बचाव',
    multiplierHeading: 'सोसाइटी / मोहल्ला स्तर प्रभाव',
    multiplierCaption: 'यदि 100, 500 या 1,000 परिवार ये उपाय अपनाएं तो साप्ताहिक बचत',
    colHouseholds: 'परिवार संख्या',
    colCo2Saved: 'CO₂e बचत (kg/सप्ताह)',
    colPmAvoided: 'स्थानीय PM2.5 बचाव (g/सप्ताह)',
    whatsappHeading: 'RWA / स्कूल व्हाट्सऐप संदेश',
    copyWhatsappBtn: 'व्हाट्सऐप संदेश कॉपी करें',
    copyFallbackLabel: 'क्लिपबोर्ड उपलब्ध नहीं — नीचे से टेक्स्ट चुनकर कॉपी करें',
    doseAttributionHeading: 'दैनिक सांस द्वारा PM2.5 भार विभाजन (µg/दिन)',
    cigHeading: 'वयस्क महामारी विज्ञान जोखिम समतुल्य',
    boxHeading: 'इनडोर बॉक्स मॉडल सांद्रता',
    showMathLabel: 'गणित देखें: भौतिकी और डोज़ सूत्र',
    footerNotice: 'वायुमित्र भौतिक विज्ञान आधारित मार्गदर्शन देता है; आपात स्थिति में डॉक्टर से तुरंत संपर्क करें।',
    copilotTitle: 'वायुमित्र से पूछें',
    closeBtn: 'बंद करें',
    copilotInputLabel: 'आज की वायु गुणवत्ता या दिनचर्या के बारे में प्रश्न पूछें',
    copilotPlaceholder: 'खिड़की खोलने का समय, मास्क, DIY फ़िल्टर या तड़का धुएं के बारे में पूछें',
    sendBtn: 'भेजें',
    prof_infant: 'शिशु (< 2 वर्ष)',
    prof_school_child: 'स्कूली बच्चा (6–14)',
    prof_elderly_cardiac: 'बुज़ुर्ग / हृदय रोगी',
    prof_asthmatic: 'दमा / श्वसन रोगी',
    prof_commuter: 'दैनिक यात्री',
    prof_outdoor_worker: 'बाहरी कामगार',
    act_compost_leaves: 'सूखे पत्तों की खाद बनाएं (अलाव बंद करें)',
    act_watchman_thermal_gear: 'गार्ड के लिए गर्म कपड़े व इलेक्ट्रिक हीटर',
    act_school_no_idling_dg_stagger: 'स्कूल गेट नो-आइडलिंग व डीजी परीक्षण दोपहर में',
    mask_n95: 'फिट N95 / KN95 (85% बचाव)',
    mask_surgical: 'ढीला सर्जिकल (45% बचाव)',
    mask_cloth: 'कपड़े का मास्क (20% बचाव)',
    mask_none: 'कोई मास्क नहीं (0%)',
    purifier_none: 'कोई प्यूरीफायर नहीं',
    purifier_diy_cr_box: '230V 4-फ़िल्टर DIY CR बॉक्स (320 m³/h)',
    purifier_hepa_purifier: 'True HEPA H13 प्यूरीफायर (260 m³/h)',
    commute_petrol_car: 'पेट्रोल कार (अकेले)',
    commute_diesel_cab: 'डीज़ल कैब / ऑटो',
    commute_two_wheeler: 'दोपहिया वाहन',
    commute_metro_bus: 'मेट्रो / इलेक्ट्रिक बस',
    commute_ev: 'इलेक्ट्रिक वाहन (EV)',
    commute_wfh: 'घर से काम (WFH)',
    commute_anti_idling: 'लाल बत्ती पर इंजन बंद',
    tierZeroCost: 'शून्य खर्च (₹0)',
    tierDiy: 'DIY 230V निर्माण',
    tierPurifier: 'True HEPA प्यूरीफायर',
    maskRuleLabel: 'मास्क नियम',
    outdoorRuleLabel: 'बाहर जाने का समय',
    priorityActionLabel: 'मुख्य कदम',
    mythClaimLabel: 'प्रचलित भ्रम',
    mythFactLabel: 'वैज्ञानिक सच',
    anchorDoneLabel: 'आज पूर्ण हुआ',
    sourceGemini: 'Gemini आधारित योजना',
    sourceFallback: 'प्रमाणित मानक योजना',
    copiedDone: 'व्हाट्सऐप संदेश कॉपी हो गया।',
    copyFailed: 'स्वचालित कॉपी उपलब्ध नहीं — नीचे दिए बॉक्स से कॉपी करें।',
    loadingStatus: 'ताज़ा वायु गुणवत्ता और बाउंड्री लेयर डेटा लोड हो रहा है...',
    staleNotice: 'स्थानीय डेटा अपडेट होने तक सुरक्षित आधारभूत पूर्वानुमान दिखाया जा रहा है।',
    errorPrefix: 'लाइव स्टेशन से संपर्क नहीं हो सका: ',
    quickChips: [
      'आज खिड़कियां खोलने का सबसे अच्छा समय क्या है?',
      'क्या शिशु को बाहर मास्क पहना सकते हैं?',
      '230V सुरक्षित DIY प्यूरीफायर कैसे बनाएं?',
      'तड़का और अगरबत्ती से घर में PM2.5 कितना बढ़ता है?'
    ]
  })
});

const OPTION_KEYS = Object.freeze({
  'profile-select': [
    ['commuter', 'prof_commuter'],
    ['infant', 'prof_infant'],
    ['school_child', 'prof_school_child'],
    ['elderly_cardiac', 'prof_elderly_cardiac'],
    ['asthmatic', 'prof_asthmatic'],
    ['outdoor_worker', 'prof_outdoor_worker']
  ],
  'mask-select': [
    ['n95', 'mask_n95'],
    ['surgical', 'mask_surgical'],
    ['cloth', 'mask_cloth'],
    ['none', 'mask_none']
  ],
  'purifier-select': [
    ['none', 'purifier_none'],
    ['diy_cr_box', 'purifier_diy_cr_box'],
    ['hepa_purifier', 'purifier_hepa_purifier']
  ],
  'commute-from-select': [
    ['petrol_car', 'commute_petrol_car'],
    ['diesel_cab', 'commute_diesel_cab'],
    ['two_wheeler', 'commute_two_wheeler'],
    ['metro_bus', 'commute_metro_bus'],
    ['ev', 'commute_ev']
  ],
  'commute-to-select': [
    ['metro_bus', 'commute_metro_bus'],
    ['ev', 'commute_ev'],
    ['wfh', 'commute_wfh'],
    ['anti_idling', 'commute_anti_idling'],
    ['petrol_car', 'commute_petrol_car']
  ]
});

/**
 * Return localized dictionary for 'en' or 'hi'.
 * @param {string} lang
 * @returns {Record<string, unknown>}
 */
export function getStrings(lang) {
  return lang === 'hi' ? I18N_STRINGS.hi : I18N_STRINGS.en;
}

/**
 * Format numeric values safely with Indian grouping and tabular stability.
 * @param {number} value
 * @param {string} _lang
 * @param {number} [maxDecimals]
 * @returns {string}
 */
export function formatNumber(value, _lang, maxDecimals = 0) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: maxDecimals
  }).format(value);
}

/**
 * Update all select option text labels when language switches.
 * @param {ParentNode} root
 * @param {Record<string, unknown>} dict
 */
function localizeSelectOptions(root, dict) {
  for (const [selectId, pairs] of Object.entries(OPTION_KEYS)) {
    const select = root.getElementById ? root.getElementById(selectId) : root.querySelector(`#${selectId}`);
    if (!select) {
      continue;
    }
    for (const [optVal, dictKey] of pairs) {
      const option = select.querySelector(`option[value="${optVal}"]`);
      if (option && typeof dict[dictKey] === 'string') {
        option.textContent = dict[dictKey];
      }
    }
  }
}

/**
 * Apply localized static strings, aria labels, placeholders, and <html lang>.
 * @param {Document} doc
 * @param {'en' | 'hi'} lang
 */
export function applyStaticI18n(doc, lang) {
  const safeLang = lang === 'hi' ? 'hi' : 'en';
  const dict = getStrings(safeLang);
  if (doc.documentElement) {
    doc.documentElement.lang = safeLang;
  }

  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key && typeof dict[key] === 'string') {
      el.textContent = dict[key];
    }
  }

  for (const el of doc.querySelectorAll('[data-i18n-aria]')) {
    const key = el.getAttribute('data-i18n-aria');
    if (key && typeof dict[key] === 'string') {
      el.setAttribute('aria-label', dict[key]);
    }
  }

  const cityInput = doc.getElementById('city-input');
  if (cityInput) {
    cityInput.placeholder = String(dict.cityPlaceholder);
  }
  const calInput = doc.getElementById('calibrated-aqi-input');
  if (calInput) {
    calInput.placeholder = String(dict.calibrationPlaceholder);
  }
  const chatInput = doc.getElementById('copilot-input');
  if (chatInput) {
    chatInput.placeholder = String(dict.copilotPlaceholder);
  }

  localizeSelectOptions(doc, dict);
}
