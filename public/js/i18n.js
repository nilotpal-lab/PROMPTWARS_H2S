/**
 * @fileoverview Bilingual (English / Hindi) UI dictionary, dynamic label
 * formatters, and DOM localization helpers.
 */

export const I18N_STRINGS = Object.freeze({
  en: Object.freeze({
    pageTitle: 'VayuMitra — Daily Smog & Air Action Guide',
    skipToContent: 'Skip to main content',
    brandTag: 'Daily Smog & Air Action Guide',
    langGroupLabel: 'Language selection',
    printSheetBtn: 'Print Fridge Sheet',
    askCopilotBtn: 'Ask VayuMitra',
    heroEyebrow: 'CPCB NAQI + Weather Forecast Guide',
    heroTitle: 'Route your family around winter smog peaks',
    heroSubtitle: 'Combine city-level pollution forecasts, local monitor calibration, and indoor air calculations into a clear daily plan.',
    locationHeading: 'Location, Winter Scenarios & Local Monitor Calibration',
    citySearchLabel: 'Indian city or locality',
    cityPlaceholder: 'Delhi, Patna, Mumbai, Noida',
    checkAirBtn: 'Check Air',
    useMyLocationBtn: 'Use My Location',
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
    tomorrowVentLabel: 'Tomorrow\'s airing slot',
    changedCardHeading: 'What Changed Today',
    pblHeightLabel: 'Mixing height (PBL)',
    windSpeedLabel: 'Wind 10m',
    vcLabel: 'Air Clearing Speed',
    chartCardHeading: '24-Hour PM2.5 Curve & Daytime Airing Slot',
    chartCardSub: 'Highlights the 09:00–18:00 IST daytime airing window vs night smog peaks',
    showTableBtn: 'Show 24-hour data table',
    hideTableBtn: 'Hide 24-hour data table',
    tableCaption: '24-hour forecast readings (IST), mixing height, and CPCB NAQI category',
    colHour: 'Hour (IST)',
    colPm25: 'PM2.5 (µg/m³)',
    colNaqi: 'NAQI',
    colPbl: 'Mixing Ht (m)',
    colVc: 'Clearing (m²/s)',
    colCategory: 'Category / GRAP',
    inversionDiagramAlt: 'Cross-section comparison showing daytime solar heating lifting air above 1,200 meters for safe 20-minute cross-ventilation versus a winter night cold lid below 400 meters trapping vehicle, cooking, and burning PM2.5.',
    inversionDiagramCaption: 'Why VayuMitra never tells families to open windows at 3 AM: cold nights trap smoke below 400 m until midday warmth lifts dispersion',
    invCallout1: 'Daytime (>1,200 m mixing layer): Solar warming lifts smog upward — safe 20-min cross-ventilation window.',
    invCallout2: 'Night thermal lid (<400 m inversion): Cold air traps vehicle, cooking, and burning PM2.5 at street level — keep windows shut.',
    invCallout3: 'Clearing Speed (VC = PBL × Wind): Values under 1,500 m²/s indicate trapped smoke and rapid buildup.',
    simulatorAria: 'Household simulator and action plan',
    simulatorHeading: 'Household & Impact Simulator',
    simulatorSub: 'Instant dose estimates update as you adjust family members, indoor habits, and commute mode',
    simDoseLabel: 'Daily inhaled dose',
    simReducedLabel: 'Avoided vs baseline',
    simIndoorLabel: 'Indoor PM2.5 (I/O)',
    householdMembersLegend: 'Household members in routine',
    focusProfileLabel: 'Dose simulator focus member',
    maskLabel: 'Outdoor mask fit',
    infantMaskBlock: 'SAFETY RULE (Under 2 yrs): Never place any mask on infants under 2 years (suffocation risk). Mask protection stays 0% for infant dose math; rely on filtered indoor rooms instead.',
    purifierLabel: 'Indoor air filtration',
    roomVolumeLabel: 'Bedroom / room size',
    outdoorHoursLabel: 'Daily outdoor / transit hours',
    indoorSourcesLegend: 'Indoor smoke & ventilation habits',
    toggleTadka: 'High-heat tadka / frying without kitchen exhaust',
    toggleIncense: 'Indoor agarbatti, dhoop, or mosquito coil',
    toggleJhadu: 'Dry jhadu sweeping (instead of damp pocha)',
    toggleSealed: 'Sealed 24h without midday CO₂ airing',
    commuteLegend: 'Daily commute swap',
    commuteFromLabel: 'Current mode',
    commuteToLabel: 'Cleaner swap',
    dailyKmLabel: 'Round-trip km/day',
    commuteDaysLabel: 'Days/week',
    rwaLegend: 'RWA & school collective actions',
    workspaceHeading: 'Your Daily Action Plan & Health Math',
    tablistAria: 'Action plan sections',
    tabRoutine: 'Daily Routine',
    tabIaq: 'Indoor Air Hacks',
    tabSwaps: 'Sustainable Swaps',
    tabImpact: 'Impact & Math',
    redFlagHeading: 'Medical Safety Alert',
    anchorsHeading: '3-Anchor Family Daily Routine',
    downloadIcsBtn: 'Add Reminders (.ics)',
    profileGuidanceHeading: 'Member-Specific Guardrails',
    iaqTiersHeading: 'Budget-Tiered Indoor Air Interventions',
    diyDiagramAlt: 'Diagram of a 230V/50Hz 4-filter MERV-13 Corsi-Rosenthal cube showing air drawn through all four sides to avoid motor overheating, optional activated carbon pre-wrap for cooking fumes, and sealed base seams.',
    diyDiagramCaption: '230V/50Hz safety rule: pair 4 pleated MERV-13 filters in a sealed cube so low air resistance keeps Indian box fan motors cool',
    diyCallout1: '4 pleated MERV-13 filter walls: Draw room air from all 4 sides (~320 m³/h CADR) so 230V/50Hz box fan motors never overheat.',
    diyCallout2: 'Sealed cardboard shroud & tape seams: Block bypass leaks around fan corners so air passes through the filter media.',
    diyCallout3: 'Optional activated carbon pre-wrap: Traps kitchen tadka fumes & NO₂; never tape a single filter directly onto a 230V fan.',
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
    cigHeading: 'Cigarette-Risk Equivalent (Adults Only)',
    boxHeading: 'Indoor Air Concentration Estimate',
    showMathLabel: 'Show the Math: Air Quality & Dose Equations',
    footerNotice: 'VayuMitra provides science-backed air quality exposure guidance and is not a substitute for emergency medical care.',
    copilotTitle: 'Ask VayuMitra',
    closeBtn: 'Close',
    quickChipsAria: 'Suggested questions',
    copilotInputLabel: 'Ask a question about today\'s air quality or routine',
    copilotPlaceholder: 'Ask about airing time, masks, DIY filters, or cooking smoke',
    sendBtn: 'Send',
    sendingStatus: 'Preparing grounded reply...',
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
    mythFactLabel: 'Science fact',
    anchorDoneLabel: 'Completed today',
    sourceGemini: 'AI-Personalized Plan',
    sourceFallback: 'Standard Action Plan',
    sourcePlanOffline: 'Standard Plan (Offline Fallback)',
    copiedDone: 'Copied brief to clipboard for WhatsApp',
    copyFailed: 'Automatic copy blocked — select and copy below',
    loadingStatus: 'Updating air forecast and mixing height...',
    staleNotice: 'Showing cached or baseline forecast while live station refreshes',
    errorPrefix: 'Could not reach live station: ',
    cityNotFoundError: 'City not found — check spelling or choose a preset',
    invalidCityError: 'Enter an Indian city or locality name (2–80 characters) or pick a preset.',
    invalidCalibrationError: 'Enter a valid local monitor NAQI between 1 and 999.',
    invalidDailyKmError: 'Enter round-trip commute distance between 0 and 200 km.',
    invalidCommuteDaysError: 'Enter commute days between 1 and 7 per week.',
    planFallbackError: 'Live plan sync unavailable — showing verified deterministic plan: ',
    gpsLocating: 'Detecting your location...',
    gpsUnsupported: 'Geolocation is not supported in this browser — search a city or choose a preset.',
    gpsDenied: 'Location permission denied — search a city or choose a preset.',
    gpsTimeout: 'Location request timed out — please retry or search a city.',
    gpsUnavailable: 'Could not determine your location — search a city or choose a preset.',
    quickChips: [
      'Best time to open windows today?',
      'Can my infant wear a mask outdoors?',
      'How to build a safe 230V DIY purifier?',
      'How much does cooking tadka raise indoor PM2.5?'
    ]
  }),
  hi: Object.freeze({
    pageTitle: 'वायुमित्र — दैनिक धुंध और स्वास्थ्य सुरक्षा मार्गदर्शक',
    skipToContent: 'मुख्य सामग्री पर जाएं',
    brandTag: 'दैनिक धुंध और स्वास्थ्य मार्गदर्शक',
    langGroupLabel: 'भाषा चुनें',
    printSheetBtn: 'फ्रिज शीट प्रिंट करें',
    askCopilotBtn: 'वायुमित्र से पूछें',
    heroEyebrow: 'CPCB NAQI + मौसम पूर्वानुमान योजना',
    heroTitle: 'सर्दियों की धुंध से अपने परिवार को सुरक्षित रखें',
    heroSubtitle: 'शहर स्तर के प्रदूषण पूर्वानुमान, स्थानीय मॉनिटर कैलिब्रेशन और घर के अंदर की हवा की गणना से स्पष्ट दैनिक योजना बनाएं।',
    locationHeading: 'स्थान, धुंध परिदृश्य और स्थानीय कैलिब्रेशन',
    citySearchLabel: 'भारतीय शहर या क्षेत्र',
    cityPlaceholder: 'दिल्ली, पटना, मुंबई, नोएडा',
    checkAirBtn: 'हवा जांचें',
    useMyLocationBtn: 'मेरा स्थान उपयोग करें',
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
    ventCardHeading: 'दोपहर वेंटिलेशन का सबसे सुरक्षित समय',
    peakSmogLabel: 'चरम धुंध के घंटे',
    tomorrowVentLabel: 'कल हवा बदलने का समय',
    changedCardHeading: 'आज क्या बदला',
    pblHeightLabel: 'मिश्रण ऊँचाई (PBL)',
    windSpeedLabel: 'हवा (10 मी)',
    vcLabel: 'हवा साफ होने की गति',
    chartCardHeading: '24-घंटे PM2.5 ग्राफ और दोपहर का समय',
    chartCardSub: 'रात के धुंध शिखर की तुलना में 09:00–18:00 IST के बीच हवा बदलने का समय दिखाता है',
    showTableBtn: '24-घंटे की डेटा तालिका दिखाएं',
    hideTableBtn: 'डेटा तालिका छिपाएं',
    tableCaption: '24-घंटे के पूर्वानुमान (IST), मिश्रण ऊँचाई और CPCB NAQI श्रेणी',
    colHour: 'समय (IST)',
    colPm25: 'PM2.5 (µg/m³)',
    colNaqi: 'NAQI',
    colPbl: 'ऊँचाई (मी)',
    colVc: 'गति (m²/s)',
    colCategory: 'श्रेणी / GRAP',
    inversionDiagramAlt: 'दोपहर में धूप से हवा की परत 1,200 मीटर से ऊपर उठकर सुरक्षित हवा बदलने और सर्दियों की रात में 400 मीटर से नीचे धुआं फंसने की तुलना दिखाने वाला चित्र।',
    inversionDiagramCaption: 'वायुमित्र रात 3 बजे खिड़की खोलने की सलाह क्यों नहीं देता: ठंडी रातों में धुआं 400 मी से नीचे फंसा रहता है',
    invCallout1: 'दिन (1,200 मी+ मिश्रण परत): धूप से हवा गर्म होकर ऊपर उठती है — 20 मिनट खिड़कियां खोलने का सुरक्षित समय।',
    invCallout2: 'रात की ठंडी परत (<400 मी इन्वर्ज़न): ठंडी हवा वाहन, रसोई व धुएं का PM2.5 सड़क स्तर पर रोकती है — खिड़कियां बंद रखें।',
    invCallout3: 'सफाई गति (VC = PBL × हवा): 1,500 m²/s से कम मान धुआं फंसने और तेज़ प्रदूषण बढ़ने का संकेत है।',
    simulatorAria: 'परिवार सिम्युलेटर और कार्य योजना',
    simulatorHeading: 'परिवार और प्रभाव सिम्युलेटर',
    simulatorSub: 'परिवार के सदस्यों, घरेलू आदतों और यात्रा विकल्प बदलते ही फेफड़ों पर भार तुरंत देखें',
    simDoseLabel: 'दैनिक PM2.5 भार',
    simReducedLabel: 'आधार से कमी',
    simIndoorLabel: 'इनडोर PM2.5 (I/O)',
    householdMembersLegend: 'परिवार के सदस्य चुनें',
    focusProfileLabel: 'डोज़ सिम्युलेटर मुख्य सदस्य',
    maskLabel: 'बाहर मास्क का प्रकार',
    infantMaskBlock: 'सुरक्षा नियम (2 वर्ष से कम): शिशु को कभी कोई मास्क न पहनाएं (घुटन का खतरा)। शिशु गणना में मास्क सुरक्षा 0% रखी गई है; बंद फ़िल्टर कमरे का उपयोग करें।',
    purifierLabel: 'कमरे का एयर फ़िल्टर',
    roomVolumeLabel: 'कमरे का आकार',
    outdoorHoursLabel: 'रोज़ बाहर बिताने के घंटे',
    indoorSourcesLegend: 'घर के अंदर धुआं और वेंटिलेशन आदतें',
    toggleTadka: 'बिना एग्जॉस्ट के तेज़ आंच पर तड़का / तलना',
    toggleIncense: 'घर के अंदर अगरबत्ती, धूप या मच्छर कॉइल',
    toggleJhadu: 'सूखा झाड़ू लगाना (गीले पोंछे के बजाय)',
    toggleSealed: 'दोपहर में हवा बदले बिना 24 घंटे घर बंद',
    commuteLegend: 'यात्रा माध्यम बदलाव',
    commuteFromLabel: 'वर्तमान वाहन',
    commuteToLabel: 'स्वच्छ विकल्प',
    dailyKmLabel: 'दैनिक दूरी (किमी)',
    commuteDaysLabel: 'सप्ताह में दिन',
    rwaLegend: 'सोसाइटी (RWA) व स्कूल सामूहिक कदम',
    workspaceHeading: 'दैनिक कार्य योजना और स्वास्थ्य गणित',
    tablistAria: 'कार्य योजना अनुभाग',
    tabRoutine: 'दैनिक दिनचर्या',
    tabIaq: 'घरेलू हवा उपाय',
    tabSwaps: 'स्वच्छ बदलाव',
    tabImpact: 'प्रभाव व गणित',
    redFlagHeading: 'चिकित्सा सुरक्षा चेतावनी',
    anchorsHeading: '3-चरणीय पारिवारिक दिनचर्या',
    downloadIcsBtn: 'रिमाइंडर डाउनलोड (.ics)',
    profileGuidanceHeading: 'सदस्य के अनुसार सुरक्षा निर्देश',
    iaqTiersHeading: 'बजट के अनुसार इनडोर उपाय',
    diyDiagramAlt: '230V/50Hz 4-फ़िल्टर MERV-13 कॉर्सी-रोसेंथल बॉक्स का चित्र जिसमें चारों ओर से हवा अंदर आकर मोटर को ठंडा रखती है और तड़का धुएं के लिए कार्बन शीट व टेप सील दिखाई गई है।',
    diyDiagramCaption: '230V/50Hz सुरक्षा नियम: भारतीय बॉक्स फैन की मोटर को गर्म होने से बचाने के लिए हमेशा 4 MERV-13 फ़िल्टर का क्यूब बनाएं',
    diyCallout1: '4 प्लीटेड MERV-13 फ़िल्टर दीवारें: चारों तरफ से हवा खींचती हैं (~320 m³/h CADR) ताकि 230V/50Hz पंखे की मोटर गर्म न हो।',
    diyCallout2: 'सील किया गया कार्डबोर्ड आवरण व टेप जोड़: किनारों से हवा का रिसाव रोकता है ताकि पूरी हवा फ़िल्टर से गुज़रे।',
    diyCallout3: 'वैकल्पिक एक्टिवेटेड कार्बन प्री-रैप: तड़का गंध व NO₂ कम करता है; कभी 230V पंखे पर केवल 1 फ़िल्टर न चिपकाएं।',
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
    cigHeading: 'सिगरेट जोखिम समतुल्य (केवल वयस्क)',
    boxHeading: 'इनडोर हवा सांद्रता अनुमान',
    showMathLabel: 'गणित देखें: वायु गुणवत्ता और डोज़ सूत्र',
    footerNotice: 'वायुमित्र विज्ञान आधारित मार्गदर्शन देता है; आपात स्थिति में डॉक्टर से तुरंत संपर्क करें।',
    copilotTitle: 'वायुमित्र से पूछें',
    closeBtn: 'बंद करें',
    quickChipsAria: 'सुझाए गए प्रश्न',
    copilotInputLabel: 'आज की वायु गुणवत्ता या दिनचर्या के बारे में प्रश्न पूछें',
    copilotPlaceholder: 'हवा बदलने का समय, मास्क, DIY फ़िल्टर या तड़का धुएं के बारे में पूछें',
    sendBtn: 'भेजें',
    sendingStatus: 'उत्तर तैयार हो रहा है...',
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
    sourceGemini: 'AI-अनुकूलित योजना',
    sourceFallback: 'मानक कार्य योजना',
    sourcePlanOffline: 'मानक योजना (ऑफ़लाइन फ़ॉलबैक)',
    copiedDone: 'व्हाट्सऐप संदेश कॉपी हो गया',
    copyFailed: 'स्वचालित कॉपी उपलब्ध नहीं — नीचे दिए बॉक्स से कॉपी करें',
    loadingStatus: 'ताज़ा वायु गुणवत्ता और मौसम डेटा लोड हो रहा है...',
    staleNotice: 'ताज़ा डेटा अपडेट होने तक सुरक्षित मानक पूर्वानुमान दिखाया जा रहा है',
    errorPrefix: 'लाइव स्टेशन से संपर्क नहीं हो सका: ',
    cityNotFoundError: 'शहर नहीं मिला — वर्तनी जांचें या कोई परिदृश्य चुनें।',
    invalidCityError: 'कृपया भारतीय शहर या क्षेत्र का नाम लिखें (2–80 अक्षर) या परिदृश्य चुनें।',
    invalidCalibrationError: 'कृपया 1 से 999 के बीच मान्य स्थानीय NAQI दर्ज करें।',
    invalidDailyKmError: 'दैनिक यात्रा दूरी 0 से 200 किमी के बीच दर्ज करें।',
    invalidCommuteDaysError: 'सप्ताह के दिन 1 से 7 के बीच दर्ज करें।',
    planFallbackError: 'लाइव योजना सिंक उपलब्ध नहीं — सत्यापित मानक योजना दिखाई जा रही है: ',
    gpsLocating: 'आपका स्थान पता लगाया जा रहा है...',
    gpsUnsupported: 'इस ब्राउज़र में लोकेशन सेवा उपलब्ध नहीं है — शहर खोजें या परिदृश्य चुनें।',
    gpsDenied: 'लोकेशन की अनुमति नहीं मिली — शहर खोजें या परिदृश्य चुनें।',
    gpsTimeout: 'लोकेशन अनुरोध का समय समाप्त — पुनः प्रयास करें या शहर खोजें।',
    gpsUnavailable: 'आपका स्थान प्राप्त नहीं हो सका — कृपया शहर खोजें या परिदृश्य चुनें।',
    quickChips: [
      'आज खिड़कियां खोलने का सबसे अच्छा समय क्या है?',
      'क्या शिशु को बाहर मास्क पहना सकते हैं?',
      '230V सुरक्षित DIY प्यूरीफायर कैसे बनाएं?',
      'तड़का और अगरबत्ती से घर में PM2.5 कितना बढ़ता है?'
    ]
  })
});

