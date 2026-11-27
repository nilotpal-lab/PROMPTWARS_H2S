/**
 * @fileoverview VayuMitra frontend orchestration: 0ms deterministic boot + async /api/plan sync,
 * section-scoped rendering, GPS geolocation, accessible form validation, AbortController API sync,
 * APG roving-tabindex tabs, native <dialog> copilot, bilingual i18n toggle, .ics download, and WhatsApp brief copy.
 */

import { applyStaticI18n, formatNumber, getStrings, syncProfileSelectOptions } from './i18n.js';
import {
  PROFILE_PARAMS,
  PROFILE_RISK_ORDER,
  buildPlanRequestPayload,
  computeImpactMirror,
  createInitialState,
  getTodayIstKey,
  saveChecklist,
  saveLang
} from './state.js';
import { fetchActionPlan, fetchAqiSnapshot, isAbortError, postChatMessage } from './api.js';
import {
  buildIcsContent,
  collectDomRefs,
  generateDeterministicPlan,
  renderCopilotPanel,
  renderLocationAndTelemetry,
  renderPlanSections,
  renderSimulatorReadout
} from './renderers.js';

const TAB_ORDER = ['routine', 'iaq', 'swaps', 'impact'];

function setDialogOpen(dialog, open) {
  if (!dialog) {
    return;
  }
  if (open) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    return;
  }
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

/**
 * Activate a tab by key and update roving tabindex + hidden panels per WAI-ARIA APG.
 * @param {Document} doc
 * @param {string} targetId
 * @param {boolean} moveFocus
 */
export function activateTab(doc, targetId, moveFocus = false) {
  for (const id of TAB_ORDER) {
    const tab = doc.getElementById(`tab-${id}`);
    const panel = doc.getElementById(`panel-${id}`);
    const selected = id === targetId;
    if (tab) {
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      if (selected && moveFocus) {
        tab.focus();
      }
    }
    if (panel) {
      panel.hidden = !selected;
    }
  }
}

