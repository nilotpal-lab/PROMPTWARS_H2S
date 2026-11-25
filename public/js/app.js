/**
 * @fileoverview VayuMitra frontend orchestration: 0ms deterministic simulator updates,
 * AbortController API sync, APG roving-tabindex tabs, native <dialog> copilot,
 * bilingual i18n toggle, .ics download, and WhatsApp brief copy.
 */

import { applyStaticI18n, getStrings } from './i18n.js';
import {
  PROFILE_PARAMS,
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

function readNumField(doc, id, fallback) {
  const val = Number(doc.getElementById(id)?.value);
  return Number.isFinite(val) ? val : fallback;
}

function readDomToggles(doc) {
  return {
    noExhaustTadka: Boolean(doc.getElementById('toggle-tadka')?.checked),
    indoorIncenseOrCoil: Boolean(doc.getElementById('toggle-incense')?.checked),
    dryJhaduSweeping: Boolean(doc.getElementById('toggle-jhadu')?.checked),
    sealed24hNoFlush: Boolean(doc.getElementById('toggle-sealed')?.checked)
  };
}

function readHouseholdFromDom(doc, currentHousehold) {
  const checkedProfiles = Array.from(doc.querySelectorAll('input[name="profiles"]:checked')).map((el) => el.value);
  const profiles = checkedProfiles.length > 0 ? checkedProfiles : ['commuter'];
  const profile = doc.getElementById('profile-select')?.value || profiles[0];
  const communityActions = Array.from(doc.querySelectorAll('input[name="communityActions"]:checked')).map((el) => el.value);

  return {
    ...currentHousehold,
    profile,
    profiles,
    maskType: doc.getElementById('mask-select')?.value || 'n95',
    purifierMode: doc.getElementById('purifier-select')?.value || 'none',
    roomVolumeM3: readNumField(doc, 'room-volume-range', 36),
    outdoorHours: readNumField(doc, 'outdoor-hours-range', 2.5),
    commuteFrom: doc.getElementById('commute-from-select')?.value || 'petrol_car',
    commuteTo: doc.getElementById('commute-to-select')?.value || 'metro_bus',
    dailyKm: readNumField(doc, 'daily-km-input', 16),
    commuteDaysPerWeek: readNumField(doc, 'commute-days-input', 5),
    communityActions,
    ...readDomToggles(doc)
  };
}

function syncProfileOutdoorHours(doc, target) {
  const range = doc.getElementById('outdoor-hours-range');
  const select = doc.getElementById('profile-select');
  if (!range || !select) {
    return;
  }
  if (target?.name === 'profiles') {
    const checked = Array.from(doc.querySelectorAll('input[name="profiles"]:checked')).map((el) => el.value);
    if (checked.length > 0 && !checked.includes(select.value)) {
      select.value = checked[0];
      range.value = String(PROFILE_PARAMS[checked[0]]?.defaultOutdoorHours ?? range.value);
    }
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

function bindLocationHandlers(doc, refs, state, refreshAqiAndPlan) {
  doc.getElementById('city-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const cityVal = doc.getElementById('city-input')?.value.trim() || '';
    if (!cityVal) {
      return;
    }
    state.query.city = cityVal;
    state.query.preset = '';
    refreshAqiAndPlan();
  });

  for (const btn of doc.querySelectorAll('[data-preset]')) {
    btn.addEventListener('click', () => {
      state.query.preset = btn.getAttribute('data-preset') || 'delhi-severe';
      state.query.city = '';
      const cityInput = doc.getElementById('city-input');
      if (cityInput) {
        cityInput.value = '';
      }
      refreshAqiAndPlan();
    });
  }

  doc.getElementById('calibration-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = Number(refs['calibrated-aqi-input']?.value);
    if (!Number.isFinite(raw) || raw < 1 || raw > 999) {
      return;
    }
    state.query.calibratedAqi = Math.round(raw);
    if (refs['clear-calibration-btn']) {
      refs['clear-calibration-btn'].hidden = false;
    }
    refreshAqiAndPlan();
  });

  refs['clear-calibration-btn']?.addEventListener('click', () => {
    state.query.calibratedAqi = null;
    if (refs['calibrated-aqi-input']) {
      refs['calibrated-aqi-input'].value = '';
    }
    refs['clear-calibration-btn'].hidden = true;
    refreshAqiAndPlan();
  });
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
    if (!wrap) {
      return;
    }
    const next = refs['toggle-table-btn'].getAttribute('aria-expanded') !== 'true';
    wrap.hidden = !next;
    refs['toggle-table-btn'].setAttribute('aria-expanded', String(next));
    const dict = getStrings(state.lang);
    refs['toggle-table-btn'].textContent = String(next ? dict.hideTableBtn : dict.showTableBtn);
  });

  doc.getElementById('download-ics-btn')?.addEventListener('click', () => {
    const ics = buildIcsContent(state.snapshot, state.lang);
    triggerFileDownload(`vayumitra-${getTodayIstKey()}.ics`, ics, 'text/calendar;charset=utf-8');
  });

  doc.getElementById('copy-whatsapp-btn')?.addEventListener('click', () => copyWhatsappBrief(refs, state.lang));
  doc.getElementById('print-sheet-btn')?.addEventListener('click', () => window.print());
}

