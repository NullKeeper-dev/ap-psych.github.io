(function () {
  const units = [
    { id: 1, shortTitle: "Scientific Foundations", title: "Scientific Foundations of Psychology" },
    { id: 2, shortTitle: "Biological Bases", title: "Biological Bases of Behavior" },
    { id: 3, shortTitle: "Development & Learning", title: "Development and Learning" },
    { id: 4, shortTitle: "Learning", title: "Learning" },
    { id: 5, shortTitle: "Cognitive Psychology", title: "Cognitive Psychology" },
    { id: 6, shortTitle: "Developmental Psychology", title: "Developmental Psychology" },
    { id: 7, shortTitle: "Motivation, Emotion & Personality", title: "Motivation, Emotion, and Personality" },
    { id: 8, shortTitle: "Clinical Psychology", title: "Clinical Psychology" },
    { id: 9, shortTitle: "Social Psychology", title: "Social Psychology" }
  ];

  const studyModes = [
    { key: "notes", label: "Notes", description: "Structured long-form note view with TOC, highlights, and glossary." },
    { key: "flashcards", label: "Flashcards", description: "Flip cards, matching, and typed recall for the selected unit." },
    { key: "mcq", label: "MCQ Practice", description: "Configurable multiple-choice drills with review and timing." },
    { key: "frq", label: "FRQ Practice", description: "Prompt writing, rubric review, drafts, and self-check workflow." }
  ];

  const state = {
    page: "home",
    unitId: 1,
    unitData: null,
    theme: "dark",
    dataCache: new Map(),
    revealObserver: null,
    activeModal: null,
    lastFocusedElement: null
  };

  const APP = {
    units,
    studyModes,
    state,
    init,
    observeReveals,
    getUnitMeta,
    getStorage,
    setStorage,
    removeStorage,
    loadUnitData,
    loadLocalUnitData,
    createEmptyUnitData,
    buildPageUrl,
    getPath,
    showModal,
    hideModal,
    navigate,
    refreshHomeProgress: renderUnitGrid
  };

  window.APP = APP;

  document.addEventListener("DOMContentLoaded", function () {
    APP.init().catch(function (error) {
      console.error("AP Psychology app boot failed.", error);
    });
  });

  async function init() {
    const body = document.body;
    if (!body) {
      return;
    }

    state.page = body.dataset.page || "home";
    state.unitId = getUnitIdFromQuery();

    if (state.page === "home") {
      renderUnitGrid();
    } else {
      renderStudyNav();
    }

    updateCurrentYear();
    observeReveals(document);
    initTheme();
    initModals();
    initSearch();
    initModeToggles();

    if (state.page !== "home") {
      state.unitData = await loadUnitData(state.unitId);
      syncUnitBindings(state.unitId, state.unitData.title);
    }

    const context = {
      app: APP,
      page: state.page,
      unitId: state.unitId,
      unitMeta: getUnitMeta(state.unitId),
      data: state.unitData || createEmptyUnitData(state.unitId)
    };

    if (state.page === "notes" && window.NotesPage && typeof window.NotesPage.init === "function") {
      window.NotesPage.init(context);
    }

    if (state.page === "flashcards" && window.FlashcardsPage && typeof window.FlashcardsPage.init === "function") {
      window.FlashcardsPage.init(context);
    }

    if (state.page === "mcq" && window.MCQPage && typeof window.MCQPage.init === "function") {
      window.MCQPage.init(context);
    }

    if (state.page === "frq" && window.FRQPage && typeof window.FRQPage.init === "function") {
      window.FRQPage.init(context);
    }
  }

  function getUnitIdFromQuery() {
    const url = new URL(window.location.href);
    const raw = Number.parseInt(url.searchParams.get("unit"), 10);
    if (Number.isInteger(raw) && raw >= 1 && raw <= units.length) {
      return raw;
    }
    return 1;
  }

  function getUnitMeta(unitId) {
    return units.find(function (unit) {
      return unit.id === unitId;
    }) || units[0];
  }

  function updateCurrentYear() {
    const yearNode = document.getElementById("current-year");
    if (yearNode) {
      yearNode.textContent = String(new Date().getFullYear());
    }
  }

  function observeReveals(root) {
    const source = root || document;
    const revealNodes = source.querySelectorAll ? source.querySelectorAll(".reveal") : [];

    if (!state.revealObserver && "IntersectionObserver" in window) {
      state.revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            state.revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
    }

    revealNodes.forEach(function (node) {
      if (node.dataset.revealBound === "true") {
        return;
      }

      node.style.setProperty("--stagger", node.dataset.stagger || "0");
      node.dataset.revealBound = "true";

      if (state.revealObserver) {
        state.revealObserver.observe(node);
      } else {
        node.classList.add("is-visible");
      }
    });
  }

  function initTheme() {
    const savedTheme = getStorage("appsych-theme", "dark");
    setTheme(savedTheme, false);

    const toggleButtons = document.querySelectorAll("#theme-toggle");
    toggleButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setTheme(state.theme === "dark" ? "light" : "dark", true);
      });
    });
  }

  function setTheme(theme, persist) {
    state.theme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = state.theme;

    document.querySelectorAll("#theme-toggle").forEach(function (button) {
      const label = button.querySelector(".theme-toggle__label");
      button.setAttribute("aria-pressed", String(state.theme === "light"));
      if (label) {
        label.textContent = state.theme === "light" ? "Light" : "Dark";
      }
    });

    if (persist) {
      setStorage("appsych-theme", state.theme);
    }
  }

  function initModals() {
    document.addEventListener("click", function (event) {
      const openTrigger = event.target.closest("[data-modal-open]");
      const closeTrigger = event.target.closest("[data-modal-close]");
      const backdrop = event.target.classList.contains("modal-backdrop") ? event.target : null;

      if (openTrigger) {
        showModal(openTrigger.getAttribute("data-modal-open"));
      }

      if (closeTrigger) {
        hideModal();
      }

      if (backdrop) {
        hideModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.activeModal) {
        event.preventDefault();
        hideModal();
        return;
      }

      if (event.key === "Tab" && state.activeModal) {
        trapFocus(event);
      }
    });
  }

  function showModal(name) {
    const modal = document.querySelector('[data-modal="' + name + '"]');
    if (!modal) {
      return;
    }

    if (state.activeModal && state.activeModal !== modal) {
      hideModal(state.activeModal.getAttribute("data-modal"));
    }

    state.activeModal = modal;
    state.lastFocusedElement = document.activeElement;
    modal.hidden = false;
    modal.classList.remove("is-closing");

    requestAnimationFrame(function () {
      modal.classList.add("is-open");
      document.body.classList.add("modal-open");
      focusModal(modal);
    });
  }

  function hideModal(name) {
    const modal = name ? document.querySelector('[data-modal="' + name + '"]') : state.activeModal;
    if (!modal) {
      return;
    }

    modal.classList.remove("is-open");
    modal.classList.add("is-closing");
    state.activeModal = null;

    window.setTimeout(function () {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      if (!state.activeModal) {
        document.body.classList.remove("modal-open");
      }
      if (!state.activeModal && state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
        state.lastFocusedElement.focus();
      }
    }, 220);
  }

  function focusModal(modal) {
    const preferredInput = modal.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
    if (preferredInput) {
      preferredInput.focus();
      return;
    }

    const firstFocusable = getFocusableElements(modal)[0];
    if (firstFocusable) {
      firstFocusable.focus();
      return;
    }

    const panel = modal.querySelector(".modal-panel");
    if (panel) {
      panel.focus();
    }
  }

  function trapFocus(event) {
    const focusable = getFocusableElements(state.activeModal);
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getFocusableElements(root) {
    return Array.from(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (element) {
      return !element.hasAttribute("hidden");
    });
  }

  function initSearch() {
    const searchInput = document.getElementById("search-input");
    const resultsRoot = document.getElementById("search-results");

    if (!searchInput || !resultsRoot) {
      return;
    }

    searchInput.addEventListener("input", function () {
      renderSearchResults(searchInput.value);
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        const firstResult = resultsRoot.querySelector("button");
        if (firstResult) {
          firstResult.click();
        }
      }
    });

    renderSearchResults("");
  }

  function renderSearchResults(query) {
    const resultsRoot = document.getElementById("search-results");
    if (!resultsRoot) {
      return;
    }

    const normalizedQuery = String(query || "").trim().toLowerCase();
    const entries = [];

    units.forEach(function (unit) {
      studyModes.forEach(function (mode) {
        entries.push({
          unitId: unit.id,
          label: "Unit " + unit.id + " · " + mode.label,
          subtitle: unit.shortTitle,
          url: buildPageUrl(mode.key, unit.id)
        });
      });
    });

    const filtered = normalizedQuery
      ? entries.filter(function (entry) {
          return entry.label.toLowerCase().includes(normalizedQuery) || entry.subtitle.toLowerCase().includes(normalizedQuery);
        })
      : entries.slice(0, 12);

    resultsRoot.innerHTML = "";

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state neu-card";
      empty.textContent = "No units or study modes matched that search.";
      resultsRoot.appendChild(empty);
      return;
    }

    filtered.forEach(function (entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.setAttribute("aria-label", "Open " + entry.label);
      button.innerHTML = "<strong>" + escapeHtml(entry.label) + "</strong><span>" + escapeHtml(entry.subtitle) + "</span>";
      button.addEventListener("click", function () {
        navigate(entry.url);
      });
      resultsRoot.appendChild(button);
    });
  }

  function renderUnitGrid() {
    const grid = document.getElementById("unit-grid");
    if (!grid) {
      return;
    }

    grid.innerHTML = "";

    units.forEach(function (unit, index) {
      const progress = computeUnitProgress(unit.id);
      const button = document.createElement("button");
      const circumference = 2 * Math.PI * 20;
      const offset = circumference - circumference * progress;
      button.type = "button";
      button.className = "unit-card reveal";
      button.dataset.stagger = String(index + 2);
      button.setAttribute("aria-label", "Open study options for Unit " + unit.id);
      button.innerHTML =
        '<div class="unit-card__header">' +
          '<span class="unit-card__badge">U' + unit.id + "</span>" +
          '<div class="unit-card__ring">' +
            '<svg viewBox="0 0 52 52" aria-hidden="true">' +
              '<circle class="progress-ring__track" cx="26" cy="26" r="20"></circle>' +
              '<circle class="progress-ring__value" cx="26" cy="26" r="20" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"></circle>' +
            "</svg>" +
            '<span class="unit-card__percent">' + Math.round(progress * 100) + "%</span>" +
          "</div>" +
        "</div>" +
        '<div class="unit-card__title">' +
          "<strong>" + escapeHtml(unit.shortTitle) + "</strong>" +
          "<span>Unit " + unit.id + "</span>" +
        "</div>" +
        '<div class="unit-card__footer">' +
          '<span class="unit-card__meta">Open notes, flashcards, quizzes, and FRQs.</span>' +
        "</div>";

      button.addEventListener("click", function () {
        openUnitMenu(unit.id);
      });

      grid.appendChild(button);
    });

    observeReveals(grid);
  }

  function openUnitMenu(unitId) {
    const unit = getUnitMeta(unitId);
    const title = document.getElementById("unit-menu-title");
    const subtitle = document.getElementById("unit-menu-subtitle");
    const options = document.getElementById("unit-menu-options");

    if (!title || !subtitle || !options) {
      return;
    }

    title.textContent = "Unit " + unit.id + ": " + unit.shortTitle;
    subtitle.textContent = "Pick a study mode for " + unit.title + ".";
    options.innerHTML = "";

    studyModes.forEach(function (mode) {
      const link = document.createElement("a");
      link.className = "modal-option";
      link.href = buildPageUrl(mode.key, unit.id);
      link.setAttribute("aria-label", "Open " + mode.label + " for Unit " + unit.id);
      link.innerHTML = "<strong>" + escapeHtml(mode.label) + "</strong><span>" + escapeHtml(mode.description) + "</span>";
      options.appendChild(link);
    });

    showModal("unit-menu");
  }

  function renderStudyNav() {
    const nav = document.querySelector(".study-nav");
    if (!nav) {
      return;
    }

    nav.innerHTML = "";
    studyModes.forEach(function (mode) {
      const link = document.createElement("a");
      link.href = buildPageUrl(mode.key, state.unitId);
      link.textContent = mode.label;
      if (mode.key === state.page) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
      nav.appendChild(link);
    });
  }

  function initModeToggles() {
    document.querySelectorAll(".mode-toggle-strip").forEach(function (strip) {
      strip.addEventListener("click", function (event) {
        const button = event.target.closest(".mode-toggle");
        if (!button) {
          return;
        }

        const targetId = button.dataset.modeTarget;
        strip.querySelectorAll(".mode-toggle").forEach(function (toggle) {
          toggle.classList.toggle("is-active", toggle === button);
        });

        document.querySelectorAll(".mode-panel").forEach(function (panel) {
          panel.classList.toggle("is-active", panel.id === targetId);
        });
      });
    });
  }

  function syncUnitBindings(unitId, title) {
    const meta = getUnitMeta(unitId);
    document.querySelectorAll("[data-unit-number]").forEach(function (node) {
      node.textContent = String(unitId);
    });

    document.querySelectorAll("[data-unit-title]").forEach(function (node) {
      node.textContent = title || meta.title;
    });
  }

  function getPath(relativePath) {
    const root = document.body ? document.body.dataset.root || "." : ".";
    return root.replace(/\/$/, "") + "/" + relativePath.replace(/^\//, "");
  }

  function buildPageUrl(pageKey, unitId) {
    const pagesRoot = document.body ? document.body.dataset.pagesRoot || "." : ".";
    return pagesRoot.replace(/\/$/, "") + "/" + pageKey + ".html?unit=" + (unitId || state.unitId || 1);
  }

  async function loadUnitData(unitId) {
    if (state.dataCache.has(unitId)) {
      return state.dataCache.get(unitId);
    }

    const fallback = createEmptyUnitData(unitId);

    if (window.location.protocol === "file:") {
      try {
        const localData = await loadLocalUnitData(unitId);
        const normalizedLocalData = normalizeUnitData(localData, unitId);
        state.dataCache.set(unitId, normalizedLocalData);
        return normalizedLocalData;
      } catch (error) {
        console.warn("Falling back to empty unit schema for local file mode on unit", unitId, error);
        state.dataCache.set(unitId, fallback);
        return fallback;
      }
    }

    try {
      const response = await window.fetch(getPath("data/unit" + unitId + ".json"), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch unit JSON.");
      }

      const parsed = await response.json();
      const normalized = normalizeUnitData(parsed, unitId);
      state.dataCache.set(unitId, normalized);
      return normalized;
    } catch (error) {
      console.warn("Falling back to empty unit schema for unit", unitId, error);
      state.dataCache.set(unitId, fallback);
      return fallback;
    }
  }

  async function loadLocalUnitData(unitId) {
    const dataStore = window.__APP_UNIT_DATA__ || (window.__APP_UNIT_DATA__ = {});
    if (dataStore[unitId]) {
      return dataStore[unitId];
    }

    const scriptPath = getPath("data/unit" + unitId + ".js");
    await loadScript(scriptPath, "unit-" + unitId);
    return dataStore[unitId] || null;
  }

  function loadScript(src, key) {
    return new Promise(function (resolve, reject) {
      const selector = 'script[data-app-resource="' + key + '"]';
      const existing = document.querySelector(selector);

      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }

        existing.addEventListener("load", function () {
          resolve();
        }, { once: true });
        existing.addEventListener("error", function () {
          reject(new Error("Unable to load " + src));
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.appResource = key;
      script.addEventListener("load", function () {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("Unable to load " + src));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function normalizeUnitData(data, unitId) {
    const fallback = createEmptyUnitData(unitId);
    const parsed = data && typeof data === "object" ? data : {};
    return {
      unit: parsed.unit || fallback.unit,
      title: parsed.title || fallback.title,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      mcq: Array.isArray(parsed.mcq) ? parsed.mcq : [],
      frq: Array.isArray(parsed.frq) ? parsed.frq : []
    };
  }

  function createEmptyUnitData(unitId) {
    const unit = getUnitMeta(unitId);
    return {
      unit: unit.id,
      title: unit.title,
      notes: [],
      flashcards: [],
      mcq: [],
      frq: []
    };
  }

  function computeUnitProgress(unitId) {
    const flashState = getStorage("appsych-flashcards-unit" + unitId, {});
    const notesState = getStorage("appsych-notes-unit" + unitId, {});
    const quizHistory = getStorage("appsych-mcq-history-unit" + unitId, []);
    const frqDrafts = getStorage("appsych-frq-drafts-unit" + unitId, {});
    const metrics = [];

    if (flashState.total) {
      metrics.push(Math.min(1, Object.keys(flashState.studied || {}).length / flashState.total));
    }

    if (typeof notesState.scrollPercent === "number") {
      metrics.push(Math.max(0, Math.min(1, notesState.scrollPercent / 100)));
    }

    if (Array.isArray(quizHistory) && quizHistory.length) {
      const bestScore = quizHistory.reduce(function (best, entry) {
        return Math.max(best, Number(entry.score || 0));
      }, 0);
      metrics.push(bestScore / 100);
    }

    if (frqDrafts && Object.values(frqDrafts).some(function (draft) {
      return String(draft || "").trim().length > 0;
    })) {
      metrics.push(0.45);
    }

    if (!metrics.length) {
      return 0;
    }

    return metrics.reduce(function (sum, value) {
      return sum + value;
    }, 0) / metrics.length;
  }

  function getStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function setStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Unable to persist localStorage key", key, error);
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("Unable to remove localStorage key", key, error);
    }
  }

  function navigate(url) {
    window.location.href = url;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
