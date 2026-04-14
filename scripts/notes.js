(function () {
  const BASE_PATH = "";

  const CALLOUT_VARIANTS = {
    key_concept: { icon: "🔑", className: "callout-key-concept" },
    tip: { icon: "💡", className: "callout-tip" },
    warning: { icon: "⚠️", className: "callout-warning" },
    memory_hook: { icon: "🧠", className: "callout-memory-hook" },
    exam_tip: { icon: "📝", className: "callout-exam-tip" }
  };

  const NotesPage = {
    init: function (context) {
      this.app = context.app;
      this.unitId = context.unitId;
      this.data = context.data;
      this.storageKey = "appsych-notes-unit" + this.unitId;
      this.state = this.app.getStorage(this.storageKey, { highlights: [], scrollPercent: 0 });
      this.highlightIds = new Set(this.state.highlights || []);
      this.highlightMode = false;
      this.flashcardMap = this.buildFlashcardMap(this.data.flashcards || []);
      this.activeHeadingId = null;
      this.headingObserver = null;
      this.termObserver = null;
      this.visibleTermEntries = new Map();
      this.mobileSidebarQuery = window.matchMedia ? window.matchMedia("(max-width: 767px)") : null;
      this.isMobileSidebar = null;

      this.cacheDom();
      this.bindEvents();
      this.syncResponsiveSidebar(true);
      this.renderNotes();
      this.updateReadingProgress();
    },

    cacheDom: function () {
      this.content = document.getElementById("notes-content");
      this.toc = document.getElementById("toc-list");
      this.glossary = document.getElementById("glossary-list");
      this.progress = document.getElementById("reading-progress");
      this.highlightToggle = document.getElementById("highlight-toggle");
      this.tocToggle = document.getElementById("toc-toggle");
    },

    bindEvents: function () {
      if (this.highlightToggle) {
        this.highlightToggle.addEventListener("click", this.toggleHighlightMode.bind(this));
      }

      if (this.tocToggle) {
        this.tocToggle.addEventListener("click", function () {
          document.body.classList.toggle("notes-sidebar-collapsed");
        });
      }

      if (this.content) {
        this.content.addEventListener("click", this.handleHighlightClick.bind(this));
      }

      if (this.toc) {
        this.toc.addEventListener("click", this.handleTocClick.bind(this));
      }

      window.addEventListener("scroll", this.updateReadingProgress.bind(this), { passive: true });
      window.addEventListener("scroll", this.updateActiveHeading.bind(this), { passive: true });
      window.addEventListener("resize", this.updateActiveHeading.bind(this));

      if (this.mobileSidebarQuery && typeof this.mobileSidebarQuery.addEventListener === "function") {
        this.mobileSidebarQuery.addEventListener("change", this.syncResponsiveSidebar.bind(this));
      } else {
        window.addEventListener("resize", this.syncResponsiveSidebar.bind(this));
      }
    },

    renderNotes: function () {
      if (!this.content) {
        return;
      }

      this.content.innerHTML = "";
      this.visibleTermEntries.clear();

      if (this.headingObserver) {
        this.headingObserver.disconnect();
      }

      if (this.termObserver) {
        this.termObserver.disconnect();
      }

      if (!Array.isArray(this.data.notes) || !this.data.notes.length) {
        this.content.appendChild(this.createEmptyState("No notes JSON has been generated for this unit yet."));
        this.renderToc();
        this.renderVisibleTerms();
        return;
      }

      const sectionTree = this.buildSectionTree(this.data.notes);
      const renderSections = sectionTree.map(function (node) {
        return this.transformModuleNode(node);
      }, this).filter(Boolean);

      renderSections.forEach(function (section, index) {
        this.content.appendChild(this.renderStudySection(section, index));
      }, this);

      this.restoreHighlights();
      this.renderToc();
      this.observeHeadings();
      this.observeVisibleTerms();
      this.renderVisibleTerms();
      this.app.observeReveals(this.content);
    },

    buildSectionTree: function (sections) {
      const root = { level: 0, children: [] };
      const stack = [root];

      sections.forEach(function (section) {
        const node = {
          id: section.id,
          heading: section.heading,
          level: Number(section.level) || 1,
          content: Array.isArray(section.content) ? section.content : [],
          children: []
        };

        while (stack.length > 1 && node.level <= stack[stack.length - 1].level) {
          stack.pop();
        }

        stack[stack.length - 1].children.push(node);
        stack.push(node);
      });

      return root.children;
    },

    transformModuleNode: function (node) {
      const headerBlock = this.findSectionHeaderBlock(node);
      const section = {
        id: node.id,
        heading: this.formatDisplayHeading((headerBlock && headerBlock.heading) || node.heading, true),
        bigIdea: this.cleanupSentence((headerBlock && (headerBlock.big_idea || headerBlock.summary)) || "") || this.buildBigIdea(node),
        blocks: []
      };

      section.blocks = section.blocks.concat(this.transformNodeBlocks(node, {
        defaultTitle: node.level === 1 ? "Module Overview" : this.resolveGroupTitle(node.heading, node.level),
        subsection: false,
        subsectionId: null,
        childHeadings: node.children.map(function (child) {
          return this.formatDisplayHeading(child.heading, false);
        }, this)
      }));

      node.children.forEach(function (child) {
        section.blocks = section.blocks.concat(this.transformChildNode(child));
      }, this);

      return section;
    },

    transformChildNode: function (node) {
      let blocks = [];

      blocks = blocks.concat(this.transformNodeBlocks(node, {
        defaultTitle: this.resolveGroupTitle(node.heading, node.level),
        subsection: node.level === 2,
        subsectionId: node.level === 2 ? node.id : null,
        childHeadings: node.children.map(function (child) {
          return this.formatDisplayHeading(child.heading, false);
        }, this)
      }));

      node.children.forEach(function (child) {
        blocks = blocks.concat(this.transformChildNode(child));
      }, this);

      return blocks;
    },

    transformNodeBlocks: function (node, options) {
      const blocks = [];
      let paragraphBuffer = [];
      const termList = this.collectTermsForNode(node);

      const flushParagraphs = function () {
        if (!paragraphBuffer.length) {
          return;
        }

        const bulletGroups = this.makeBulletGroups(paragraphBuffer, {
          title: options.defaultTitle,
          subsection: options.subsection,
          subsectionId: options.subsectionId || node.id,
          termList: termList
        });

        bulletGroups.forEach(function (group) {
          blocks.push(group);
        });

        paragraphBuffer = [];
      }.bind(this);

      node.content.forEach(function (block) {
        const type = String(block && block.type || "").toLowerCase();

        if (type === "paragraph") {
          if (this.normalizeWhitespace(block.text || "")) {
            paragraphBuffer.push(block.text);
          }
          return;
        }

        flushParagraphs();

        if (type === "section_header") {
          return;
        }

        if (type === "bullet_group") {
          const bulletGroup = this.normalizeBulletGroupBlock(block, options, node.id);
          if (bulletGroup) {
            blocks.push(bulletGroup);
          }
          return;
        }

        if (type === "key_term" || type === "keyterm") {
          const termBlock = this.normalizeKeyTermBlock(block, node.id);
          if (termBlock) {
            blocks.push(termBlock);
          }
          return;
        }

        if (type === "image") {
          blocks.push({
            type: "image",
            src: block.src || "",
            alt: block.alt || "",
            caption: block.caption || "",
            description: block.description || "",
            originalSrc: block.src || ""
          });
          return;
        }

        if (type === "callout") {
          blocks.push(this.normalizeCalloutBlock(block));
          return;
        }

        if (type === "table") {
          blocks.push({
            type: "table",
            caption: block.caption || "",
            headers: Array.isArray(block.headers) ? block.headers : [],
            rows: Array.isArray(block.rows) ? block.rows : []
          });
        }
      }, this);

      flushParagraphs();
      return blocks;
    },

    makeBulletGroups: function (paragraphs, options) {
      const candidates = paragraphs.map(function (paragraph, index) {
        return this.makeStudyBullet(paragraph, options.termList, index);
      }, this).filter(Boolean);

      const seen = new Set();
      const deduped = candidates.filter(function (candidate) {
        const key = this.normalizeWhitespace(candidate.text || "").toLowerCase();
        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      }, this);

      const targetCount = Math.min(5, Math.max(3, Math.ceil(paragraphs.length / 3)));
      const selected = deduped
        .sort(function (left, right) {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.order - right.order;
        })
        .slice(0, targetCount)
        .sort(function (left, right) {
          return left.order - right.order;
        });

      const bullets = selected.map(function (candidate) {
        return candidate.html;
      });

      if (bullets.length < 3) {
        this.buildFallbackBullets(options).forEach(function (bullet) {
          const key = this.normalizeWhitespace(String(bullet).replace(/<[^>]+>/g, "")).toLowerCase();
          if (key && !seen.has(key) && bullets.length < 6) {
            seen.add(key);
            bullets.push(bullet);
          }
        }, this);
      }

      if (!bullets.length) {
        return [];
      }

      return this.chunkArray(bullets, 5).map(function (chunk, index) {
        const title = index === 0 ? options.title : options.title + " Continued";
        return {
          type: "bullet_group",
          title: title,
          bullets: chunk,
          subsection: options.subsection && index === 0,
          subsectionId: options.subsection && index === 0 ? options.subsectionId : null
        };
      });
    },

    makeStudyBullet: function (paragraphText, termList, order) {
      const promptRewrite = this.rewritePromptBullet(paragraphText);
      if (promptRewrite) {
        return {
          text: promptRewrite,
          html: this.formatInlineTerms(promptRewrite, termList),
          score: 3.25,
          order: order
        };
      }

      const candidate = this.pickBestStudySentenceCandidate(paragraphText, termList);
      if (!candidate || candidate.score < 2.2) {
        return null;
      }

      const text = this.normalizeStudyVoice(this.shortenSentence(candidate.sentence, 180));
      if (!this.isStudyFriendlyBullet(text)) {
        return null;
      }

      return {
        text: text,
        html: this.formatInlineTerms(text, termList),
        score: candidate.score,
        order: order
      };
    },

    pickBestStudySentence: function (text, termList) {
      const candidate = this.pickBestStudySentenceCandidate(text, termList);
      if (!candidate) {
        return this.cleanupSentence(text);
      }

      return candidate.sentence;
    },

    normalizeKeyTermBlock: function (block, sectionId) {
      const term = this.normalizeWhitespace(block.term || "");
      if (!term) {
        return null;
      }

      const flashcard = this.flashcardMap.get(this.normalizeTermKey(term));
      return {
        type: "key_term",
        id: sectionId + "-term-" + this.slugify(term),
        term: term,
        definition: this.cleanupSentence(block.definition || (flashcard && flashcard.definition) || ""),
        example: this.cleanupSentence(block.example || (flashcard && flashcard.example) || ""),
        mnemonic: this.cleanupSentence(block.mnemonic || (flashcard && flashcard.mnemonic) || "")
      };
    },

    normalizeCalloutBlock: function (block) {
      const variant = this.resolveCalloutVariant(block);
      return {
        type: "callout",
        variant: variant,
        title: this.normalizeWhitespace(block.title || this.defaultCalloutTitle(variant)),
        text: this.cleanupSentence(block.text || "")
      };
    },

    normalizeBulletGroupBlock: function (block, options, sectionId) {
      const bullets = Array.isArray(block.bullets) ? block.bullets.map(function (bullet) {
        return this.normalizeBulletMarkup(bullet);
      }, this).filter(Boolean) : [];

      if (!bullets.length) {
        return null;
      }

      return {
        type: "bullet_group",
        title: this.normalizeWhitespace(block.title || options.defaultTitle || "Key Ideas"),
        bullets: bullets,
        subsection: !!(options.subsection && !block.titleHidden),
        subsectionId: options.subsection ? (options.subsectionId || sectionId) : null
      };
    },

    renderStudySection: function (section, index) {
      const node = document.createElement("section");
      node.className = "notes-section reveal";
      node.dataset.stagger = String(index + 1);
      node.id = section.id || ("notes-section-" + (index + 1));

      const heading = document.createElement("h2");
      heading.className = "section-heading";
      heading.id = node.id + "-heading";
      heading.textContent = section.heading;

      const summary = document.createElement("p");
      summary.className = "section-summary";
      summary.textContent = section.bigIdea;

      node.appendChild(heading);
      node.appendChild(summary);

      section.blocks.forEach(function (block, blockIndex) {
        const blockNode = this.renderContentBlock(block, node.id, blockIndex);
        if (blockNode) {
          node.appendChild(blockNode);
        }
      }, this);

      this.registerHighlightTargets(node, node.id);
      return node;
    },

    renderContentBlock: function (block, sectionId, blockIndex) {
      const type = String(block && block.type || "").toLowerCase();

      if (type === "section_header") {
        return null;
      }

      if (type === "bullet_group") {
        return this.renderBulletGroup(block, sectionId, blockIndex);
      }

      if (type === "key_term") {
        return this.renderKeyTerm(block);
      }

      if (type === "image") {
        return this.renderImageBlock(block);
      }

      if (type === "callout") {
        return this.renderCalloutBlock(block);
      }

      if (type === "table") {
        return this.renderTableBlock(block);
      }

      return null;
    },

    renderBulletGroup: function (block, sectionId, blockIndex) {
      const card = document.createElement("div");
      card.className = "note-card bullet-card";
      card.id = block.subsectionId || (sectionId + "-bullet-group-" + blockIndex);

      const title = document.createElement("h3");
      title.className = "card-title" + (block.subsection ? " subsection-heading" : "");
      title.textContent = block.title;
      if (block.subsection) {
        title.id = card.id + "-heading";
      }
      card.appendChild(title);

      const list = document.createElement("ul");
      list.className = "note-bullets";

      (block.bullets || []).forEach(function (bullet) {
        const item = document.createElement("li");
        item.innerHTML = bullet;
        list.appendChild(item);
      });

      card.appendChild(list);
      return card;
    },

    renderKeyTerm: function (block) {
      const card = document.createElement("div");
      card.className = "note-card term-card";
      card.id = block.id || ("term-" + this.slugify(block.term || "term"));
      card.dataset.term = block.term || "";
      card.dataset.definition = block.definition || "";

      const label = document.createElement("div");
      label.className = "term-label";
      label.textContent = block.term || "Key Term";

      const content = document.createElement("div");
      content.className = "term-content";

      const definition = document.createElement("div");
      definition.className = "term-def";
      definition.textContent = block.definition || "";
      content.appendChild(definition);

      if (block.example) {
        const example = document.createElement("div");
        example.className = "term-example";
        example.textContent = "Example: " + block.example;
        content.appendChild(example);
      }

      if (block.mnemonic) {
        const mnemonic = document.createElement("div");
        mnemonic.className = "term-mnemonic";
        mnemonic.textContent = "💡 " + block.mnemonic;
        content.appendChild(mnemonic);
      }

      card.appendChild(label);
      card.appendChild(content);
      return card;
    },

    renderImageBlock: function (block) {
      const card = document.createElement("div");
      card.className = "note-card image-card";

      const resolvedSrc = this.resolveImageSrc(block.src || "");
      if (resolvedSrc) {
        const wrapper = document.createElement("div");
        wrapper.className = "image-wrapper";

        const image = document.createElement("img");
        image.src = resolvedSrc;
        image.alt = block.alt || block.caption || "Notes illustration";
        image.className = "note-image";
        image.loading = "lazy";
        image.onerror = function () {
          card.classList.add("img-missing");
        };

        const placeholder = document.createElement("div");
        placeholder.className = "img-missing-placeholder";

        const label = document.createElement("span");
        label.textContent = "Image: " + (block.alt || "Image unavailable");
        placeholder.appendChild(label);

        const source = document.createElement("small");
        source.textContent = block.originalSrc || block.src || "";
        placeholder.appendChild(source);

        wrapper.appendChild(image);
        wrapper.appendChild(placeholder);
        card.appendChild(wrapper);
      }

      if (block.caption) {
        const caption = document.createElement("div");
        caption.className = "image-caption";
        caption.textContent = block.caption;
        card.appendChild(caption);
      }

      if (this.normalizeWhitespace(block.description || "")) {
        const details = document.createElement("details");
        details.className = "image-description";

        const summary = document.createElement("summary");
        summary.className = "desc-toggle";
        summary.innerHTML = '<span class="desc-icon">🔬</span> Diagram breakdown';
        details.appendChild(summary);

        const content = document.createElement("div");
        content.className = "desc-content";
        this.renderDescriptionContent(content, block.description || "");
        details.appendChild(content);

        card.appendChild(details);
      }

      return card;
    },

    renderDescriptionContent: function (container, description) {
      const lines = String(description || "").split(/\r?\n/).map(function (line) {
        return line.trim();
      }).filter(Boolean);

      if (lines.length > 1) {
        const list = document.createElement("ul");
        list.className = "desc-list";
        lines.forEach(function (line) {
          const item = document.createElement("li");
          item.textContent = line;
          list.appendChild(item);
        });
        container.appendChild(list);
        return;
      }

      const paragraph = document.createElement("p");
      paragraph.textContent = this.normalizeWhitespace(description);
      container.appendChild(paragraph);
    },

    renderCalloutBlock: function (block) {
      const variant = CALLOUT_VARIANTS[block.variant] || CALLOUT_VARIANTS.key_concept;
      const card = document.createElement("div");
      card.className = "note-card callout-card " + variant.className;

      const header = document.createElement("div");
      header.className = "callout-header";

      const icon = document.createElement("span");
      icon.className = "callout-icon";
      icon.textContent = variant.icon;
      header.appendChild(icon);

      const title = document.createElement("span");
      title.className = "callout-title";
      title.textContent = block.title || this.defaultCalloutTitle(block.variant);
      header.appendChild(title);

      const text = document.createElement("p");
      text.className = "callout-text";
      text.textContent = block.text || "";

      card.appendChild(header);
      card.appendChild(text);
      return card;
    },

    renderTableBlock: function (block) {
      const card = document.createElement("div");
      card.className = "note-card table-card";

      if (block.caption) {
        const caption = document.createElement("p");
        caption.className = "table-caption";
        caption.textContent = block.caption;
        card.appendChild(caption);
      }

      const scroll = document.createElement("div");
      scroll.className = "table-scroll";

      const table = document.createElement("table");
      table.className = "note-table";

      if (Array.isArray(block.headers) && block.headers.length) {
        const thead = document.createElement("thead");
        const row = document.createElement("tr");
        block.headers.forEach(function (header) {
          const cell = document.createElement("th");
          cell.textContent = header;
          row.appendChild(cell);
        });
        thead.appendChild(row);
        table.appendChild(thead);
      }

      const tbody = document.createElement("tbody");
      (block.rows || []).forEach(function (rowData) {
        const row = document.createElement("tr");
        rowData.forEach(function (value) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);

      scroll.appendChild(table);
      card.appendChild(scroll);
      return card;
    },

    renderToc: function () {
      if (!this.toc) {
        return;
      }

      this.toc.innerHTML = "";
      const sectionNodes = Array.from(this.content.querySelectorAll(".notes-section"));

      if (!sectionNodes.length) {
        this.toc.appendChild(this.createEmptyState("The table of contents will appear once note headings exist."));
        return;
      }

      const tree = document.createElement("ul");
      tree.className = "toc-tree";

      sectionNodes.forEach(function (sectionNode) {
        const heading = sectionNode.querySelector(".section-heading");
        if (!heading) {
          return;
        }

        const sectionId = heading.id || sectionNode.id;
        const item = document.createElement("li");
        item.className = "toc-item";

        const link = this.createTocLink(sectionId, heading.textContent || "Untitled Section");
        item.appendChild(link);

        const subsectionHeadings = Array.from(sectionNode.querySelectorAll(".subsection-heading"));
        if (subsectionHeadings.length) {
          const nested = document.createElement("ul");
          nested.className = "toc-subtree";

          subsectionHeadings.forEach(function (subheading) {
            if (!subheading.id) {
              subheading.id = this.slugify(subheading.textContent || "subsection") + "-heading";
            }
            const nestedItem = document.createElement("li");
            nestedItem.className = "toc-item";
            nestedItem.appendChild(this.createTocLink(subheading.id, subheading.textContent || "Subsection", true));
            nested.appendChild(nestedItem);
          }, this);

          item.appendChild(nested);
        }

        tree.appendChild(item);
      }, this);

      this.toc.appendChild(tree);
      this.updateActiveHeading();
    },

    createTocLink: function (targetId, label, nested) {
      const link = document.createElement("a");
      link.href = "#" + targetId;
      link.className = "toc-link" + (nested ? " toc-link--nested" : "");
      link.dataset.targetId = targetId;
      link.textContent = label;
      return link;
    },

    handleTocClick: function (event) {
      const link = event.target.closest(".toc-link");
      if (!link) {
        return;
      }

      event.preventDefault();
      const targetId = link.dataset.targetId || link.getAttribute("href").replace(/^#/, "");
      const target = document.getElementById(targetId);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
      this.activeHeadingId = targetId;
      this.updateActiveTocStyles();

      if (this.mobileSidebarQuery && this.mobileSidebarQuery.matches) {
        document.body.classList.add("notes-sidebar-collapsed");
      }
    },

    observeHeadings: function () {
      const headings = Array.from(this.content.querySelectorAll(".section-heading, .subsection-heading"));
      if (!headings.length) {
        return;
      }

      const offset = this.getScrollOffset() + 16;
      this.headingObserver = new IntersectionObserver(function () {
        this.updateActiveHeading();
      }.bind(this), {
        rootMargin: "-" + offset + "px 0px -65% 0px",
        threshold: [0, 0.15, 0.6, 1]
      });

      headings.forEach(function (heading) {
        this.headingObserver.observe(heading);
      }, this);
    },

    updateActiveHeading: function () {
      const headings = Array.from(this.content.querySelectorAll(".section-heading, .subsection-heading"));
      if (!headings.length) {
        return;
      }

      const targetTop = this.getScrollOffset() + 22;
      let active = headings[0];
      let bestDistance = Infinity;

      headings.forEach(function (heading) {
        const distance = Math.abs(heading.getBoundingClientRect().top - targetTop);
        if (heading.getBoundingClientRect().top <= targetTop + 120 && distance < bestDistance) {
          bestDistance = distance;
          active = heading;
        }
      });

      if (active) {
        this.activeHeadingId = active.id;
        this.updateActiveTocStyles();
      }
    },

    updateActiveTocStyles: function () {
      if (!this.toc) {
        return;
      }

      this.toc.querySelectorAll(".toc-link").forEach(function (link) {
        link.classList.toggle("is-active", link.dataset.targetId === this.activeHeadingId);
      }, this);
    },

    observeVisibleTerms: function () {
      const termCards = Array.from(this.content.querySelectorAll(".term-card"));
      if (!termCards.length) {
        this.renderVisibleTerms();
        return;
      }

      this.termObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          const card = entry.target;
          const id = card.id;
          if (entry.isIntersecting) {
            this.visibleTermEntries.set(id, {
              id: id,
              term: card.dataset.term || "",
              definition: card.dataset.definition || "",
              node: card
            });
          } else {
            this.visibleTermEntries.delete(id);
          }
        }, this);

        this.renderVisibleTerms();
      }.bind(this), {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.15, 0.55]
      });

      termCards.forEach(function (card) {
        this.termObserver.observe(card);
      }, this);
    },

    renderVisibleTerms: function () {
      if (!this.glossary) {
        return;
      }

      const entries = Array.from(this.visibleTermEntries.values())
        .sort(function (left, right) {
          if (!left.node || !right.node) {
            return 0;
          }

          const position = left.node.compareDocumentPosition(right.node);
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            return -1;
          }
          if (position & Node.DOCUMENT_POSITION_PRECEDING) {
            return 1;
          }
          return 0;
        })
        .slice(0, 6);

      const nextIds = new Set(entries.map(function (entry) {
        return entry.id;
      }));

      Array.from(this.glossary.children).forEach(function (child) {
        const childId = child.getAttribute("data-term-card-id");
        if (!childId || nextIds.has(childId)) {
          return;
        }

        child.classList.remove("is-visible");
        window.setTimeout(function () {
          if (child.parentNode) {
            child.parentNode.removeChild(child);
          }
        }, 220);
      });

      if (!entries.length && !this.glossary.children.length) {
        this.glossary.innerHTML = "";
        this.glossary.appendChild(this.createEmptyState("Key terms in view will appear here as you scroll past term cards."));
        return;
      }

      if (entries.length) {
        const empty = this.glossary.querySelector(".empty-state");
        if (empty) {
          empty.remove();
        }
      }

      entries.forEach(function (entry, index) {
        let button = this.glossary.querySelector('[data-term-card-id="' + entry.id + '"]');
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "gutter-term";
          button.setAttribute("data-term-card-id", entry.id);
          button.addEventListener("click", function () {
            entry.node.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }

        button.innerHTML = "";

        const term = document.createElement("strong");
        term.textContent = entry.term;
        button.appendChild(term);

        const detail = document.createElement("span");
        detail.textContent = this.truncateText(this.firstSentence(entry.definition), 80);
        button.appendChild(detail);

        button.style.transitionDelay = String(index * 20) + "ms";
        this.glossary.appendChild(button);

        requestAnimationFrame(function () {
          button.classList.add("is-visible");
        });
      }, this);
    },

    registerHighlightTargets: function (sectionNode, sectionId) {
      const selector = "h2, h3, li, td, th, figcaption, .section-summary, .term-def, .term-example, .term-mnemonic, .callout-text, .desc-content p, .desc-content li";
      sectionNode.querySelectorAll(selector).forEach(function (node, index) {
        if (!node.dataset.highlightId) {
          node.dataset.highlightId = sectionId + "-highlight-" + index;
        }
      });
    },

    restoreHighlights: function () {
      this.highlightIds.forEach(function (id) {
        const node = this.content.querySelector('[data-highlight-id="' + id + '"]');
        if (node) {
          node.classList.add("user-highlight");
        }
      }, this);
    },

    toggleHighlightMode: function () {
      this.highlightMode = !this.highlightMode;
      this.highlightToggle.textContent = this.highlightMode ? "Highlight Mode On" : "Highlight Mode Off";
      this.highlightToggle.setAttribute("aria-pressed", String(this.highlightMode));
    },

    handleHighlightClick: function (event) {
      if (!this.highlightMode) {
        return;
      }

      const target = event.target.closest("[data-highlight-id]");
      if (!target || target.closest("a, button, summary")) {
        return;
      }

      const id = target.dataset.highlightId;
      target.classList.toggle("user-highlight");

      if (target.classList.contains("user-highlight")) {
        this.highlightIds.add(id);
      } else {
        this.highlightIds.delete(id);
      }

      this.persistState();
    },

    updateReadingProgress: function () {
      if (!this.content || !this.progress) {
        return;
      }

      const contentTop = this.content.offsetTop;
      const contentHeight = this.content.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxScrollable = Math.max(1, contentHeight - viewportHeight + 160);
      const distance = Math.max(0, window.scrollY - contentTop + this.getScrollOffset());
      const percent = Math.max(0, Math.min(100, (distance / maxScrollable) * 100));

      this.progress.style.width = percent.toFixed(2) + "%";
      this.state.scrollPercent = percent;
      this.persistState();
    },

    persistState: function () {
      this.app.setStorage(this.storageKey, {
        highlights: Array.from(this.highlightIds),
        scrollPercent: this.state.scrollPercent || 0
      });
    },

    syncResponsiveSidebar: function (force) {
      const isMobile = !!(this.mobileSidebarQuery && this.mobileSidebarQuery.matches);
      if (this.isMobileSidebar === null || force || this.isMobileSidebar !== isMobile) {
        if (isMobile) {
          document.body.classList.add("notes-sidebar-collapsed");
        } else {
          document.body.classList.remove("notes-sidebar-collapsed");
        }
      }
      this.isMobileSidebar = isMobile;
    },

    resolveImageSrc: function (src) {
      const normalized = this.normalizeWhitespace(src || "");
      if (!normalized) {
        return "";
      }

      if (/^https?:/i.test(normalized)) {
        return normalized;
      }

      if (!BASE_PATH && this.app && typeof this.app.getPath === "function") {
        return this.app.getPath(normalized);
      }

      if (!BASE_PATH) {
        return normalized.replace(/^\/+/, "");
      }

      return BASE_PATH.replace(/\/$/, "") + "/" + normalized.replace(/^\/+/, "");
    },

    buildFlashcardMap: function (flashcards) {
      const map = new Map();
      (flashcards || []).forEach(function (card) {
        const key = this.normalizeTermKey(card.term || "");
        if (key) {
          map.set(key, card);
        }
      }, this);
      return map;
    },

    collectTermsForNode: function (node) {
      const terms = [];
      const seen = new Set();

      function visit(current) {
        current.content.forEach(function (block) {
          const type = String(block && block.type || "").toLowerCase();
          const term = block && block.term ? String(block.term) : "";
          const key = this.normalizeTermKey(term);
          if ((type === "key_term" || type === "keyterm") && key && !seen.has(key)) {
            seen.add(key);
            terms.push(term);
          }
        }, this);

        current.children.forEach(function (child) {
          visit.call(this, child);
        }, this);
      }

      visit.call(this, node);

      return terms.sort(function (left, right) {
        return right.length - left.length;
      });
    },

    buildBigIdea: function (node) {
      const text = this.findPrimaryNarrativeText(node);
      if (text) {
        const summary = this.shortenSentence(this.normalizeStudyVoice(this.pickBestStudySentence(text, this.collectTermsForNode(node))), 150);
        if (this.isStudyFriendlySummary(summary)) {
          return summary;
        }
      }

      return this.buildFallbackBigIdea(node.heading);
    },

    findPrimaryNarrativeText: function (node) {
      for (let index = 0; index < node.content.length; index += 1) {
        const block = node.content[index];
        if (String(block && block.type || "").toLowerCase() === "paragraph" && this.normalizeWhitespace(block.text || "")) {
          return block.text;
        }
      }

      for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
        const childText = this.findPrimaryNarrativeText(node.children[childIndex]);
        if (childText) {
          return childText;
        }
      }

      for (let fallbackIndex = 0; fallbackIndex < node.content.length; fallbackIndex += 1) {
        const contentBlock = node.content[fallbackIndex];
        if (String(contentBlock && contentBlock.type || "").toLowerCase() === "callout" && this.normalizeWhitespace(contentBlock.text || "")) {
          return contentBlock.text;
        }
      }

      return "";
    },

    buildFallbackBigIdea: function (heading) {
      const normalized = this.normalizeWhitespace(heading || "");
      if (/development and learning/i.test(normalized)) {
        return "Development and learning explain how people change across the lifespan and how experience shapes behavior.";
      }
      if (/themes and methods in developmental psychology/i.test(normalized)) {
        return "Developmental psychology tracks how people grow, stay stable, and change across the lifespan.";
      }
      if (/physical development/i.test(normalized)) {
        return "Physical development follows predictable growth patterns from prenatal life through adulthood.";
      }
      if (/gender and sexual orientation/i.test(normalized)) {
        return "Gender and sexuality reflect an ongoing interaction between biology, identity, and social context.";
      }
      if (/cognitive development/i.test(normalized)) {
        return "Cognitive development explains how thinking changes from infancy to older adulthood.";
      }
      if (/language development/i.test(normalized)) {
        return "Language development shows how humans acquire communication systems and use them to think.";
      }
      if (/social-emotional development/i.test(normalized)) {
        return "Social-emotional development shapes attachment, identity, relationships, and adult life transitions.";
      }
      if (/classical conditioning/i.test(normalized)) {
        return "Classical conditioning explains how organisms learn associations between stimuli and responses.";
      }
      if (/operant conditioning/i.test(normalized)) {
        return "Operant conditioning explains how consequences shape future behavior.";
      }
      if (/learning/i.test(normalized)) {
        return "Learning changes behavior and thinking by connecting experience with action.";
      }
      return "This section distills the key ideas, terms, and examples you need for AP Psychology review.";
    },

    resolveGroupTitle: function (heading, level) {
      const formatted = this.formatDisplayHeading(heading, false);
      if (!formatted || formatted === "Overview") {
        return level === 1 ? "Big Picture" : "Key Ideas";
      }
      return formatted;
    },

    formatDisplayHeading: function (heading, isPrimary) {
      const normalized = this.normalizeWhitespace(heading || "");
      if (!normalized || /untitled section/i.test(normalized)) {
        return isPrimary ? "Overview" : "Key Ideas";
      }

      if (isPrimary) {
        return normalized
          .replace(/^Unit\s+\d+\s+/i, "")
          .replace(/^Module\s+\d+\.\d+[a-z]?\s+/i, "");
      }

      return normalized.replace(/^Module\s+\d+\.\d+[a-z]?\s+/i, "");
    },

    resolveCalloutVariant: function (block) {
      const variant = this.normalizeWhitespace(block.variant || "").toLowerCase();
      const title = this.normalizeWhitespace(block.title || "").toLowerCase();
      const text = this.normalizeWhitespace(block.text || "").toLowerCase();

      if (variant === "tip" || /learning targets|ap exam|exam tip/.test(title) || /learning target/.test(text)) {
        return /learning targets|ap exam|exam tip/.test(title + " " + text) ? "exam_tip" : "tip";
      }
      if (variant === "warning") {
        return "warning";
      }
      if (variant === "memory_hook") {
        return "memory_hook";
      }
      return "key_concept";
    },

    defaultCalloutTitle: function (variant) {
      switch (variant) {
        case "exam_tip":
          return "Exam Tip";
        case "tip":
          return "Tip";
        case "warning":
          return "Watch Out";
        case "memory_hook":
          return "Memory Hook";
        default:
          return "Key Concept";
      }
    },

    formatInlineTerms: function (text, termList) {
      let output = this.escapeHtml(text);
      (termList || []).forEach(function (term) {
        const cleaned = this.normalizeWhitespace(term);
        if (!cleaned || cleaned.length < 4) {
          return;
        }

        const pattern = new RegExp("\\b" + this.escapeRegExp(cleaned).replace(/\\ /g, "\\s+") + "\\b", "gi");
        output = output.replace(pattern, function (match) {
          return "<strong>" + match + "</strong>";
        });
      }, this);

      return output;
    },

    normalizeBulletMarkup: function (bullet) {
      const text = String(bullet || "").trim();
      if (!text) {
        return "";
      }

      if (/<[a-z][\s\S]*>/i.test(text)) {
        return text;
      }

      return this.escapeHtml(text);
    },

    buildFallbackBullets: function (options) {
      const bullets = [];
      const heading = this.normalizeWhitespace(options.defaultTitle || "");
      const childHeadings = (options.childHeadings || []).filter(Boolean).slice(0, 4);
      const terms = (options.termList || []).filter(Boolean).slice(0, 4);

      if (heading) {
        bullets.push(this.escapeHtml(this.buildFallbackBigIdea(heading)));
      }

      if (childHeadings.length) {
        bullets.push(this.escapeHtml("Focus on these related ideas: " + childHeadings.join(", ") + "."));
      }

      if (terms.length) {
        bullets.push(this.formatInlineTerms("Key terms to know: " + terms.join(", ") + ".", terms));
      }

      return bullets;
    },

    rewritePromptBullet: function (text) {
      const normalized = this.cleanupSentence(text);
      if (!normalized || normalized.indexOf(":") === -1 || normalized.indexOf("?") === -1) {
        return "";
      }

      if (/^Nature and nurture:/i.test(normalized)) {
        return "Nature and nurture explains how genes and experience interact to shape development.";
      }

      if (/^Continuity and stages:/i.test(normalized)) {
        return "Continuity and stages asks whether development is gradual or happens in distinct steps.";
      }

      if (/^Stability and change:/i.test(normalized)) {
        return "Stability and change compares the traits that persist across life with the ones that shift over time.";
      }

      const match = normalized.match(/^([^:]{3,80}):\s*(.+)$/);
      if (!match) {
        return "";
      }

      return this.normalizeWhitespace(match[1]) + " highlights a core question students should be able to explain.";
    },

    truncateText: function (text, limit) {
      const normalized = this.normalizeWhitespace(text || "");
      if (normalized.length <= limit) {
        return normalized;
      }
      return normalized.slice(0, Math.max(0, limit - 1)).trim() + "…";
    },

    splitSentences: function (text) {
      const normalized = this.normalizeWhitespace(text || "");
      if (!normalized) {
        return [];
      }
      return normalized.split(/(?<=[.!?])\s+/);
    },

    firstSentence: function (text) {
      return this.splitSentences(text)[0] || this.normalizeWhitespace(text || "");
    },

    shortenSentence: function (text, maxLength) {
      const normalized = this.cleanupSentence(text);
      if (normalized.length <= maxLength) {
        return normalized;
      }

      const cutAt = normalized.lastIndexOf(" ", maxLength - 1);
      if (cutAt > 40) {
        return normalized.slice(0, cutAt).trim() + "…";
      }

      return normalized.slice(0, maxLength - 1).trim() + "…";
    },

    cleanupSentence: function (text) {
      return this.normalizeWhitespace(text || "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\b(?:my|our|your)\s+\[[^\]]+\]s?/gi, "")
        .replace(/^\d+\.\d+[a-z]?(?:-\d+)?\s+/i, "")
        .replace(/\s+,/g, ",")
        .replace(/\s+\./g, ".")
        .replace(/\s+;/g, ";")
        .trim();
    },

    pickBestStudySentenceCandidate: function (text, termList) {
      const sentences = this.splitSentences(text).map(function (sentence, index) {
        const cleaned = this.cleanupSentence(sentence);
        const lower = cleaned.toLowerCase();
        const termHits = termList.filter(function (term) {
          return term.length > 3 && lower.indexOf(term.toLowerCase()) !== -1;
        }).length;
        let score = 0;

        if (!cleaned || cleaned.length <= 24) {
          return null;
        }
        if (index === 0) {
          score += 1.25;
        }
        if (/\bis\b|\bare\b|\bmeans\b|\brefers\b|\bdescribes\b|\bexplains\b|\bexamines\b/.test(lower)) {
          score += 2;
        }
        if (/\bdevelop|\bstage|\blearn|\bmemory|\battachment|\bcondition|\breinforcement|\bbehavior|\blanguage|\bgender|\bsex|\bsexual|\bbrain|\bcognitive|\bphysical|\bsocial|\bidentity|\bchild|\binfant|\badolescent|\badult|\bresearch|\bstudy|\btrait/.test(lower)) {
          score += 1.5;
        }
        if (/\bmy\b|\bi\b|\bme\b|\bmine\b/.test(lower)) {
          score -= 4;
        }
        if (/\byou\b|\byour\b|\byours\b/.test(lower)) {
          score -= 3;
        }
        if (/for example|suppose|imagine/.test(lower)) {
          score -= 0.5;
        }
        score += Math.min(termHits, 3);
        score -= Math.abs(cleaned.split(/\s+/).length - 18) * 0.08;

        return {
          sentence: cleaned,
          score: score
        };
      }, this).filter(Boolean);

      if (!sentences.length) {
        return null;
      }

      sentences.sort(function (left, right) {
        return right.score - left.score;
      });

      return sentences[0];
    },

    getScrollOffset: function () {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--page-top-offset");
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 59;
    },

    findSectionHeaderBlock: function (node) {
      return (node.content || []).find(function (block) {
        return String(block && block.type || "").toLowerCase() === "section_header";
      }) || null;
    },

    isStudyFriendlySummary: function (text) {
      const normalized = this.normalizeWhitespace(text || "");
      if (!normalized) {
        return false;
      }

      if (/\b(?:i|me|my|mine|we|us|our|ours|you|your|yours)\b/i.test(normalized)) {
        return false;
      }

      if (/life is a journey|for me|for you|my story|your story/i.test(normalized)) {
        return false;
      }

      return normalized.length >= 36;
    },

    normalizeStudyVoice: function (text) {
      return this.cleanupSentence(text)
        .replace(/^(?:But|And|So)\s+/i, "")
        .replace(/\bWe are\b/g, "People are")
        .replace(/\bWe grow\b/g, "People grow")
        .replace(/\bWe learn\b/g, "People learn")
        .replace(/\bWe experience\b/g, "People experience")
        .replace(/\bwe are\b/g, "people are")
        .replace(/\bwe grow\b/g, "people grow")
        .replace(/\bwe learn\b/g, "people learn")
        .replace(/\bwe experience\b/g, "people experience")
        .replace(/\bexamines our\b/gi, "examines")
        .replace(/\bour development\b/g, "development")
        .replace(/\bour traits\b/g, "traits")
        .replace(/\bour body\b/g, "the body")
        .replace(/\bourselves\b/g, "themselves")
        .replace(/People are formed by our genes and by our contexts, so our stories all differ\./i, "People are shaped by genes and context, so development follows different paths.")
        .replace(/Stability also marks development: Our life situations change, but people experience a continuous self\./i, "Stability also matters because life situations change while a sense of self can stay consistent.");
    },

    isStudyFriendlyBullet: function (text) {
      const normalized = this.normalizeWhitespace(text || "");
      if (!normalized || normalized.length < 28) {
        return false;
      }

      if (/\?/.test(normalized)) {
        return false;
      }

      if (/\b(?:i|me|my|mine|you|your|yours)\b/i.test(normalized)) {
        return false;
      }

      if (/life is a journey|for me|for you|my story|your story/i.test(normalized)) {
        return false;
      }

      return true;
    },

    normalizeTermKey: function (value) {
      return this.normalizeWhitespace(value || "")
        .toLowerCase()
        .replace(/[’']/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    },

    chunkArray: function (items, size) {
      const chunks = [];
      for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
      }
      return chunks;
    },

    slugify: function (value) {
      return this.normalizeWhitespace(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "item";
    },

    normalizeWhitespace: function (value) {
      return String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },

    escapeHtml: function (value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    escapeRegExp: function (value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },

    createEmptyState: function (message) {
      const panel = document.createElement("div");
      panel.className = "empty-state neu-card";
      panel.textContent = message;
      return panel;
    }
  };

  window.NotesPage = NotesPage;
})();