/**
 * Initialize VayuMitra application controllers and listeners on the provided Document.
 * @param {Document} [doc]
 * @returns {{ state: Record<string, unknown>, refreshAll: () => Promise<void> }}
 */
export function initApp(doc = document) {
  const state = createInitialState();
  const refs = collectDomRefs(doc);
  let planDebounceTimer = null;
  let liveAnnounceTimer = null;

  const setStatus = (msg) => {
    if (refs['status-banner']) {
      refs['status-banner'].textContent = msg;
    }
  };

  const toggleChecklist = (anchorId, checked) => {
    state.checklist[anchorId] = checked;
    saveChecklist(getTodayIstKey(), state.checklist);
  };

  const renderEverything = () => {
    applyStaticI18n(doc, state.lang);
    syncPressedButtons(doc, '.lang-btn', 'data-lang', state.lang);
    syncPressedButtons(doc, '[data-preset]', 'data-preset', state.query.city ? '' : state.query.preset);
    updateSelectedCheckboxStyles(doc);
    renderLocationAndTelemetry(refs, state.snapshot, state.lang);
    renderSimulatorReadout(refs, state.impact, state.household, state.snapshot, state.lang);
    renderPlanSections(refs, state, toggleChecklist);
    renderCopilotPanel(refs, state.chatHistory, state.snapshot, state.lang, sendChatPrompt);
  };

  const syncServerPlan = async () => {
    try {
      const res = await fetchActionPlan(buildPlanRequestPayload(state));
      state.snapshot = res?.snapshot || state.snapshot;
      state.impact = res?.impact || state.impact;
      if (res?.plan) {
        state.plan = res.plan;
        state.planSource = res.source === 'gemini' ? 'gemini' : 'fallback';
      }
      renderEverything();
    } catch (err) {
      if (!isAbortError(err)) {
        state.planSource = 'fallback';
      }
    }
  };

  const refreshAqiAndPlan = async () => {
    const dict = getStrings(state.lang);
    setStatus(String(dict.loadingStatus));
    try {
      const snap = await fetchAqiSnapshot({ ...state.query, lang: state.lang });
      if (snap?.current) {
        state.snapshot = snap;
        state.impact = computeImpactMirror(snap.current.pm25, state.household);
      }
      setStatus(snap?.stale ? String(dict.staleNotice) : '');
      renderEverything();
      await syncServerPlan();
    } catch (err) {
      if (!isAbortError(err)) {
        setStatus(`${dict.errorPrefix}${err.message}`);
      }
    }
  };

  async function sendChatPrompt(text) {
    const trimmed = String(text || '').trim().slice(0, 500);
    if (!trimmed) {
      return;
    }
    state.chatHistory.push({ role: 'user', text: trimmed });
    renderCopilotPanel(refs, state.chatHistory, state.snapshot, state.lang, sendChatPrompt);

    const historySlice = state.chatHistory.slice(-7, -1).map((m) => ({ role: m.role, text: m.text }));
    try {
      const data = await postChatMessage({ message: trimmed, history: historySlice, lang: state.lang, context: buildPlanRequestPayload(state) });
      const meta = data.citedMetrics ? `NAQI ${data.citedMetrics.naqi} · ${data.citedMetrics.ventilationWindow} · ${data.source}` : String(data.source || 'fallback');
      state.chatHistory.push({ role: 'assistant', text: data.reply, meta });
    } catch (err) {
      if (!isAbortError(err)) {
        state.chatHistory.push({ role: 'assistant', text: `${getStrings(state.lang).errorPrefix}${err.message}` });
      }
    }
    renderCopilotPanel(refs, state.chatHistory, state.snapshot, state.lang, sendChatPrompt);
  }

  const onSimulatorInput = (event) => {
    syncProfileOutdoorHours(doc, event.target);
    state.household = readHouseholdFromDom(doc, state.household);
    state.impact = computeImpactMirror(state.snapshot.current?.pm25 ?? 180, state.household);
    updateSelectedCheckboxStyles(doc);
    renderSimulatorReadout(refs, state.impact, state.household, state.snapshot, state.lang);
    renderPlanSections(refs, state, toggleChecklist);

    window.clearTimeout(liveAnnounceTimer);
    liveAnnounceTimer = window.setTimeout(() => {
      if (refs['simulator-live']) {
        const d = state.impact.dose;
        refs['simulator-live'].textContent = `${d.totalMitigatedUg} µg/day (${d.percentReduced}% reduced)`;
      }
    }, 350);

    window.clearTimeout(planDebounceTimer);
    planDebounceTimer = window.setTimeout(syncServerPlan, 220);
  };

  bindTabs(doc, (tabId) => {
    state.activeTab = tabId;
  });
  doc.getElementById('simulator-form')?.addEventListener('input', onSimulatorInput);
  doc.getElementById('simulator-form')?.addEventListener('change', onSimulatorInput);
  bindLocationHandlers(doc, refs, state, refreshAqiAndPlan);
  bindCopilotDialog(doc, refs, sendChatPrompt);
  bindUtilityActions(doc, refs, state, (nextLang) => {
    state.lang = nextLang;
    saveLang(nextLang);
    renderEverything();
    syncServerPlan();
  });

  renderEverything();
  return { state, refreshAll: refreshAqiAndPlan };
}

if (typeof window !== 'undefined' && !window.__VAYUMITRA_MANUAL_INIT__) {
  const start = () => {
    const app = initApp(document);
    app.refreshAll();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
