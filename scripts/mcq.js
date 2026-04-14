(function () {
  const MCQPage = {
    init: function (context) {
      this.app = context.app;
      this.unitId = context.unitId;
      this.data = context.data;
      this.questions = Array.isArray(this.data.mcq) ? this.data.mcq : [];
      this.historyKey = "appsych-mcq-history-unit" + this.unitId;
      this.history = this.app.getStorage(this.historyKey, []);
      this.state = {
        quizQuestions: [],
        answers: [],
        currentIndex: 0,
        timed: false,
        timeLeft: 45,
        timerId: null,
        answerLocked: false,
        missedPool: []
      };

      this.cacheDom();
      this.bindEvents();
      this.populateTopics();
      this.renderHistory();
      this.updateEmptyState();
    },

    cacheDom: function () {
      this.configPanel = document.getElementById("quiz-config");
      this.activePanel = document.getElementById("quiz-active");
      this.resultsPanel = document.getElementById("quiz-results");
      this.topicFilter = document.getElementById("topic-filter");
      this.timedMode = document.getElementById("timed-mode");
      this.startButton = document.getElementById("start-quiz");
      this.questionText = document.getElementById("question-text");
      this.answerChoices = document.getElementById("answer-choices");
      this.answerFeedback = document.getElementById("answer-feedback");
      this.progress = document.getElementById("quiz-progress");
      this.counter = document.getElementById("quiz-counter");
      this.timer = document.getElementById("quiz-timer");
      this.nextButton = document.getElementById("next-question");
      this.historyCount = document.getElementById("mcq-history-count");
      this.bestScore = document.getElementById("mcq-best-score");
      this.scoreGauge = document.getElementById("score-gauge-fill");
      this.scoreNode = document.getElementById("quiz-score");
      this.scoreDetail = document.getElementById("quiz-score-detail");
      this.resultsTopicCount = document.getElementById("results-topic-count");
      this.resultsMissedCount = document.getElementById("results-missed-count");
      this.topicBreakdown = document.getElementById("topic-breakdown");
      this.missedQuestions = document.getElementById("missed-questions");
      this.reviewMissed = document.getElementById("review-missed");
      this.restartQuiz = document.getElementById("restart-quiz");
    },

    bindEvents: function () {
      if (this.startButton) {
        this.startButton.addEventListener("click", this.startQuiz.bind(this));
      }

      if (this.answerChoices) {
        this.answerChoices.addEventListener("click", this.handleChoiceClick.bind(this));
      }

      if (this.nextButton) {
        this.nextButton.addEventListener("click", this.nextQuestion.bind(this));
      }

      if (this.reviewMissed) {
        this.reviewMissed.addEventListener("click", this.reviewMissedQuestions.bind(this));
      }

      if (this.restartQuiz) {
        this.restartQuiz.addEventListener("click", this.resetToConfig.bind(this));
      }
    },

    updateEmptyState: function () {
      if (!this.startButton) {
        return;
      }

      this.startButton.disabled = !this.questions.length;

      if (!this.questions.length && !this.configPanel.querySelector(".empty-state")) {
        this.configPanel.appendChild(this.createEmptyState("No multiple-choice items are available yet for this unit."));
      }
    },

    populateTopics: function () {
      if (!this.topicFilter) {
        return;
      }

      const topics = Array.from(new Set(this.questions.map(function (question) {
        return question.topic || "General";
      }))).sort();

      topics.forEach(function (topic) {
        const option = document.createElement("option");
        option.value = topic;
        option.textContent = topic;
        this.topicFilter.appendChild(option);
      }, this);
    },

    renderHistory: function () {
      if (this.historyCount) {
        this.historyCount.textContent = this.history.length + (this.history.length === 1 ? " quiz" : " quizzes");
      }

      if (this.bestScore) {
        const best = this.history.reduce(function (currentBest, entry) {
          return Math.max(currentBest, Number(entry.score || 0));
        }, 0);
        this.bestScore.textContent = best + "%";
      }
    },

    startQuiz: function (poolOverride) {
      const sourcePool = Array.isArray(poolOverride) ? poolOverride : this.filterQuestions();
      if (!sourcePool.length) {
        return;
      }

      const selectedCount = this.getSelectedCount();
      const count = selectedCount === "all" ? sourcePool.length : Math.min(Number(selectedCount), sourcePool.length);
      const shuffled = this.shuffle(sourcePool);

      this.state.quizQuestions = shuffled.slice(0, count);
      this.state.answers = [];
      this.state.currentIndex = 0;
      this.state.timed = !!(this.timedMode && this.timedMode.checked);
      this.state.answerLocked = false;
      this.state.missedPool = [];

      this.configPanel.hidden = true;
      this.resultsPanel.hidden = true;
      this.activePanel.hidden = false;

      this.renderQuestion();
    },

    filterQuestions: function () {
      const topic = this.topicFilter ? this.topicFilter.value : "all";
      return this.questions.filter(function (question) {
        return topic === "all" || (question.topic || "General") === topic;
      });
    },

    getSelectedCount: function () {
      const checked = document.querySelector('input[name="question-count"]:checked');
      return checked ? checked.value : "10";
    },

    renderQuestion: function () {
      this.clearTimer();

      const question = this.state.quizQuestions[this.state.currentIndex];
      if (!question) {
        this.finishQuiz();
        return;
      }

      this.state.answerLocked = false;
      this.answerFeedback.innerHTML = "";
      this.answerChoices.innerHTML = "";
      this.nextButton.hidden = true;

      this.questionText.textContent = question.question || "Question text pending.";
      this.counter.textContent = (this.state.currentIndex + 1) + " / " + this.state.quizQuestions.length;
      this.progress.style.width = ((this.state.currentIndex / this.state.quizQuestions.length) * 100).toFixed(2) + "%";

      this.getChoiceEntries(question).forEach(function (choice, index) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-choice";
        button.dataset.choiceIndex = String(index);
        button.setAttribute("aria-label", "Select answer " + choice.key);
        button.innerHTML = '<span class="answer-choice__prefix">' + choice.key + '</span><span class="answer-choice__text">' + choice.text + "</span>";
        this.answerChoices.appendChild(button);
      }, this);

      if (this.state.timed) {
        this.state.timeLeft = 45;
        this.updateTimer();
        this.state.timerId = window.setInterval(function () {
          this.state.timeLeft -= 1;
          this.updateTimer();
          if (this.state.timeLeft <= 0) {
            this.revealAnswer(null, true);
          }
        }.bind(this), 1000);
      } else {
        this.timer.textContent = "Timer Off";
      }
    },

    handleChoiceClick: function (event) {
      const button = event.target.closest(".answer-choice");
      if (!button || this.state.answerLocked) {
        return;
      }

      this.revealAnswer(Number(button.dataset.choiceIndex), false);
    },

    revealAnswer: function (choiceIndex, timedOut) {
      if (this.state.answerLocked) {
        return;
      }

      this.state.answerLocked = true;
      this.clearTimer();

      const question = this.state.quizQuestions[this.state.currentIndex];
      const correctIndex = this.getCorrectIndex(question);
      const buttons = Array.from(this.answerChoices.querySelectorAll(".answer-choice"));
      const isCorrect = choiceIndex === correctIndex;

      buttons.forEach(function (button, index) {
        if (index === correctIndex) {
          button.classList.add("is-correct");
        } else if (index === choiceIndex && !isCorrect) {
          button.classList.add("is-incorrect");
        } else {
          button.classList.add("is-muted");
        }
      });

      if (!isCorrect) {
        this.state.missedPool.push(question);
      }

      this.state.answers.push({
        correct: isCorrect,
        choiceIndex: choiceIndex,
        correctIndex: correctIndex,
        question: question
      });

      const feedback = document.createElement("div");
      feedback.className = "answer-feedback__panel" + (isCorrect ? " is-correct" : " is-incorrect");
      const title = document.createElement("strong");
      const detail = document.createElement("p");
      title.textContent = timedOut ? "Time expired." : (isCorrect ? "Correct." : "Incorrect.");
      detail.textContent = question.explanation || "Explanation will populate here when quiz data exists.";
      feedback.appendChild(title);
      feedback.appendChild(detail);
      this.answerFeedback.appendChild(feedback);

      this.nextButton.hidden = false;
      if (this.state.currentIndex === this.state.quizQuestions.length - 1) {
        this.nextButton.textContent = "See Results";
      } else {
        this.nextButton.textContent = "Next Question";
      }
    },

    nextQuestion: function () {
      this.state.currentIndex += 1;
      if (this.state.currentIndex >= this.state.quizQuestions.length) {
        this.finishQuiz();
        return;
      }
      this.renderQuestion();
    },

    finishQuiz: function () {
      this.clearTimer();
      this.activePanel.hidden = true;
      this.resultsPanel.hidden = false;
      this.progress.style.width = "100%";

      const total = this.state.answers.length;
      const correct = this.state.answers.filter(function (entry) {
        return entry.correct;
      }).length;
      const score = total ? Math.round((correct / total) * 100) : 0;

      this.history.unshift({
        date: new Date().toISOString(),
        score: score,
        total: total
      });
      this.history = this.history.slice(0, 20);
      this.app.setStorage(this.historyKey, this.history);
      this.renderHistory();
      this.app.refreshHomeProgress();

      this.scoreNode.textContent = score + "%";
      this.scoreDetail.textContent = correct + " / " + total + " correct";
      this.resultsTopicCount.textContent = String(this.buildTopicBreakdown().length) + " topics";
      this.resultsMissedCount.textContent = String(this.state.missedPool.length) + " questions";
      this.reviewMissed.disabled = !this.state.missedPool.length;

      this.renderGauge(score);
      this.renderTopicBreakdown();
      this.renderMissedQuestions();
    },

    renderGauge: function (score) {
      const circumference = 2 * Math.PI * 48;
      const offset = circumference - circumference * (score / 100);
      this.scoreGauge.setAttribute("stroke-dasharray", circumference.toFixed(2));
      this.scoreGauge.setAttribute("stroke-dashoffset", offset.toFixed(2));
    },

    renderTopicBreakdown: function () {
      this.topicBreakdown.innerHTML = "";
      const breakdown = this.buildTopicBreakdown();

      if (!breakdown.length) {
        this.topicBreakdown.appendChild(this.createEmptyState("Topic breakdown appears after a completed quiz."));
        return;
      }

      breakdown.forEach(function (topic) {
        const item = document.createElement("div");
        item.className = "breakdown-item";
        item.innerHTML = "<strong>" + topic.topic + "</strong><span>" + topic.correct + " / " + topic.total + " correct</span>";
        this.topicBreakdown.appendChild(item);
      }, this);
    },

    buildTopicBreakdown: function () {
      const map = new Map();
      this.state.answers.forEach(function (entry) {
        const topic = entry.question.topic || "General";
        if (!map.has(topic)) {
          map.set(topic, { topic: topic, correct: 0, total: 0 });
        }
        const row = map.get(topic);
        row.total += 1;
        if (entry.correct) {
          row.correct += 1;
        }
      });
      return Array.from(map.values());
    },

    renderMissedQuestions: function () {
      this.missedQuestions.innerHTML = "";
      if (!this.state.missedPool.length) {
        this.missedQuestions.appendChild(this.createEmptyState("No missed questions. This list stays ready for review mode."));
        return;
      }

      this.state.missedPool.forEach(function (question) {
        const item = document.createElement("div");
        item.className = "missed-item";
        const title = document.createElement("strong");
        const detail = document.createElement("p");
        title.textContent = question.question || "Question pending.";
        detail.textContent = question.explanation || "Explanation will populate here when quiz data exists.";
        item.appendChild(title);
        item.appendChild(detail);
        this.missedQuestions.appendChild(item);
      }, this);
    },

    reviewMissedQuestions: function () {
      if (!this.state.missedPool.length) {
        return;
      }
      this.startQuiz(this.state.missedPool);
    },

    resetToConfig: function () {
      this.clearTimer();
      this.activePanel.hidden = true;
      this.resultsPanel.hidden = true;
      this.configPanel.hidden = false;
      this.nextButton.hidden = true;
    },

    getCorrectIndex: function (question) {
      const entries = this.getChoiceEntries(question);

      if (typeof question.answer === "number") {
        return question.answer;
      }

      if (typeof question.answer === "string") {
        const normalized = question.answer.trim().toUpperCase();
        const matchingLetterIndex = entries.findIndex(function (entry) {
          return entry.key === normalized;
        });
        if (matchingLetterIndex >= 0) {
          return matchingLetterIndex;
        }

        const matchingIndex = entries.findIndex(function (choice) {
          return this.normalize(choice.text) === this.normalize(question.answer);
        }.bind(this));

        if (matchingIndex >= 0) {
          return matchingIndex;
        }
      }

      return 0;
    },

    getChoiceEntries: function (question) {
      const choices = question ? question.choices : null;
      if (Array.isArray(choices)) {
        return choices.map(function (choice, index) {
          return {
            key: String.fromCharCode(65 + index),
            text: this.getChoiceText(choice)
          };
        }, this);
      }

      if (choices && typeof choices === "object") {
        return Object.keys(choices).sort().map(function (key) {
          return {
            key: key,
            text: this.getChoiceText(choices[key])
          };
        }, this);
      }

      return [];
    },

    getChoiceText: function (choice) {
      return typeof choice === "string" ? choice : (choice && (choice.text || choice.label)) || "Choice pending";
    },

    updateTimer: function () {
      this.timer.textContent = this.state.timeLeft + "s";
    },

    clearTimer: function () {
      if (this.state.timerId) {
        window.clearInterval(this.state.timerId);
        this.state.timerId = null;
      }
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
    },

    createEmptyState: function (message) {
      const panel = document.createElement("div");
      panel.className = "empty-state neu-card";
      panel.textContent = message;
      return panel;
    }
  };

  window.MCQPage = MCQPage;
})();