function nextTabIndexForKey(key, currentIdx) {
  const map = {
    ArrowRight: (currentIdx + 1) % TAB_ORDER.length,
    ArrowLeft: (currentIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length,
    Home: 0,
    End: TAB_ORDER.length - 1
  };
  return Object.hasOwn(map, key) ? map[key] : -1;
}

/**
 * Bind WAI-ARIA APG keyboard navigation (ArrowLeft, ArrowRight, Home, End) and clicks on tablist.
 * @param {Document} doc
 * @param {(tabId: string) => void} [onSelect]
 */
export function bindTabs(doc, onSelect) {
  for (const [idx, id] of TAB_ORDER.entries()) {
    const tab = doc.getElementById(`tab-${id}`);
    if (!tab) {
      continue;
    }
    tab.addEventListener('click', () => {
      activateTab(doc, id, false);
      if (onSelect) {
        onSelect(id);
      }
    });
    tab.addEventListener('keydown', (event) => {
      const nextIdx = nextTabIndexForKey(event.key, idx);
      if (nextIdx < 0) {
        return;
      }
      event.preventDefault();
      const nextId = TAB_ORDER[nextIdx];
      activateTab(doc, nextId, true);
      if (onSelect) {
        onSelect(nextId);
      }
    });
  }
}

function updateSelectedCheckboxStyles(doc) {
  for (const box of doc.querySelectorAll('.chip-check input, .toggle-row input')) {
    box.parentElement?.classList.toggle('is-selected', box.checked);
  }
}

function setFieldInvalid(inputEl, describedById, errorEl, msg) {
  if (inputEl) {
    inputEl.setAttribute('aria-invalid', 'true');
    if (describedById) {
      inputEl.setAttribute('aria-describedby', describedById);
    }
  }
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
}

function clearFieldInvalid(inputEl, errorEl) {
  if (inputEl) {
    inputEl.removeAttribute('aria-invalid');
    inputEl.removeAttribute('aria-describedby');
  }
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function readNumField(doc, id, min, max) {
  const raw = doc.getElementById(id)?.value;
  if (raw === undefined || String(raw).trim() === '') {
    return undefined;
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, num));
}

function readValidatedNumericInput(doc, inputId, errorId, options) {
  const inputEl = doc.getElementById(inputId);
  const errorEl = doc.getElementById(errorId);
  const rawStr = inputEl ? String(inputEl.value).trim() : '';
  if (rawStr === '') {
    clearFieldInvalid(inputEl, errorEl);
    return options.emptyValue;
  }
  const num = Number(rawStr);
  if (!Number.isFinite(num) || num < options.min || num > options.max) {
    setFieldInvalid(inputEl, errorId, errorEl, options.errorMessage);
    return options.invalidFallback;
  }
  clearFieldInvalid(inputEl, errorEl);
  return num;
}

function readDomToggles(doc) {
  return {
    noExhaustTadka: Boolean(doc.getElementById('toggle-tadka')?.checked),
    indoorIncenseOrCoil: Boolean(doc.getElementById('toggle-incense')?.checked),
    dryJhaduSweeping: Boolean(doc.getElementById('toggle-jhadu')?.checked),
    sealed24hNoFlush: Boolean(doc.getElementById('toggle-sealed')?.checked)
  };
}

function readSelectVal(doc, id, fallback) {
  const el = doc.getElementById(id);
  return el && el.value ? el.value : fallback;
}

function readProfileSelection(doc) {
  const checked = Array.from(doc.querySelectorAll('input[name="profiles"]:checked')).map((el) => el.value);
  if (checked.length === 0) {
    const fallbackBox = doc.querySelector('input[name="profiles"][value="commuter"]');
    if (fallbackBox) {
      fallbackBox.checked = true;
    }
  }
  const profiles = checked.length > 0 ? checked : ['commuter'];
  const selectVal = readSelectVal(doc, 'profile-select', '');
  const profile = profiles.includes(selectVal) ? selectVal : profiles[0];
  return { profile, profiles };
}

function readHouseholdFromDom(doc, currentHousehold, lang) {
  const dict = getStrings(lang);
  const { profile, profiles } = readProfileSelection(doc);
  const communityActions = Array.from(doc.querySelectorAll('input[name="communityActions"]:checked')).map((el) => el.value);

  const dailyKm = readValidatedNumericInput(doc, 'daily-km-input', 'daily-km-error', {
    min: 0,
    max: 200,
    emptyValue: 0,
    invalidFallback: 0,
    errorMessage: String(dict.invalidDailyKmError)
  });
  const commuteDaysPerWeek = readValidatedNumericInput(doc, 'commute-days-input', 'commute-days-error', {
    min: 1,
    max: 7,
    emptyValue: 5,
    invalidFallback: 5,
    errorMessage: String(dict.invalidCommuteDaysError)
  });

  return {
    ...currentHousehold,
    profile,
    profiles,
    maskType: readSelectVal(doc, 'mask-select', 'n95'),
    purifierMode: readSelectVal(doc, 'purifier-select', 'none'),
    roomVolumeM3: readNumField(doc, 'room-volume-range', 10, 500) ?? 36,
    outdoorHours: readNumField(doc, 'outdoor-hours-range', 0, 16) ?? PROFILE_PARAMS[profile].defaultOutdoorHours,
    commuteFrom: readSelectVal(doc, 'commute-from-select', 'petrol_car'),
    commuteTo: readSelectVal(doc, 'commute-to-select', 'metro_bus'),
    dailyKm,
    commuteDaysPerWeek,
    communityActions,
    ...readDomToggles(doc)
  };
}

function pickHighestRiskProfile(checked) {
  return PROFILE_RISK_ORDER.find((id) => checked.includes(id)) || checked[0] || 'commuter';
}

function syncProfileOutdoorHours(doc, target, lang) {
  const range = doc.getElementById('outdoor-hours-range');
  if (!range) {
    return;
  }
  if (target?.name === 'profiles') {
    const checked = Array.from(doc.querySelectorAll('input[name="profiles"]:checked')).map((el) => el.value);
    const chosen = pickHighestRiskProfile(checked);
    syncProfileSelectOptions(doc, checked, chosen, lang);
    range.value = String(PROFILE_PARAMS[chosen]?.defaultOutdoorHours ?? range.value);
    return;
  }
  if (target?.id === 'profile-select' && PROFILE_PARAMS[target.value]) {
    range.value = String(PROFILE_PARAMS[target.value].defaultOutdoorHours);
  }
}

function syncPressedButtons(doc, selector, attr, activeValue) {
  for (const btn of doc.querySelectorAll(selector)) {
    btn.setAttribute('aria-pressed', btn.getAttribute(attr) === activeValue ? 'true' : 'false');
  }
}

function triggerFileDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isValidCityText(cityVal) {
  return cityVal.length >= 2 && /[a-zA-Z\u0900-\u097F0-9]/.test(cityVal);
}

function mapGeolocationErrorMessage(geoErr, dict) {
  if (geoErr?.code === 1) {
    return String(dict.gpsDenied);
  }
  if (geoErr?.code === 3) {
    return String(dict.gpsTimeout);
  }
  return String(dict.gpsUnavailable);
}

function bindGpsButton(doc, refs, state, setStatus, refreshAqiAndPlan) {
  const gpsBtn = refs['gps-locate-btn'] || doc.getElementById('gps-locate-btn');
  gpsBtn?.addEventListener('click', () => {
    const dict = getStrings(state.lang);
    const geo = window.navigator?.geolocation;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      setStatus(String(dict.gpsUnsupported), true);
      return;
    }
    gpsBtn.disabled = true;
    setStatus(String(dict.gpsLocating), false);
    geo.getCurrentPosition(
      (pos) => {
        gpsBtn.disabled = false;
        const lat = Number(pos?.coords?.latitude);
        const lon = Number(pos?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setStatus(String(dict.gpsUnavailable), true);
          return;
        }
        clearFieldInvalid(refs['city-input'], null);
        refreshAqiAndPlan(
          { ...state.query, city: '', preset: '', lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) },
          () => {
            if (refs['city-input']) {
              refs['city-input'].value = '';
            }
          }
        );
      },
      (geoErr) => {
        gpsBtn.disabled = false;
        setStatus(mapGeolocationErrorMessage(geoErr, getStrings(state.lang)), true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

function bindLocationHandlers(doc, refs, state, setStatus, refreshAqiAndPlan) {
  const cityInput = refs['city-input'] || doc.getElementById('city-input');
  const calInput = refs['calibrated-aqi-input'] || doc.getElementById('calibrated-aqi-input');
  const clearBannerError = () => {
    if (refs['status-banner']?.classList.contains('status-error')) {
      setStatus(state.snapshot?.stale ? String(getStrings(state.lang).staleNotice) : '', false);
    }
  };

  cityInput?.addEventListener('input', () => {
    clearFieldInvalid(cityInput, null);
    clearBannerError();
  });
  calInput?.addEventListener('input', () => {
    clearFieldInvalid(calInput, null);
    clearBannerError();
  });

  doc.getElementById('city-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const dict = getStrings(state.lang);
    const cityVal = cityInput?.value.trim() || '';
    if (!isValidCityText(cityVal)) {
      setFieldInvalid(cityInput, 'status-banner', null, '');
      setStatus(String(dict.invalidCityError), true);
      cityInput?.focus();
      return;
    }
    clearFieldInvalid(cityInput, null);
    refreshAqiAndPlan({ ...state.query, city: cityVal, preset: '', lat: null, lon: null });
  });

  for (const btn of doc.querySelectorAll('[data-preset]')) {
    btn.addEventListener('click', () => {
      clearFieldInvalid(cityInput, null);
      const nextPreset = btn.getAttribute('data-preset') || 'delhi-severe';
      refreshAqiAndPlan(
        { ...state.query, preset: nextPreset, city: '', lat: null, lon: null },
        () => {
          if (cityInput) {
            cityInput.value = '';
          }
        }
      );
    });
  }

  doc.getElementById('calibration-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const dict = getStrings(state.lang);
    const rawStr = calInput?.value.trim() || '';
    const raw = Number(rawStr);
    if (!rawStr || !Number.isFinite(raw) || raw < 1 || raw > 999) {
      setFieldInvalid(calInput, 'status-banner', null, '');
      setStatus(String(dict.invalidCalibrationError), true);
      calInput?.focus();
      return;
    }
    clearFieldInvalid(calInput, null);
    refreshAqiAndPlan(
      { ...state.query, calibratedAqi: Math.round(raw) },
      () => {
        if (refs['clear-calibration-btn']) {
          refs['clear-calibration-btn'].hidden = false;
        }
      }
    );
  });

  refs['clear-calibration-btn']?.addEventListener('click', () => {
    clearFieldInvalid(calInput, null);
    refreshAqiAndPlan(
      { ...state.query, calibratedAqi: null },
      () => {
        if (calInput) {
          calInput.value = '';
        }
        if (refs['clear-calibration-btn']) {
          refs['clear-calibration-btn'].hidden = true;
        }
      }
    );
  });

  bindGpsButton(doc, refs, state, setStatus, refreshAqiAndPlan);
}

function bindCopilotDialog(doc, refs, sendChatPrompt) {
  let lastTriggerEl = null;
  const openBtn = doc.getElementById('open-copilot-btn');
  const closeBtn = doc.getElementById('close-copilot-btn');
  const dialog = refs['copilot-dialog'];

  const restoreFocus = () => {
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
  };

  const closeCopilot = () => {
    setDialogOpen(dialog, false);
    restoreFocus();
  };

  openBtn?.addEventListener('click', () => {
    lastTriggerEl = doc.activeElement || openBtn;
    setDialogOpen(dialog, true);
    refs['copilot-input']?.focus();
  });

  closeBtn?.addEventListener('click', closeCopilot);
  dialog?.addEventListener('close', restoreFocus);
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCopilot();
    }
  });

  doc.getElementById('copilot-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = refs['copilot-input'];
    const text = input ? input.value.trim() : '';
    if (!text) {
      return;
    }
    input.value = '';
    sendChatPrompt(text);
  });
}