const OPTION_KEYS = Object.freeze({
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
 * Format numeric values cleanly with Indian grouping.
 * @param {number} value
 * @param {string} _lang
 * @param {number} [maxDecimals]
 * @returns {string}
 */
export function formatNumber(value, _lang, maxDecimals = 0) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDecimals }).format(value);
}

/**
 * Sync #profile-select options dynamically to ONLY the checked household profiles.
 * @param {Document} doc
 * @param {readonly string[]} checkedProfiles
 * @param {string} selectedProfile
 * @param {'en' | 'hi'} lang
 */
export function syncProfileSelectOptions(doc, checkedProfiles, selectedProfile, lang) {
  const select = doc.getElementById('profile-select');
  if (!select) {
    return;
  }
  const dict = getStrings(lang);
  const validList = checkedProfiles.length > 0 ? checkedProfiles : ['commuter'];
  const options = validList.map((id) => {
    const opt = doc.createElement('option');
    opt.value = id;
    opt.textContent = String(dict[`prof_${id}`] || id);
    return opt;
  });
  select.replaceChildren(...options);
  select.value = validList.includes(selectedProfile) ? selectedProfile : validList[0];
}

function localizeAttrTargets(doc, dict, attrName, targetAttr) {
  for (const el of doc.querySelectorAll(`[${attrName}]`)) {
    const key = el.getAttribute(attrName);
    if (key && typeof dict[key] === 'string') {
      el.setAttribute(targetAttr, dict[key]);
    }
  }
}

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
 * Apply localized static strings, <title>, aria labels, alt text, placeholders, and <html lang>.
 * @param {Document} doc
 * @param {'en' | 'hi'} lang
 */
export function applyStaticI18n(doc, lang) {
  const safeLang = lang === 'hi' ? 'hi' : 'en';
  const dict = getStrings(safeLang);
  if (doc.documentElement) {
    doc.documentElement.lang = safeLang;
  }
  doc.title = String(dict.pageTitle);

  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key && typeof dict[key] === 'string') {
      el.textContent = dict[key];
    }
  }

  localizeAttrTargets(doc, dict, 'data-i18n-aria', 'aria-label');
  localizeAttrTargets(doc, dict, 'data-i18n-alt', 'alt');
  localizeAttrTargets(doc, dict, 'data-i18n-placeholder', 'placeholder');
  localizeSelectOptions(doc, dict);
}
