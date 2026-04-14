(function () {
  const FRQPage = {
    init: function (context) {
      this.app = context.app;
      this.unitId = context.unitId;
      this.data = context.data;
      this.prompts = Array.isArray(this.data.frq) ? this.data.frq : [];
      this.storageKey = "appsych-frq-drafts-unit" + this.unitId;
      this.state = this.app.getStorage(this.storageKey, { currentIndex: 0, drafts: {} });
      this.state.currentIndex = Math.max(0, Math.min(this.state.currentIndex || 0, Math.max(0, this.prompts.length - 1)));

      this.cacheDom();
      this.bindEvents();
      this.render();
    },

    cacheDom: function () {
      this.promptTitle = document.getElementById("frq-prompt-title");
      this.promptText = document.getElementById("frq-prompt");
      this.points = document.getElementById("frq-points");
      this.response = document.getElementById("frq-response");
      this.wordCount = document.getElementById("frq-word-count");
      this.submit = document.getElementById("submit-frq");
      this.clear = document.getElementById("clear-frq");
      this.selfCheck = document.getElementById("frq-self-check");
      this.rubricList = document.getElementById("rubric-list");
      this.rubricToggle = document.getElementById("rubric-toggle");
      this.count = document.getElementById("frq-count");
      this.draftState = document.getElementById("frq-draft-state");
    },

    bindEvents: function () {
      if (this.response) {
        this.response.addEventListener("input", this.handleInput.bind(this));
      }

      if (this.submit) {
        this.submit.addEventListener("click", this.handleSubmit.bind(this));
      }

      if (this.clear) {
        this.clear.addEventListener("click", this.clearDraft.bind(this));
      }

      if (this.rubricToggle) {
        this.rubricToggle.addEventListener("click", this.toggleRubric.bind(this));
      }
    },

    render: function () {
      if (this.count) {
        this.count.textContent = String(this.prompts.length);
      }

      this.renderDraftMeta();

      const prompt = this.prompts[this.state.currentIndex];
      if (!prompt) {
        this.renderEmpty();
        return;
      }

      this.promptTitle.textContent = "FRQ Prompt";
      if (prompt.concept) {
        this.promptTitle.textContent = prompt.concept;
      }
      this.promptText.textContent = this.formatPromptText(prompt);
      this.points.textContent = String(prompt.points || 0) + " points";
      this.response.disabled = false;
      this.submit.disabled = false;
      this.clear.disabled = false;
      this.response.value = this.state.drafts[this.state.currentIndex] || "";
      this.updateWordCount();
      this.renderRubric(prompt.rubric || []);
      this.selfCheck.hidden = true;
      this.selfCheck.innerHTML = "";
    },

    renderEmpty: function () {
      this.promptText.textContent = "Prompt content will populate here when FRQ JSON data is available.";
      this.points.textContent = "0 points";
      this.response.value = "";
      this.response.disabled = true;
      this.submit.disabled = true;
      this.clear.disabled = true;
      this.rubricList.innerHTML = "";
      this.rubricList.appendChild(this.createEmptyState("No FRQ prompts are available yet for this unit."));
      this.updateWordCount();
    },

    renderRubric: function (rubric) {
      this.rubricList.innerHTML = "";

      if (!rubric.length) {
        this.rubricList.appendChild(this.createEmptyState("Rubric points will appear here when FRQ data exists."));
        return;
      }

      rubric.forEach(function (item) {
        const row = document.createElement("div");
        row.className = "rubric-item";
        const title = document.createElement("strong");
        const detail = document.createElement("span");
        const label = [item.part, item.criterion].filter(Boolean).join(" - ");
        title.textContent = (label || "Criterion") + " (" + (item.points || 0) + " pt)";
        detail.textContent = item.description || item.sample_answer || "";
        row.appendChild(title);
        row.appendChild(detail);

        if (item.sample_answer) {
          const sample = document.createElement("p");
          sample.textContent = "Sample: " + item.sample_answer;
          row.appendChild(sample);
        }

        this.rubricList.appendChild(row);
      }, this);
    },

    handleInput: function () {
      this.updateWordCount();
      this.state.drafts[this.state.currentIndex] = this.response.value;
      this.persist();
      this.renderDraftMeta();
    },

    updateWordCount: function () {
      const count = this.response.value.trim() ? this.response.value.trim().split(/\s+/).length : 0;
      this.wordCount.textContent = count + (count === 1 ? " word" : " words");
    },

    handleSubmit: function () {
      const prompt = this.prompts[this.state.currentIndex];
      if (!prompt) {
        return;
      }

      this.selfCheck.hidden = false;
      this.selfCheck.innerHTML = "";

      const title = document.createElement("strong");
      title.textContent = "Self-Check Rubric";
      this.selfCheck.appendChild(title);

      if (!Array.isArray(prompt.rubric) || !prompt.rubric.length) {
        const message = document.createElement("span");
        message.textContent = "Rubric checklist will populate when rubric items exist.";
        this.selfCheck.appendChild(message);
        return;
      }

      prompt.rubric.forEach(function (item, index) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        const text = document.createElement("span");
        checkbox.type = "checkbox";
        checkbox.name = "rubric-check-" + index;
        text.textContent = (item.criterion || "Criterion") + ": " + (item.description || "");
        label.appendChild(checkbox);
        label.appendChild(text);
        this.selfCheck.appendChild(label);
      }, this);
    },

    clearDraft: function () {
      this.response.value = "";
      this.state.drafts[this.state.currentIndex] = "";
      this.selfCheck.hidden = true;
      this.selfCheck.innerHTML = "";
      this.updateWordCount();
      this.persist();
      this.renderDraftMeta();
    },

    toggleRubric: function () {
      const hidden = this.rubricList.hasAttribute("hidden");
      if (hidden) {
        this.rubricList.removeAttribute("hidden");
        this.rubricToggle.textContent = "Collapse";
      } else {
        this.rubricList.setAttribute("hidden", "");
        this.rubricToggle.textContent = "Expand";
      }
    },

    renderDraftMeta: function () {
      if (!this.draftState) {
        return;
      }

      const count = Object.values(this.state.drafts || {}).filter(function (draft) {
        return String(draft || "").trim().length > 0;
      }).length;

      this.draftState.textContent = String(count);
    },

    persist: function () {
      this.app.setStorage(this.storageKey, {
        currentIndex: this.state.currentIndex,
        drafts: this.state.drafts
      });
      this.app.refreshHomeProgress();
    },

    formatPromptText: function (prompt) {
      const parts = [];
      if (prompt.scenario) {
        parts.push(prompt.scenario);
      }
      if (prompt.prompt) {
        parts.push(prompt.prompt);
      }
      return parts.join("\n\n") || "Prompt text pending.";
    },

    createEmptyState: function (message) {
      const panel = document.createElement("div");
      panel.className = "empty-state neu-card";
      panel.textContent = message;
      return panel;
    }
  };

  window.FRQPage = FRQPage;
})();
