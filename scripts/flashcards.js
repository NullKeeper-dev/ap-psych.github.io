(function () {
  const FlashcardsPage = {
    init: function (context) {
      this.app = context.app;
      this.unitId = context.unitId;
      this.data = context.data;
      this.cards = Array.isArray(this.data.flashcards) ? this.data.flashcards : [];
      this.storageKey = "appsych-flashcards-unit" + this.unitId;
      this.state = this.loadState();

      this.cacheDom();
      this.bindEvents();
      this.render();
      this.setupMatchGame();
      this.renderTypeMode();
    },

    cacheDom: function () {
      this.totalNode = document.getElementById("flashcard-total");
      this.progressNode = document.getElementById("flashcard-progress");
      this.card = document.getElementById("flashcard-card");
      this.front = document.getElementById("flashcard-front");
      this.back = document.getElementById("flashcard-back");
      this.prevButton = document.getElementById("flashcard-prev");
      this.nextButton = document.getElementById("flashcard-next");
      this.flipButton = document.getElementById("flashcard-flip");
      this.confidenceButtons = Array.from(document.querySelectorAll("[data-confidence]"));
      this.matchGrid = document.getElementById("match-grid");
      this.matchStatus = document.getElementById("match-status");
      this.typeTerm = document.getElementById("type-term");
      this.typeInput = document.getElementById("type-answer-input");
      this.typeSubmit = document.getElementById("type-answer-submit");
      this.typeNext = document.getElementById("type-answer-next");
      this.typeFeedback = document.getElementById("type-answer-feedback");
    },

    bindEvents: function () {
      if (this.card) {
        this.card.addEventListener("click", this.toggleFlip.bind(this));
      }

      if (this.flipButton) {
        this.flipButton.addEventListener("click", this.toggleFlip.bind(this));
      }

      if (this.prevButton) {
        this.prevButton.addEventListener("click", this.previousCard.bind(this));
      }

      if (this.nextButton) {
        this.nextButton.addEventListener("click", this.nextCard.bind(this));
      }

      this.confidenceButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          this.rateCard(button.dataset.confidence);
        }.bind(this));
      }, this);

      if (this.matchGrid) {
        this.matchGrid.addEventListener("click", this.handleMatchClick.bind(this));
      }

      if (this.typeSubmit) {
        this.typeSubmit.addEventListener("click", this.checkTypedAnswer.bind(this));
      }

      if (this.typeNext) {
        this.typeNext.addEventListener("click", this.advanceTypedPrompt.bind(this));
      }

      document.addEventListener("keydown", this.handleKeyboard.bind(this));
    },

    loadState: function () {
      const fallback = {
        deckOrder: this.cards.map(function (_, index) { return index; }),
        studied: {},
        total: this.cards.length,
        currentIndex: 0,
        typeIndex: 0
      };

      const stored = this.app.getStorage(this.storageKey, fallback);
      if (!Array.isArray(stored.deckOrder) || stored.total !== this.cards.length || stored.deckOrder.length !== this.cards.length) {
        return fallback;
      }

      return {
        deckOrder: stored.deckOrder,
        studied: stored.studied || {},
        total: stored.total,
        currentIndex: Math.max(0, Math.min(stored.currentIndex || 0, Math.max(0, this.cards.length - 1))),
        typeIndex: Math.max(0, Math.min(stored.typeIndex || 0, Math.max(0, this.cards.length - 1)))
      };
    },

    persist: function () {
      this.app.setStorage(this.storageKey, {
        deckOrder: this.state.deckOrder,
        studied: this.state.studied,
        total: this.cards.length,
        currentIndex: this.state.currentIndex,
        typeIndex: this.state.typeIndex
      });
    },

    render: function () {
      if (this.totalNode) {
        this.totalNode.textContent = String(this.cards.length);
      }

      if (this.progressNode) {
        this.progressNode.textContent = Object.keys(this.state.studied).length + " / " + this.cards.length;
      }

      this.renderCurrentCard();
      this.updateControlState();
    },

    renderCurrentCard: function () {
      const card = this.getCurrentCard();
      if (!card) {
        if (this.front) {
          this.front.textContent = "No flashcards loaded yet.";
        }
        if (this.back) {
          this.back.textContent = "Add content JSON later to populate this study mode.";
        }
        return;
      }

      if (this.front) {
        this.front.textContent = card.term || "Untitled term";
      }

      if (this.back) {
        const detail = [card.definition || "Definition pending."];
        if (card.example) {
          detail.push("Example: " + card.example);
        }
        if (card.mnemonic) {
          detail.push("Mnemonic: " + card.mnemonic);
        }
        this.back.textContent = detail.join(" ");
      }

      if (this.card) {
        this.card.classList.remove("is-flipped");
      }
    },

    getCurrentCard: function () {
      if (!this.cards.length) {
        return null;
      }
      const orderIndex = this.state.deckOrder[this.state.currentIndex];
      return this.cards[orderIndex];
    },

    toggleFlip: function () {
      if (!this.cards.length || !this.card) {
        return;
      }
      this.card.classList.toggle("is-flipped");
    },

    nextCard: function () {
      if (!this.cards.length) {
        return;
      }
      this.state.currentIndex = (this.state.currentIndex + 1) % this.cards.length;
      this.renderCurrentCard();
      this.persist();
    },

    previousCard: function () {
      if (!this.cards.length) {
        return;
      }
      this.state.currentIndex = (this.state.currentIndex - 1 + this.cards.length) % this.cards.length;
      this.renderCurrentCard();
      this.persist();
    },

    rateCard: function (rating) {
      if (!this.cards.length) {
        return;
      }

      const currentDeckIndex = this.state.currentIndex;
      const cardId = this.state.deckOrder[currentDeckIndex];
      const offsets = { again: 1, hard: 2, good: 4, easy: 6 };
      const insertOffset = offsets[rating] || 3;

      this.state.studied[cardId] = rating;
      this.state.deckOrder.splice(currentDeckIndex, 1);
      const insertAt = Math.min(currentDeckIndex + insertOffset, this.state.deckOrder.length);
      this.state.deckOrder.splice(insertAt, 0, cardId);

      if (currentDeckIndex >= this.state.deckOrder.length) {
        this.state.currentIndex = 0;
      }

      this.persist();
      this.render();
      this.setupMatchGame();
      this.app.refreshHomeProgress();
    },

    updateControlState: function () {
      const disabled = !this.cards.length;
      [this.card, this.prevButton, this.nextButton, this.flipButton, this.typeSubmit, this.typeNext].forEach(function (node) {
        if (node) {
          node.disabled = disabled;
        }
      });

      this.confidenceButtons.forEach(function (button) {
        button.disabled = disabled;
      });
    },

    handleKeyboard: function (event) {
      const activeTag = document.activeElement ? document.activeElement.tagName : "";
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }

      if (!this.cards.length) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        this.toggleFlip();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.nextCard();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.previousCard();
      }
    },

    setupMatchGame: function () {
      if (!this.matchGrid || !this.matchStatus) {
        return;
      }

      this.matchState = {
        selected: [],
        matched: new Set()
      };

      this.matchGrid.innerHTML = "";

      const pairCount = Math.min(4, this.cards.length);
      if (!pairCount) {
        this.matchStatus.textContent = "Load at least one populated unit deck to start the match game.";
        return;
      }

      const pool = this.cards.slice(0, pairCount);
      const tiles = [];

      pool.forEach(function (card, index) {
        tiles.push({ pairId: index, type: "term", text: card.term || "Term pending" });
        tiles.push({ pairId: index, type: "definition", text: card.definition || "Definition pending" });
      });

      this.shuffle(tiles).forEach(function (tile, index) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "match-card";
        button.dataset.tileIndex = String(index);
        button.dataset.pairId = String(tile.pairId);
        button.dataset.tileType = tile.type;
        button.textContent = tile.text;
        this.matchGrid.appendChild(button);
      }, this);

      this.matchTiles = tiles;
      this.matchStatus.textContent = "Match " + pairCount + " term-definition pairs.";
    },

    handleMatchClick: function (event) {
      const tile = event.target.closest(".match-card");
      if (!tile || tile.classList.contains("is-matched")) {
        return;
      }

      if (this.matchState.selected.includes(tile)) {
        tile.classList.remove("is-selected");
        this.matchState.selected = this.matchState.selected.filter(function (node) {
          return node !== tile;
        });
        return;
      }

      if (this.matchState.selected.length === 2) {
        return;
      }

      tile.classList.add("is-selected");
      this.matchState.selected.push(tile);

      if (this.matchState.selected.length !== 2) {
        return;
      }

      const first = this.matchState.selected[0];
      const second = this.matchState.selected[1];
      const isMatch = first.dataset.pairId === second.dataset.pairId && first.dataset.tileType !== second.dataset.tileType;

      window.setTimeout(function () {
        if (isMatch) {
          first.classList.add("is-matched");
          second.classList.add("is-matched");
          this.matchState.matched.add(first.dataset.pairId);
        }

        first.classList.remove("is-selected");
        second.classList.remove("is-selected");
        this.matchState.selected = [];

        if (this.matchState.matched.size === Math.min(4, this.cards.length)) {
          this.matchStatus.textContent = "All matches found.";
        } else {
          this.matchStatus.textContent = "Matched " + this.matchState.matched.size + " / " + Math.min(4, this.cards.length) + " pairs.";
        }
      }.bind(this), 240);
    },

    renderTypeMode: function () {
      const card = this.cards[this.state.typeIndex];
      if (!card) {
        if (this.typeTerm) {
          this.typeTerm.textContent = "No prompt loaded.";
        }
        if (this.typeFeedback) {
          this.typeFeedback.textContent = "Type-answer mode will activate when flashcard data exists.";
        }
        return;
      }

      if (this.typeTerm) {
        this.typeTerm.textContent = card.term || "Untitled term";
      }

      if (this.typeInput) {
        this.typeInput.value = "";
      }

      if (this.typeFeedback) {
        this.typeFeedback.textContent = "";
      }
    },

    checkTypedAnswer: function () {
      const card = this.cards[this.state.typeIndex];
      if (!card || !this.typeInput || !this.typeFeedback) {
        return;
      }

      const userAnswer = this.typeInput.value.trim();
      if (!userAnswer) {
        this.typeFeedback.textContent = "Write an answer before checking it.";
        return;
      }

      const score = this.similarity(userAnswer, card.definition || "");
      if (score >= 0.72) {
        this.typeFeedback.textContent = "Strong match. Similarity: " + Math.round(score * 100) + "%.";
      } else if (score >= 0.45) {
        this.typeFeedback.textContent = "Partial match. Similarity: " + Math.round(score * 100) + "%. Review the expected definition and refine it.";
      } else {
        this.typeFeedback.textContent = "Low match. Similarity: " + Math.round(score * 100) + "%. Expected definition: " + (card.definition || "Definition pending.");
      }
    },

    advanceTypedPrompt: function () {
      if (!this.cards.length) {
        return;
      }
      this.state.typeIndex = (this.state.typeIndex + 1) % this.cards.length;
      this.persist();
      this.renderTypeMode();
    },

    similarity: function (a, b) {
      const left = this.normalize(a);
      const right = this.normalize(b);
      if (!left || !right) {
        return 0;
      }

      if (left === right) {
        return 1;
      }

      const leftTokens = new Set(left.split(" "));
      const rightTokens = new Set(right.split(" "));
      const sharedTokens = Array.from(leftTokens).filter(function (token) {
        return rightTokens.has(token);
      }).length;
      const tokenScore = (2 * sharedTokens) / (leftTokens.size + rightTokens.size);
      const diceScore = this.bigramDice(left, right);
      return (tokenScore + diceScore) / 2;
    },

    bigramDice: function (a, b) {
      const left = this.makeBigrams(a);
      const right = this.makeBigrams(b);
      if (!left.length || !right.length) {
        return 0;
      }

      const counts = {};
      left.forEach(function (pair) {
        counts[pair] = (counts[pair] || 0) + 1;
      });

      let matches = 0;
      right.forEach(function (pair) {
        if (counts[pair]) {
          counts[pair] -= 1;
          matches += 1;
        }
      });

      return (2 * matches) / (left.length + right.length);
    },

    makeBigrams: function (value) {
      const output = [];
      for (let index = 0; index < value.length - 1; index += 1) {
        output.push(value.slice(index, index + 2));
      }
      return output;
    },

    normalize: function (value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },

    shuffle: function (items) {
      const copy = items.slice();
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const temp = copy[index];
        copy[index] = copy[swapIndex];
        copy[swapIndex] = temp;
      }
      return copy;
    }
  };

  window.FlashcardsPage = FlashcardsPage;
})();