async function copyWhatsappBrief(refs, lang) {
  const brief = refs['whatsapp-brief-text']?.textContent || '';
  const dict = getStrings(lang);
  try {
    await window.navigator.clipboard.writeText(brief);
    if (refs['copy-status']) {
      refs['copy-status'].textContent = String(dict.copiedDone);
    }
    if (refs['whatsapp-fallback-wrap']) {
      refs['whatsapp-fallback-wrap'].hidden = true;
    }
  } catch (_err) {
    if (refs['copy-status']) {
      refs['copy-status'].textContent = String(dict.copyFailed);
    }
    if (refs['whatsapp-fallback-wrap']) {
      refs['whatsapp-fallback-wrap'].hidden = false;
    }
  }
}

function bindUtilityActions(doc, refs, state, onLangChange) {
  for (const langBtn of doc.querySelectorAll('.lang-btn')) {
    langBtn.addEventListener('click', () => {
      const next = langBtn.getAttribute('data-lang') === 'hi' ? 'hi' : 'en';
      if (next !== state.lang) {
        onLangChange(next);
      }
    });
  }

  refs['toggle-table-btn']?.addEventListener('click', () => {
    const wrap = refs['pm25-table-wrap'];
    const btn = refs['toggle-table-btn'];
    if (!wrap || !btn) {
      return;
    }
    const next = btn.getAttribute('aria-expanded') !== 'true';
    wrap.hidden = !next;
    btn.setAttribute('aria-expanded', String(next));
    btn.setAttribute('data-i18n', next ? 'hideTableBtn' : 'showTableBtn');
    const dict = getStrings(state.lang);
    btn.textContent = String(next ? dict.hideTableBtn : dict.showTableBtn);
  });

  doc.getElementById('download-ics-btn')?.addEventListener('click', () => {
    const ics = buildIcsContent(state.snapshot, state.lang);
    triggerFileDownload(`vayumitra-${getTodayIstKey()}.ics`, ics, 'text/calendar;charset=utf-8');
  });

  doc.getElementById('copy-whatsapp-btn')?.addEventListener('click', () => copyWhatsappBrief(refs, state.lang));
  doc.getElementById('print-sheet-btn')?.addEventListener('click', () => window.print());
}

function setCopilotLoading(refs, loading, lang, doc = null) {
  const msgBox = refs['copilot-messages'];
  const sendBtn = refs['copilot-send-btn'];
  const statusEl = refs['copilot-status'];
  if (msgBox) {
    msgBox.setAttribute('aria-busy', loading ? 'true' : 'false');
  }
  if (sendBtn) {
    sendBtn.disabled = loading;
  }
  const chipScope = doc || refs['copilot-quick-chips'];
  if (chipScope) {
    for (const chip of chipScope.querySelectorAll('.quick-chip-btn')) {
      chip.disabled = loading;
    }
  }
  if (statusEl) {
    statusEl.textContent = loading ? String(getStrings(lang).sendingStatus) : '';
  }
}

function buildChatMeta(data, lang) {
  if (!data?.citedMetrics) {
    return String(data?.source || 'fallback');
  }
  const naqi = formatNumber(Number(data.citedMetrics.naqi), lang);
  const srcLabel = data.source === 'gemini' ? getStrings(lang).sourceGemini : getStrings(lang).sourceFallback;
  return `NAQI ${naqi} · ${data.citedMetrics.ventilationWindow} · ${srcLabel}`;
}

function bindSimulatorEvents(doc, handler) {
  const form = doc.getElementById('simulator-form');
  if (!form) {
    return;
  }
  form.addEventListener('input', (event) => {
    if (['range', 'number', 'text'].includes(event.target?.type)) {
      handler(event);
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target?.type === 'checkbox' || event.target?.tagName === 'SELECT') {
      handler(event);
    }
  });
}

function clearTransientNotices(refs, state, setStatus) {
  if (refs['copy-status']) {
    refs['copy-status'].textContent = '';
  }
  if (refs['copilot-status']) {
    refs['copilot-status'].textContent = '';
  }
  if (state.snapshot?.stale) {
    setStatus(String(getStrings(state.lang).staleNotice), false);
  } else {
    setStatus('', false);
  }
}

function buildDeterministicPlanForState(state) {
  return generateDeterministicPlan({
    snapshot: state.snapshot,
    impact: state.impact,
    ...state.household,
    lang: state.lang
  });
}

/**
 * Initialize VayuMitra application controllers and listeners on the provided Document.
 * @param {Document} [doc]
 * @returns {{ state: Record<string, unknown>, refreshAll: () => Promise<void>, syncPlan: () => Promise<void>, destroy: () => void }}
 */
export function initApp(doc = document) {
  const state = createInitialState();
  state.plan = buildDeterministicPlanForState(state);
  const refs = collectDomRefs(doc);
  let lastValidQuery = { ...state.query };
  let planDebounceTimer = null;
  let liveAnnounceTimer = null;
  let destroyed = false;

  const setStatus = (msg, isError = false) => {
    const banner = refs['status-banner'];
    if (!banner) {
      return;
    }
    banner.textContent = msg;
    banner.setAttribute('role', isError ? 'alert' : 'status');
    banner.classList.toggle('status-error', Boolean(isError && msg));
  };

  const toggleChecklist = (anchorId, checked) => {
    state.checklist[anchorId] = checked;
    saveChecklist(getTodayIstKey(), state.checklist);
  };

  const renderTelemetrySection = () => {
    const activePreset = state.query.city || Number.isFinite(state.query.lat) ? '' : state.query.preset;
    syncPressedButtons(doc, '[data-preset]', 'data-preset', activePreset);
    renderLocationAndTelemetry(refs, state.snapshot, state.lang);
  };

  const renderSimulatorSection = () => {
    syncProfileSelectOptions(doc, state.household.profiles, state.household.profile, state.lang);
    updateSelectedCheckboxStyles(doc);
    renderSimulatorReadout(refs, state.impact, state.household, state.snapshot, state.lang);
  };

  const renderPlanSection = () => {
    renderPlanSections(refs, state, toggleChecklist);
  };

  const renderCopilotSection = () => {
    renderCopilotPanel(refs, state.chatHistory, state.snapshot, state.lang, sendChatPrompt);
  };

  const renderEverything = () => {
    applyStaticI18n(doc, state.lang);
    syncPressedButtons(doc, '.lang-btn', 'data-lang', state.lang);
    renderTelemetrySection();
    renderSimulatorSection();
    renderPlanSection();
    renderCopilotSection();
  };

  const applySyncPlanSuccess = (res, dict) => {
    if (res?.plan) {
      state.plan = res.plan;
      state.planSource = res.source === 'gemini' ? 'gemini' : 'fallback';
    }
    if (state.planSource !== 'error-fallback' && refs['status-banner']?.classList.contains('status-error')) {
      setStatus(state.snapshot?.stale ? String(dict.staleNotice) : '', false);
    }
    renderPlanSection();
  };

  const syncServerPlan = async () => {
    const dict = getStrings(state.lang);
    try {
      const res = await fetchActionPlan(buildPlanRequestPayload(state));
      if (!destroyed) {
        applySyncPlanSuccess(res, dict);
      }
    } catch (err) {
      if (!destroyed && !isAbortError(err)) {
        state.plan = buildDeterministicPlanForState(state);
        state.planSource = 'error-fallback';
        setStatus(`${dict.planFallbackError}${err.message}`, true);
        renderPlanSection();
      }
    }
  };

  const refreshAqiAndPlan = async (pendingQuery = state.query, onSuccess = null) => {
    const dict = getStrings(state.lang);
    setStatus(String(dict.loadingStatus), false);
    try {
      const snap = await fetchAqiSnapshot({ ...pendingQuery, lang: state.lang });
      if (snap?.current) {
        state.query = { ...pendingQuery };
        lastValidQuery = { ...pendingQuery };
        if (typeof onSuccess === 'function') {
          onSuccess();
        }
        state.snapshot = snap;
        state.impact = computeImpactMirror(snap.current.pm25, state.household);
        state.plan = buildDeterministicPlanForState(state);
        state.planSource = 'fallback';
      }
      clearFieldInvalid(refs['city-input'], null);
      setStatus(snap?.stale ? String(dict.staleNotice) : '', false);
      renderTelemetrySection();
      renderSimulatorSection();
      renderPlanSection();
      renderCopilotSection();
      await syncServerPlan();
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      state.query = { ...lastValidQuery };
      if (err.status === 404 || err.code === 'CITY_NOT_FOUND') {
        setFieldInvalid(refs['city-input'], 'status-banner', null, '');
        setStatus(String(dict.cityNotFoundError), true);
        return;
      }
      setStatus(`${dict.errorPrefix}${err.message}`, true);
    }
  };

  async function sendChatPrompt(text) {
    const trimmed = String(text || '').trim().slice(0, 500);
    if (!trimmed) {
      return;
    }
    const historySlice = state.chatHistory.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const pendingList = [...state.chatHistory, { role: 'user', text: trimmed }];
    setCopilotLoading(refs, true, state.lang, doc);
    renderCopilotPanel(refs, pendingList, state.snapshot, state.lang, sendChatPrompt);

    try {
      const data = await postChatMessage({ message: trimmed, history: historySlice, lang: state.lang, context: buildPlanRequestPayload(state) });
      state.chatHistory.push({ role: 'user', text: trimmed });
      state.chatHistory.push({
        role: 'assistant',
        text: data.reply,
        meta: buildChatMeta(data, state.lang),
        safetyNotice: data.safetyNotice
      });
      setCopilotLoading(refs, false, state.lang, doc);
      renderCopilotSection();
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setCopilotLoading(refs, false, state.lang, doc);
      if (refs['copilot-status']) {
        refs['copilot-status'].textContent = `${getStrings(state.lang).copilotErrorPrefix}${err.message}`;
      }
      renderCopilotSection();
    }
  }

  const onSimulatorChange = (event) => {
    syncProfileOutdoorHours(doc, event.target, state.lang);
    state.household = readHouseholdFromDom(doc, state.household, state.lang);
    state.impact = computeImpactMirror(state.snapshot.current?.pm25 ?? 180, state.household);
    state.plan = buildDeterministicPlanForState(state);
    state.planSource = 'fallback';
    renderSimulatorSection();
    renderPlanSection();

    window.clearTimeout(liveAnnounceTimer);
    liveAnnounceTimer = window.setTimeout(() => {
      if (refs['simulator-live']) {
        const d = state.impact.dose;
        refs['simulator-live'].textContent = state.lang === 'hi'
          ? `दैनिक भार ${formatNumber(d.totalMitigatedUg, 'hi')} µg/दिन (${formatNumber(d.percentReduced, 'hi')}% कमी)`
          : `Updated dose ${formatNumber(d.totalMitigatedUg, 'en')} µg/day (${formatNumber(d.percentReduced, 'en')}% reduction)`;
      }
    }, 350);

    window.clearTimeout(planDebounceTimer);
    planDebounceTimer = window.setTimeout(syncServerPlan, 220);
  };

  bindTabs(doc, (tabId) => {
    state.activeTab = tabId;
  });
  bindSimulatorEvents(doc, onSimulatorChange);
  bindLocationHandlers(doc, refs, state, setStatus, refreshAqiAndPlan);
  bindCopilotDialog(doc, refs, sendChatPrompt);
  bindUtilityActions(doc, refs, state, (nextLang) => {
    state.lang = nextLang;
    saveLang(nextLang);
    clearTransientNotices(refs, state, setStatus);
    renderEverything();
    syncServerPlan();
  });

  renderEverything();
  const destroy = () => {
    destroyed = true;
    window.clearTimeout(planDebounceTimer);
    window.clearTimeout(liveAnnounceTimer);
  };
  return { state, refreshAll: refreshAqiAndPlan, syncPlan: syncServerPlan, destroy };
}

if (typeof window !== 'undefined' && !window.__VAYUMITRA_MANUAL_INIT__) {
  const start = () => {
    const app = initApp(document);
    app.syncPlan();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
