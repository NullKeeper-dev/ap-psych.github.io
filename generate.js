#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { JSDOM, VirtualConsole } = require("jsdom");

const MCQ_TARGET = 48;
const FRQ_TARGET = 8;
const NON_VOCABULARY_TERMS = new Set([
  "accelerating sexual activity",
  "a",
  "ah",
  "and",
  "believing rape is acceptable",
  "behaviors",
  "c",
  "do",
  "ee",
  "egotistical",
  "er",
  "habituates",
  "he",
  "hint",
  "i",
  "if",
  "l",
  "la",
  "le",
  "m",
  "ma",
  "me",
  "my",
  "n",
  "no",
  "on",
  "r",
  "role",
  "s",
  "t",
  "th",
  "u",
  "un"
]);

const MCQ_PRIORITY_TERMS = [
  "developmental psychology",
  "maturation",
  "teratogens",
  "critical period",
  "imprinting",
  "adolescence",
  "puberty",
  "gender identity",
  "gender roles",
  "gender typing",
  "sexual orientation",
  "schemas",
  "assimilation",
  "accommodation",
  "sensorimotor stage",
  "object permanence",
  "preoperational stage",
  "egocentric",
  "conservation",
  "concrete operational stage",
  "formal operational",
  "language",
  "phonemes",
  "morphemes",
  "grammar",
  "one-word stage",
  "two-word stage",
  "telegraphic speech",
  "Broca’s area",
  "Wernicke’s area",
  "aphasia",
  "attachment",
  "secure attachment",
  "insecure attachment",
  "temperament",
  "social learning theory",
  "learning",
  "associative learning",
  "classical conditioning",
  "behaviorism",
  "conditioned stimulus (CS)",
  "conditioned response (CR)",
  "acquisition",
  "extinction",
  "spontaneous recovery",
  "generalization",
  "discrimination",
  "operant conditioning",
  "law of effect",
  "shaping",
  "positive reinforcement",
  "negative reinforcement",
  "punishment",
  "fixed-ratio schedules",
  "variable-ratio schedules",
  "observational learning",
  "mirror neurons",
  "latent learning",
  "insight learning",
  "cognitive map"
];

const FRQ_BLUEPRINTS = [
  {
    concept: "attachment",
    scenario: "A daycare teacher notices that 14-month-old Mateo cries when his father leaves in the morning. After a few minutes of play, Mateo settles down, but when his father returns in the afternoon, Mateo smiles, reaches up to be held, and quickly calms.",
    prompt: "Using the concept of attachment, explain Mateo's behavior."
  },
  {
    concept: "assimilation",
    scenario: "During a zoo trip, 4-year-old Ava points to a zebra and confidently says, \"That horse has stripes.\" Her teacher tells her it is a zebra, but Ava keeps using her old label for a while because it fits what she already knows.",
    prompt: "Using the concept of assimilation, explain Ava's response."
  },
  {
    concept: "formal operational",
    scenario: "In a civics class, 16-year-old Jordan debates whether a law would still be fair if it helped one group but unintentionally harmed another. Jordan weighs several hypothetical outcomes and compares abstract ideas about justice.",
    prompt: "Using the concept of the formal operational stage, explain Jordan's reasoning."
  },
  {
    concept: "gender typing",
    scenario: "Five-year-old Nia insists on copying the clothing, toys, and chores that she sees older girls in her family doing. She says she wants to act the way girls are \"supposed\" to act.",
    prompt: "Using the concept of gender typing, explain Nia's behavior."
  },
  {
    concept: "classical conditioning",
    scenario: "During a severe storm, Malik hears a loud weather siren right before the power goes out and a tree crashes onto his porch. Weeks later, he feels tense and his heart races whenever he hears a similar siren, even when the weather is clear.",
    prompt: "Using the concept of classical conditioning, explain why Malik reacts this way."
  },
  {
    concept: "negative reinforcement",
    scenario: "Every time Lena buckles her seat belt, the annoying warning chime in her car immediately stops. Over time, Lena starts fastening her seat belt more quickly as soon as she gets in the car.",
    prompt: "Using the concept of negative reinforcement, explain Lena's behavior."
  },
  {
    concept: "observational learning",
    scenario: "After watching his older brother successfully calm a barking dog by standing still and speaking softly, Emilio begins using the same strategy around unfamiliar dogs and starts feeling more confident.",
    prompt: "Using the concept of observational learning, explain how Emilio learned this behavior."
  },
  {
    concept: "operant conditioning",
    scenario: "A teacher gives students participation points whenever they contribute thoughtful comments during discussion. Over the next month, more students volunteer answers and take part in class.",
    prompt: "Using the concept of operant conditioning, explain the change in student participation."
  }
];

main();

function main() {
  run().catch(function (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const unitNumber = args.unit;

  if (!unitNumber) {
    throw new Error("Usage: node generate.js --unit 3");
  }

  const projectRoot = process.cwd();
  const unitDir = path.join(projectRoot, "textbook", "Unit " + unitNumber);
  const outputFile = path.join(projectRoot, "data", "unit" + unitNumber + ".json");
  const outputScriptFile = path.join(projectRoot, "data", "unit" + unitNumber + ".js");

  if (!fs.existsSync(unitDir)) {
    throw new Error("Textbook folder not found: " + unitDir);
  }

  if (fileHasMeaningfulContent(outputFile)) {
    const answer = await promptUser("unit" + unitNumber + ".json already has content. Overwrite? (y/n) ");
    if (answer !== "y") {
      return;
    }
  }

  const result = generateUnitData(unitNumber, unitDir, projectRoot);
  validateResult(result);

  fs.writeFileSync(outputFile, JSON.stringify(result.data, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputScriptFile, buildUnitDataScript(unitNumber, result.data), "utf8");

  console.log("✓ Unit " + unitNumber + " — " + result.data.title);
  console.log("✓ Notes: " + result.data.notes.length + " sections, " + result.summary.images + " images included");
  console.log("✓ Flashcards: " + result.data.flashcards.length + " cards");
  console.log("✓ MCQ: " + result.data.mcq.length + " questions");
  console.log("✓ FRQ: " + result.data.frq.length + " prompts");
}

function generateUnitData(unitNumber, unitDir, projectRoot) {
  const htmlFiles = fs.readdirSync(unitDir)
    .filter(function (name) {
      return name.toLowerCase().endsWith(".html");
    })
    .sort(function (left, right) {
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    });

  if (!htmlFiles.length) {
    throw new Error("No HTML files found in " + unitDir);
  }

  const imagesDir = path.join(unitDir, "images");
  ensureDirectory(imagesDir);

  const state = {
    unitNumber: unitNumber,
    unitDir: unitDir,
    projectRoot: projectRoot,
    imagesDir: imagesDir,
    imageMap: new Map(),
    sectionIdCounts: new Map(),
    rawNotes: [],
    termEntries: new Map(),
    imageCount: 0
  };

  let inferredTitle = "";

  htmlFiles.forEach(function (fileName) {
    const filePath = path.join(unitDir, fileName);
    const doc = getContentDocument(filePath);
    const rootSection = doc.querySelector("body > section.sect1") || doc.querySelector("body > section");

    if (!rootSection) {
      return;
    }

    const rootHeading = getSectionHeading(rootSection);
    if (!inferredTitle && /^Unit\s+\d+/i.test(rootHeading)) {
      inferredTitle = stripUnitPrefix(rootHeading);
    }

    extractSection(rootSection, {
      moduleHeading: rootHeading,
      captureTerms: true,
      sourceType: "content"
    }, state);
  });

  const termRecords = buildTermRecords(state.termEntries);
  const notes = buildNotes(state.rawNotes, termRecords);
  const flashcards = buildFlashcards(termRecords);
  const mcq = buildMcqSet(termRecords);
  const frq = buildFrqSet(termRecords);
  const title = inferredTitle || ("Unit " + unitNumber);

  return {
    data: {
      unit: unitNumber,
      title: title,
      notes: notes,
      flashcards: flashcards,
      mcq: mcq,
      frq: frq
    },
    summary: {
      images: state.imageCount
    }
  };
}

/* extraction */
function extractSection(sectionEl, context, state) {
  const heading = getSectionHeading(sectionEl);
  const level = inferSectionLevel(sectionEl);
  const classes = new Set(Array.from(sectionEl.classList || []));
  const isPracticeSection = classes.has("practice");
  const nextContext = {
    moduleHeading: context.moduleHeading || heading,
    captureTerms: context.captureTerms && !isPracticeSection,
    sourceType: isPracticeSection ? "practice" : context.sourceType
  };

  const noteSection = {
    id: makeSectionId(nextContext.moduleHeading, heading, state.sectionIdCounts),
    heading: heading,
    level: level,
    content: [],
    termKeys: []
  };
  const sectionTermKeys = new Set();

  Array.from(sectionEl.children).forEach(function (child) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === "header") {
      return;
    }

    if (tagName === "section") {
      return;
    }

    const blocks = extractBlocksFromNode(child, {
      sectionHeading: heading,
      moduleHeading: nextContext.moduleHeading,
      captureTerms: nextContext.captureTerms,
      sourceType: nextContext.sourceType
    }, state, sectionTermKeys);

    blocks.forEach(function (block) {
      noteSection.content.push(block);
    });
  });

  noteSection.termKeys = Array.from(sectionTermKeys);

  if (noteSection.content.length) {
    state.rawNotes.push(noteSection);
  }

  Array.from(sectionEl.children).forEach(function (child) {
    if (child.tagName.toLowerCase() === "section") {
      extractSection(child, nextContext, state);
    }
  });
}

function extractBlocksFromNode(node, context, state, sectionTermKeys) {
  const tagName = node.tagName.toLowerCase();

  if (tagName === "p") {
    const blocks = extractNestedMediaBlocks(node, context, state);
    const text = extractCleanText(node);
    registerTermsFromNode(node, text, context, state, sectionTermKeys);
    if (text) {
      blocks.push({ type: "paragraph", text: text });
    }
    return blocks;
  }

  if (tagName === "aside") {
    const blocks = [];
    const block = extractCalloutBlock(node);
    if (block && block.text && context.captureTerms) {
      registerTermsFromNode(node, block.text, context, state, sectionTermKeys);
    }
    if (block) {
      blocks.push(block);
    }
    return blocks.concat(extractNestedMediaBlocks(node, context, state));
  }

  if (tagName === "figure") {
    const block = extractImageBlock(node, context, state);
    return block ? [block] : [];
  }

  if (tagName === "table") {
    const block = extractTableBlock(node);
    return block ? [block] : [];
  }

  if (tagName === "ul" || tagName === "ol") {
    const blocks = extractListBlocks(node, context, state, sectionTermKeys);
    if (context.captureTerms) {
      blocks.forEach(function (block) {
        if (block.type === "paragraph" && block.text) {
          registerTermsFromNode(node, block.text, context, state, sectionTermKeys);
        }
      });
    }
    return blocks;
  }

  if (tagName === "div" || tagName === "article" || tagName === "main") {
    return Array.from(node.children).reduce(function (allBlocks, child) {
      return allBlocks.concat(extractBlocksFromNode(child, context, state, sectionTermKeys));
    }, []);
  }

  return [];
}

function extractCalloutBlock(asideEl) {
  if (asideEl.classList.contains("glossary")) {
    return null;
  }

  const title = extractAsideTitle(asideEl);
  const text = extractAsideBody(asideEl);

  if (!title && !text) {
    return null;
  }

  return {
    type: "callout",
    variant: mapCalloutVariant(asideEl, title),
    title: title || "Key Idea",
    text: text
  };
}

function extractImageBlock(figureEl, context, state) {
  const image = Array.from(figureEl.querySelectorAll("img")).find(function (img) {
    return !isDecorativeImage(img);
  });

  if (!image) {
    return null;
  }

  const caption = extractCleanText(figureEl.querySelector("figcaption"));
  const adjacentDescription = getPluginImageDescription(figureEl);
  return createImageBlock(image, caption, adjacentDescription, context, state);
}

function extractTableBlock(tableEl) {
  const allRows = Array.from(tableEl.querySelectorAll("tr")).map(function (row) {
    return Array.from(row.children).map(function (cell) {
      return extractCleanText(cell);
    }).filter(Boolean);
  }).filter(function (row) {
    return row.length > 0;
  });

  if (!allRows.length) {
    return null;
  }

  let headers = Array.from(tableEl.querySelectorAll("thead tr th")).map(function (cell) {
    return extractCleanText(cell);
  }).filter(Boolean);
  let rows = allRows.slice();

  if (headers.length) {
    rows = rows.filter(function (row, index) {
      return index !== 0 || row.join(" ").toLowerCase() !== headers.join(" ").toLowerCase();
    });
  } else if (looksLikeHeaderRow(rows)) {
    headers = rows.shift();
  }

  return {
    type: "table",
    caption: extractCleanText(tableEl.querySelector("caption")),
    headers: headers,
    rows: rows
  };
}

function extractListBlocks(listEl, context, state) {
  return Array.from(listEl.children).reduce(function (blocks, item) {
    if (item.tagName.toLowerCase() !== "li") {
      return blocks;
    }

    const itemClone = item.cloneNode(true);
    Array.from(itemClone.querySelectorAll("ol, ul")).forEach(function (nested) {
      nested.remove();
    });

    const text = extractCleanText(itemClone);
    if (text) {
      blocks.push({ type: "paragraph", text: text });
    }

    extractNestedMediaBlocks(itemClone, context, state).forEach(function (mediaBlock) {
      blocks.push(mediaBlock);
    });

    Array.from(item.children).forEach(function (child) {
      const childTag = child.tagName.toLowerCase();
      if (childTag === "ol" || childTag === "ul") {
        extractListBlocks(child, context, state).forEach(function (nestedBlock) {
          blocks.push(nestedBlock);
        });
      }
    });

    return blocks;
  }, []);
}

function extractNestedMediaBlocks(node, context, state) {
  return Array.from(node.querySelectorAll("figure, table, img")).reduce(function (blocks, child) {
    const tagName = child.tagName.toLowerCase();
    let block = null;

    if (tagName === "figure") {
      block = extractImageBlock(child, context, state);
    } else if (tagName === "table") {
      block = extractTableBlock(child);
    } else if (tagName === "img" && !child.closest("figure") && !child.closest("table")) {
      const wrapperText = extractCleanText(child.closest("p, li, aside") || child.parentElement);
      block = createImageBlock(child, wrapperText, "", context, state);
    }

    if (block) {
      blocks.push(block);
    }

    return blocks;
  }, []);
}

function buildNotes(rawNotes, termRecords) {
  const seenTerms = new Set();

  return rawNotes.map(function (section) {
    const content = section.content.slice();

    section.termKeys.forEach(function (termKey) {
      if (seenTerms.has(termKey)) {
        return;
      }

      const record = termRecords.get(termKey);
      if (!record) {
        return;
      }

      seenTerms.add(termKey);
      content.push({
        type: "key_term",
        term: record.term,
        definition: record.definition,
        example: record.example
      });
    });

    return {
      id: section.id,
      heading: section.heading,
      level: section.level,
      content: content
    };
  });
}

function registerTermsFromNode(node, text, context, state, sectionTermKeys) {
  if (!context.captureTerms || !text) {
    return;
  }

  const terms = collectTermsFromNode(node);
  if (!terms.length) {
    return;
  }

  terms.forEach(function (term) {
    const key = normalizeTermKey(term.term);
    if (!key) {
      return;
    }

    if (!state.termEntries.has(key)) {
      state.termEntries.set(key, {
        key: key,
        term: cleanTerm(term.term),
        contexts: [],
        sourceKinds: new Set()
      });
    }

    const entry = state.termEntries.get(key);
    entry.sourceKinds.add(term.sourceKind);
    sectionTermKeys.add(key);

    const source = {
      text: text,
      moduleHeading: context.moduleHeading,
      sectionHeading: context.sectionHeading,
      sourceType: context.sourceType
    };

    if (!entry.contexts.some(function (existing) {
      return existing.text === source.text;
    })) {
      entry.contexts.push(source);
    }
  });
}

function collectTermsFromNode(node) {
  const terms = [];
  const seen = new Set();

  Array.from(node.querySelectorAll("dfn.keyword, strong, b, i.semantic-i")).forEach(function (termNode) {
    const tagName = termNode.tagName.toLowerCase();
    const sourceKind = tagName === "dfn" ? "dfn" : (tagName === "i" ? "italic" : "bold");
    const rawTerm = extractCleanText(termNode);
    const cleaned = cleanTerm(rawTerm);

    if (!cleaned) {
      return;
    }

    if (tagName !== "dfn" && !looksLikeVocabularyTerm(cleaned)) {
      return;
    }

    const key = normalizeTermKey(cleaned);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    terms.push({
      term: cleaned,
      sourceKind: sourceKind
    });
  });

  return terms;
}
/* term generation */
function buildTermRecords(termEntries) {
  const records = new Map();

  Array.from(termEntries.values()).forEach(function (entry) {
    const definitionResult = chooseDefinition(entry);
    const definition = definitionResult.text;
    const example = chooseExample(entry);
    const term = entry.term;

    if (!definition || !shouldKeepTermEntry(entry, definitionResult)) {
      return;
    }

    records.set(entry.key, {
      key: entry.key,
      term: term,
      definition: definition,
      example: example,
      mnemonic: buildMnemonic(term),
      topic: formatTopic(categorizeTerm(term)),
      category: categorizeTerm(term)
    });
  });

  return records;
}

function chooseDefinition(entry) {
  const variants = buildTermVariants(entry.term);
  const candidates = [];

  entry.contexts.forEach(function (context) {
    splitSentences(context.text).forEach(function (sentence) {
      if (!sentence || !containsAnyVariant(sentence, variants)) {
        return;
      }

      candidates.push({
        text: cleanupSentence(sentence),
        score: scoreDefinitionSentence(sentence, entry.term, context)
      });
    });
  });

  candidates.sort(function (left, right) {
    return right.score - left.score;
  });

  if (candidates.length) {
    return candidates[0];
  }

  return {
    text: entry.contexts[0] ? cleanupSentence(entry.contexts[0].text) : "",
    score: 0
  };
}

function shouldKeepTermEntry(entry, definitionResult) {
  if (!looksLikeVocabularyTerm(entry.term)) {
    return false;
  }

  if (entry.sourceKinds.has("dfn")) {
    return true;
  }

  const score = definitionResult.score || 0;
  if (score >= 10) {
    return true;
  }

  if (score >= 8 && /\b(study|studies|variable|definition|stage|orientation|identity|role|roles|learning|development|psychology|attachment|conditioning|reinforcement|stimulus|response|schema|schemas|grammar|morpheme|phoneme|aphasia|temperament|trust|puberty|adolescence|gender|sexual|autism|teratogen|maturation|conservation|egocentric|theory|mind|language|babbling|speech|area|hormone|syndrome|pruning|placenta|zygote|embryo|fetus|synapse|imprinting|period|consent|androgyny|animism)\b/i.test(entry.term)) {
    return true;
  }

  return false;
}

function chooseExample(entry) {
  const variants = buildTermVariants(entry.term);

  for (let index = 0; index < entry.contexts.length; index += 1) {
    const context = entry.contexts[index];
    const sentences = splitSentences(context.text);

    for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
      const sentence = cleanupSentence(sentences[sentenceIndex]);
      if (!sentence) {
        continue;
      }

      const lower = sentence.toLowerCase();
      const looksConcrete = /for example|such as|suppose|when|after|before|during|if |because|student|child|baby|dog|parent|teacher|rat|teen|infant|adult|person/.test(lower);
      const looksLikeDefinition = /\bis\b|\bare\b|\brefers\b|\bmeans\b/.test(lower) && containsAnyVariant(sentence, variants);

      if (looksConcrete && !looksLikeDefinition) {
        return sentence;
      }
    }
  }

  return buildFallbackExample(entry.term, categorizeTerm(entry.term));
}

function buildMnemonic(term) {
  const lower = normalizeTermKey(term);

  if (lower === "negative reinforcement") {
    return "Negative = take away; reinforcement = behavior goes up.";
  }
  if (lower === "positive reinforcement") {
    return "Positive = add something pleasant to increase behavior.";
  }
  if (lower === "punishment") {
    return "Punishment pushes behavior down.";
  }
  if (lower === "broca s area") {
    return "Broca = broken speech production.";
  }
  if (lower === "wernicke s area") {
    return "Wernicke = word meaning.";
  }
  if (lower.indexOf("variable") !== -1) {
    return "Variable means the pattern varies and is hard to predict.";
  }
  if (lower.indexOf("fixed") !== -1) {
    return "Fixed means the pattern stays predictable.";
  }
  if (lower.indexOf("unconditioned stimulus") !== -1) {
    return "UCS naturally triggers a response without learning.";
  }
  if (lower.indexOf("unconditioned response") !== -1) {
    return "UCR is unlearned and automatic.";
  }
  if (lower.indexOf("conditioned stimulus") !== -1) {
    return "CS comes to signal the unconditioned stimulus.";
  }
  if (lower.indexOf("conditioned response") !== -1) {
    return "CR is the learned reaction to the conditioned stimulus.";
  }
  if (lower.indexOf("sensorimotor") !== -1) {
    return "Sensorimotor = senses plus movement.";
  }
  if (lower.indexOf("preoperational") !== -1) {
    return "Preoperational = before logical operations.";
  }
  if (lower.indexOf("concrete operational") !== -1) {
    return "Concrete operational thinkers reason best with concrete examples.";
  }
  if (lower.indexOf("formal operational") !== -1) {
    return "Formal operational thinkers handle formal, abstract ideas.";
  }
  if (lower.indexOf("phoneme") !== -1) {
    return "Phoneme = phone-sized sound unit.";
  }
  if (lower.indexOf("morpheme") !== -1) {
    return "Morpheme = meaningful language unit.";
  }
  if (term.split(/\s+/).length === 1) {
    return "Link the word \"" + term + "\" to the example on the other side.";
  }
  return "Use the example to anchor what " + term + " means in context.";
}
/* study generation */
function buildFlashcards(termRecords) {
  const records = Array.from(termRecords.values())
    .filter(function (record) {
      return record.definition;
    })
    .sort(function (left, right) {
      return left.term.localeCompare(right.term, undefined, { sensitivity: "base" });
    });

  return records.map(function (record, index) {
    return {
      id: "fc-" + String(index + 1).padStart(3, "0"),
      term: record.term,
      definition: record.definition,
      example: record.example,
      mnemonic: record.mnemonic
    };
  });
}

function buildMcqSet(termRecords) {
  const recordList = Array.from(termRecords.values());
  const recordMap = new Map();
  recordList.forEach(function (record) {
    recordMap.set(normalizeTermKey(record.term), record);
  });

  const selected = [];
  const selectedKeys = new Set();

  MCQ_PRIORITY_TERMS.forEach(function (term) {
    const key = normalizeTermKey(term);
    const record = recordMap.get(key);
    if (record && !selectedKeys.has(key)) {
      selected.push(record);
      selectedKeys.add(key);
    }
  });

  recordList
    .filter(function (record) {
      return !!record.definition && !!record.example && !selectedKeys.has(record.key);
    })
    .sort(function (left, right) {
      return compareRecordsByPriority(left, right);
    })
    .forEach(function (record) {
      if (selected.length < MCQ_TARGET) {
        selected.push(record);
        selectedKeys.add(record.key);
      }
    });

  return selected.slice(0, MCQ_TARGET).map(function (record, index) {
    const distractors = chooseDistractors(record, recordList);
    const ordering = arrangeChoices(record, distractors);
    return {
      id: "mcq-" + String(index + 1).padStart(3, "0"),
      question: buildMcqQuestion(record),
      choices: ordering.choiceObject,
      answer: ordering.answerLetter,
      explanation: buildMcqExplanation(record, ordering, recordMap),
      topic: record.topic,
      difficulty: inferDifficulty(record)
    };
  });
}

function buildFrqSet(termRecords) {
  const recordMap = new Map();
  Array.from(termRecords.values()).forEach(function (record) {
    recordMap.set(record.key, record);
  });

  return FRQ_BLUEPRINTS.reduce(function (prompts, blueprint) {
    const record = recordMap.get(normalizeTermKey(blueprint.concept));
    if (!record || prompts.length >= FRQ_TARGET) {
      return prompts;
    }

    prompts.push({
      id: "frq-" + String(prompts.length + 1).padStart(3, "0"),
      scenario: blueprint.scenario,
      prompt: blueprint.prompt,
      points: 3,
      concept: record.term,
      rubric: [
        {
          part: "A",
          criterion: "Definition",
          points: 1,
          description: "Student correctly identifies and defines " + record.term + ".",
          sample_answer: record.definition
        },
        {
          part: "B",
          criterion: "Application",
          points: 1,
          description: "Student correctly applies " + record.term + " to the scenario.",
          sample_answer: "The response should connect " + record.term + " to the specific behavior described in the scenario."
        },
        {
          part: "C",
          criterion: "Explanation",
          points: 1,
          description: "Student explains how " + record.term + " accounts for the behavior or outcome in the scenario.",
          sample_answer: "A strong explanation should show why " + record.term + " would produce the outcome described in the scenario."
        }
      ]
    });

    return prompts;
  }, []);
}

function buildMcqQuestion(record) {
  const scenario = ensurePeriod(record.example);

  if (record.category === "classical conditioning") {
    return "A psychologist observes the following pattern: " + scenario + " Which concept best explains what is happening?";
  }
  if (record.category === "operant conditioning") {
    return "A teacher uses the following strategy: " + scenario + " Which operant principle is most clearly illustrated?";
  }
  if (record.category === "cognitive development" || record.category === "physical development") {
    return "A developmental psychologist notes that " + lowerCaseFirst(scenario) + " Which concept best fits this observation?";
  }
  if (record.category === "language development") {
    return "A language researcher records the following behavior: " + scenario + " Which concept best explains it?";
  }
  if (record.category === "social-emotional development") {
    return "A developmental researcher observes the following social behavior: " + scenario + " Which concept best explains it?";
  }

  return "A psychology student reads the following scenario: " + scenario + " Which concept is most clearly illustrated?";
}

function buildMcqExplanation(record, ordering, recordMap) {
  const letters = ["A", "B", "C", "D"];
  const parts = [];
  parts.push("The correct answer is " + record.term + " because " + lowerCaseDefinition(record.term, record.definition));

  letters.forEach(function (letter) {
    const choiceTerm = ordering.choiceObject[letter];
    if (choiceTerm === record.term) {
      return;
    }
    const distractor = recordMap.get(normalizeTermKey(choiceTerm));
    if (distractor) {
      parts.push(choiceTerm + " is incorrect because " + lowerCaseDefinition(distractor.term, distractor.definition));
    } else {
      parts.push(choiceTerm + " is incorrect because it does not match the process described in the scenario.");
    }
  });

  return parts.join(" ");
}

function chooseDistractors(record, recordList) {
  const sameCategory = recordList.filter(function (candidate) {
    return candidate.key !== record.key && candidate.category === record.category;
  });
  const chosen = sameCategory.sort(function (left, right) {
    return compareRecordsByPriority(left, right);
  }).slice(0, 3);

  if (chosen.length < 3) {
    recordList.forEach(function (candidate) {
      if (chosen.length >= 3) {
        return;
      }
      if (candidate.key === record.key) {
        return;
      }
      if (chosen.some(function (existing) {
        return existing.key === candidate.key;
      })) {
        return;
      }
      chosen.push(candidate);
    });
  }

  return chosen.slice(0, 3);
}

function arrangeChoices(record, distractors) {
  const letters = ["A", "B", "C", "D"];
  const correctIndex = Number.parseInt(crypto.createHash("sha1").update(record.term).digest("hex").slice(0, 2), 16) % 4;
  const terms = distractors.map(function (distractor) {
    return distractor.term;
  });
  terms.splice(correctIndex, 0, record.term);

  const choiceObject = {};
  letters.forEach(function (letter, index) {
    choiceObject[letter] = terms[index];
  });

  return {
    choiceObject: choiceObject,
    answerLetter: letters[correctIndex]
  };
}

function inferDifficulty(record) {
  const key = record.key;
  if (/assimilation|accommodation|generalization|discrimination|secure attachment|insecure attachment|variable ratio|fixed ratio|variable interval|fixed interval/.test(key)) {
    return "hard";
  }
  if (/classical conditioning|operant conditioning|formal operational|phonemes|morphemes|broca s area|wernicke s area|observational learning|negative reinforcement|positive reinforcement/.test(key)) {
    return "medium";
  }
  return "easy";
}

function compareRecordsByPriority(left, right) {
  return left.term.localeCompare(right.term, undefined, { sensitivity: "base" });
}
/* helpers */
function categorizeTerm(term) {
  const key = normalizeTermKey(term);

  if (/classical conditioning|behaviorism|conditioned|unconditioned|acquisition|extinction|spontaneous recovery|generalization|discrimination|higher order conditioning|preparedness|respondent behavior/.test(key)) {
    return "classical conditioning";
  }
  if (/operant conditioning|law of effect|shaping|reinforcement|punishment|fixed ratio|variable ratio|fixed interval|variable interval|operant chamber|conditioned reinforcers|primary reinforcers|instinctive drift|discriminative stimulus|partial intermittent reinforcement|continuous reinforcement/.test(key)) {
    return "operant conditioning";
  }
  if (/observational learning|modeling|mirror neurons|latent learning|cognitive map|insight learning|social learning theory|cognitive learning/.test(key)) {
    return "social and cognitive learning";
  }
  if (/schemas|assimilation|accommodation|sensorimotor|object permanence|preoperational|egocentric|theory of mind|conservation|concrete operational|formal operational|scaffold|cognition/.test(key)) {
    return "cognitive development";
  }
  if (/language|phonemes|morphemes|grammar|babbling|one word stage|two word stage|telegraphic speech|broca s area|wernicke s area|aphasia|universal grammar|linguistic determinism|linguistic relativism/.test(key)) {
    return "language development";
  }
  if (/attachment|secure attachment|insecure attachment|temperament|basic trust|identity|intimacy|emerging adulthood|social clock|self concept|stranger anxiety|prosocial|relational aggression|aggression|sexual aggression|strange situation/.test(key)) {
    return "social-emotional development";
  }
  if (/gender|sex|sexual orientation|sexuality|gender roles|gender identity|gender typing|intersex|androgyny|testosterone|estrogens|x chromosome|y chromosome|social scripts|social identity/.test(key)) {
    return "gender and sexuality";
  }
  if (/developmental psychology|maturation|teratogens|critical period|imprinting|adolescence|puberty|menarche|spermarche|menopause|primary sex characteristics|secondary sex characteristics|fetal alcohol syndrome/.test(key)) {
    return "physical development";
  }
  return "development and learning";
}

function formatTopic(category) {
  switch (category) {
    case "classical conditioning":
      return "Classical Conditioning";
    case "operant conditioning":
      return "Operant Conditioning";
    case "social and cognitive learning":
      return "Social and Cognitive Learning";
    case "cognitive development":
      return "Cognitive Development";
    case "language development":
      return "Language Development";
    case "social-emotional development":
      return "Social-Emotional Development";
    case "gender and sexuality":
      return "Gender and Sexuality";
    case "physical development":
      return "Physical Development";
    default:
      return "Development and Learning";
  }
}

function getContentDocument(filePath) {
  const outerDoc = createDom(fs.readFileSync(filePath, "utf8")).window.document;
  const levelOneIframe = outerDoc.querySelector("iframe[srcdoc]");
  if (!levelOneIframe) {
    throw new Error("Unable to find first iframe in " + filePath);
  }

  const levelOneDoc = createDom(levelOneIframe.getAttribute("srcdoc")).window.document;
  const levelTwoIframe = levelOneDoc.querySelector("iframe[srcdoc]");
  if (!levelTwoIframe) {
    throw new Error("Unable to find second iframe in " + filePath);
  }

  const levelTwoDoc = createDom(levelTwoIframe.getAttribute("srcdoc")).window.document;
  const shadowTemplate = levelTwoDoc.querySelector("mosaic-book template[shadowrootmode]");
  if (!shadowTemplate) {
    throw new Error("Unable to find book template in " + filePath);
  }

  const contentIframe = shadowTemplate.content.querySelector("iframe[srcdoc]");
  if (!contentIframe) {
    throw new Error("Unable to find content iframe in " + filePath);
  }

  return createDom(contentIframe.getAttribute("srcdoc")).window.document;
}

function createDom(html) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", function () {});
  return new JSDOM(html, { virtualConsole: virtualConsole });
}

function getSectionHeading(sectionEl) {
  const header = Array.from(sectionEl.children).find(function (child) {
    return child.tagName.toLowerCase() === "header";
  });
  const heading = header ? header.querySelector("h1, h2, h3, h4, h5, h6") : sectionEl.querySelector("h1, h2, h3, h4, h5, h6");
  return extractCleanText(heading) || extractCleanText(header) || "Untitled Section";
}

function inferSectionLevel(sectionEl) {
  const className = Array.from(sectionEl.classList || []).find(function (value) {
    return /^sect\d+$/i.test(value);
  });
  if (className) {
    return Number(className.replace(/\D+/g, ""));
  }

  const heading = sectionEl.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading) {
    return Number(heading.tagName.replace(/\D+/g, ""));
  }

  return 2;
}

function extractAsideTitle(asideEl) {
  const header = asideEl.querySelector("header");
  const headerText = extractCleanText(header);
  if (headerText) {
    return headerText.replace(/^Definition:\s*/i, "");
  }

  const ariaLabel = normalizeWhitespace(asideEl.getAttribute("aria-label") || "");
  return ariaLabel.replace(/^Definition:\s*/i, "");
}

function extractAsideBody(asideEl) {
  const clone = asideEl.cloneNode(true);
  Array.from(clone.querySelectorAll("header, template, mosaic-plugin-image-tools")).forEach(function (node) {
    node.remove();
  });

  const listTexts = Array.from(clone.querySelectorAll("ul, ol")).reduce(function (items, list) {
    return items.concat(Array.from(list.querySelectorAll(":scope > li")).map(function (item) {
      return extractCleanText(item);
    }));
  }, []).filter(Boolean);

  if (listTexts.length) {
    return listTexts.join(" ");
  }

  return extractCleanText(clone);
}

function mapCalloutVariant(asideEl, title) {
  const classText = Array.from(asideEl.classList || []).join(" ").toLowerCase();
  const loweredTitle = String(title || "").toLowerCase();

  if (classText.indexOf("warning") !== -1 || loweredTitle.indexOf("warning") !== -1) {
    return "warning";
  }
  if (classText.indexOf("tip") !== -1 || loweredTitle.indexOf("tip") !== -1) {
    return "tip";
  }
  if (loweredTitle.indexOf("remember") !== -1 || loweredTitle.indexOf("point to remember") !== -1) {
    return "memory_hook";
  }
  return "key_concept";
}

function getPluginImageDescription(figureEl) {
  const next = figureEl.nextElementSibling;
  if (!next || next.tagName.toLowerCase() !== "mosaic-plugin-image-tools") {
    return "";
  }

  const template = next.querySelector("template");
  if (!template || !template.content) {
    return "";
  }

  const button = template.content.querySelector("button[aria-description]");
  return button ? normalizeWhitespace(button.getAttribute("aria-description") || "") : "";
}

function createImageBlock(imageEl, caption, extraDescription, context, state) {
  if (isDecorativeImage(imageEl)) {
    return null;
  }

  const src = imageEl.getAttribute("src") || "";
  const alt = normalizeWhitespace(imageEl.getAttribute("alt") || "");
  const relativePath = writeImageAsset(src, context.moduleHeading, caption || alt || extraDescription, state);

  if (!relativePath) {
    return null;
  }

  state.imageCount += 1;

  return {
    type: "image",
    src: relativePath,
    alt: alt,
    caption: caption,
    description: buildImageDescription(caption, alt, extraDescription)
  };
}

function isDecorativeImage(imageEl) {
  const alt = normalizeWhitespace(imageEl.getAttribute("alt") || "");
  const src = imageEl.getAttribute("src") || "";
  const width = Number.parseInt(imageEl.getAttribute("width") || "0", 10);
  const height = Number.parseInt(imageEl.getAttribute("height") || "0", 10);

  if (imageEl.hasAttribute("aria-hidden") || imageEl.getAttribute("role") === "presentation") {
    return true;
  }

  if (/follow link for extended description/i.test(alt)) {
    return true;
  }

  if (!alt && src.startsWith("data:image/svg+xml")) {
    return true;
  }

  if (!alt && width > 0 && height > 0 && width <= 24 && height <= 24) {
    return true;
  }

  return !src;
}

function buildImageDescription(caption, alt, extraDescription) {
  const pieces = [caption, alt, extraDescription].filter(Boolean);
  if (pieces.length) {
    return Array.from(new Set(pieces)).join(" ");
  }
  return "Textbook image from the unit reading.";
}

function writeImageAsset(src, moduleHeading, label, state) {
  if (!src) {
    return "";
  }

  const hash = crypto.createHash("sha1").update(src).digest("hex");
  if (state.imageMap.has(hash)) {
    return state.imageMap.get(hash);
  }

  let fileBuffer;
  let extension = "png";

  if (src.startsWith("data:")) {
    const decoded = decodeDataUri(src);
    fileBuffer = decoded.buffer;
    extension = decoded.extension;
  } else if (/^https?:/i.test(src)) {
    return src;
  } else {
    const absolutePath = path.resolve(state.unitDir, src);
    if (!fs.existsSync(absolutePath)) {
      return "";
    }
    fileBuffer = fs.readFileSync(absolutePath);
    extension = path.extname(absolutePath).replace(/^\./, "") || "png";
  }

  const moduleCode = extractModuleCode(moduleHeading);
  const baseName = slugify(moduleCode + " " + (label || "image")).slice(0, 80) || "image";
  const fileName = baseName + "-" + hash.slice(0, 10) + "." + extension;
  const outputPath = path.join(state.imagesDir, fileName);

  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, fileBuffer);
  }

  const relativePath = toProjectRelativePath(outputPath, state.projectRoot);
  state.imageMap.set(hash, relativePath);
  return relativePath;
}

function decodeDataUri(dataUri) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(dataUri);
  if (!match) {
    return { buffer: Buffer.from(dataUri), extension: "png" };
  }

  const mimeType = match[1].toLowerCase();
  const isBase64 = !!match[2];
  const payload = match[3];
  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer: buffer, extension: mimeTypeToExtension(mimeType) };
}

function mimeTypeToExtension(mimeType) {
  if (mimeType.indexOf("png") !== -1) {
    return "png";
  }
  if (mimeType.indexOf("webp") !== -1) {
    return "webp";
  }
  if (mimeType.indexOf("jpeg") !== -1 || mimeType.indexOf("jpg") !== -1) {
    return "jpg";
  }
  if (mimeType.indexOf("svg") !== -1) {
    return "svg";
  }
  if (mimeType.indexOf("gif") !== -1) {
    return "gif";
  }
  return "png";
}

function looksLikeHeaderRow(rows) {
  if (rows.length < 2) {
    return false;
  }

  const first = rows[0];
  const second = rows[1];
  if (first.length !== second.length) {
    return false;
  }

  const firstLength = first.join(" ").length;
  const secondLength = second.join(" ").length;
  const firstHasHeaderWords = first.some(function (cell) {
    return /term|description|example|examples|fixed|variable|stage|age|type|condition|question/i.test(cell);
  });

  return firstHasHeaderWords || firstLength < secondLength;
}

function extractCleanText(node) {
  if (!node) {
    return "";
  }

  const clone = node.cloneNode(true);
  Array.from(clone.querySelectorAll("template, mosaic-plugin-image-tools, [role='doc-pagebreak']")).forEach(function (child) {
    child.remove();
  });
  return normalizeWhitespace(clone.textContent || "");
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTerm(term) {
  let cleaned = normalizeWhitespace(term)
    .replace(/^[\s"'“”‘’.,:;\/\-—–]+/, "")
    .replace(/[\s"'“”‘’.,:;\/\-—–]+$/, "");

  if (/^\([^()]+\)$/.test(cleaned)) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (cleaned.startsWith("(") && !cleaned.endsWith(")")) {
    cleaned = cleaned.slice(1).trim();
  }

  if (cleaned.endsWith(")") && cleaned.indexOf("(") === -1) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  return cleaned;
}

function looksLikeVocabularyTerm(term) {
  if (!term) {
    return false;
  }

  const normalized = normalizeTermKey(term);
  if (!normalized || NON_VOCABULARY_TERMS.has(normalized)) {
    return false;
  }

  const wordCount = term.split(/\s+/).length;
  if (wordCount > 6 || term.length > 70) {
    return false;
  }

  if (/^(module|unit|figure|table|review|learning targets?|ap exam tip|ap practice|spotlight on|overview video|tip \d+|\d+(?:\.\d+[a-z]?)?)$/i.test(term)) {
    return false;
  }

  if (/video|extended description|follow link|click|tap/i.test(normalized)) {
    return false;
  }

  if (/[?]/.test(term)) {
    return false;
  }

  if (wordCount === 1) {
    if (normalized.length === 1) {
      return false;
    }
    if (normalized.length === 2 && term !== term.toUpperCase()) {
      return false;
    }
  }

  return /[A-Za-z]/.test(term);
}

function normalizeTermKey(term) {
  return cleanTerm(term)
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildTermVariants(term) {
  const variants = new Set();
  const fullKey = normalizeTermKey(term);
  if (fullKey) {
    variants.add(fullKey);
  }

  const baseWithoutParens = normalizeTermKey(term.replace(/\s*\([^)]*\)/g, ""));
  if (baseWithoutParens) {
    variants.add(baseWithoutParens);
  }

  return Array.from(variants);
}

function containsAnyVariant(text, variants) {
  const key = normalizeTermKey(text);
  return variants.some(function (variant) {
    if (variant.length < 3) {
      return false;
    }
    return key.indexOf(variant) !== -1;
  });
}

function splitSentences(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  return normalized.split(/(?<=[.!?])\s+/);
}

function cleanupSentence(text) {
  return normalizeWhitespace(text)
    .replace(/\([^)]*\d{4}[a-z]?(?:[^)]*)\)/g, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
}

function scoreDefinitionSentence(sentence, term, context) {
  const clean = cleanupSentence(sentence);
  const lower = clean.toLowerCase();
  const termKey = normalizeTermKey(term);
  const shortTerm = normalizeTermKey(term.replace(/\s*\([^)]*\)/g, ""));
  let score = 0;

  if (normalizeTermKey(clean).startsWith(termKey) || normalizeTermKey(clean).startsWith(shortTerm)) {
    score += 8;
  }
  if (new RegExp("\\b" + escapeRegExp(shortTerm) + "\\b\\s+(is|are|was|were|refers|means|describes|occurs)", "i").test(normalizeTermKey(clean))) {
    score += 8;
  }
  if (/called|known as|defined as/.test(lower)) {
    score += 4;
  }
  if (context.sourceType === "content") {
    score += 2;
  }

  const wordCount = clean.split(/\s+/).length;
  score -= Math.abs(wordCount - 18) * 0.15;
  return score;
}

function lowerCaseDefinition(term, definition) {
  const cleaned = cleanupSentence(definition);
  if (!cleaned) {
    return "it does not match the scenario.";
  }

  const termPattern = new RegExp("^" + escapeRegExp(cleanTerm(term)) + "\\s+(is|are|was|were)\\s+", "i");
  if (termPattern.test(cleaned)) {
    return normalizeLeadingDefinition(cleaned.replace(termPattern, function (_match, verb) {
      return verb.toLowerCase() + " ";
    }));
  }

  return normalizeLeadingDefinition(cleaned);
}

function normalizeLeadingDefinition(text) {
  const cleaned = cleanupSentence(text);

  if (/^is\b/i.test(cleaned) || /^was\b/i.test(cleaned)) {
    return "it " + cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  if (/^are\b/i.test(cleaned) || /^were\b/i.test(cleaned)) {
    return "they " + cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function stripUnitPrefix(text) {
  return normalizeWhitespace(text).replace(/^Unit\s+\d+\s+/i, "");
}

function extractModuleCode(text) {
  const match = /\b(\d+\.\d+[a-z]?)\b/i.exec(String(text || ""));
  return match ? match[1] : "unit-" + String(Date.now()).slice(-4);
}

function slugify(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSectionId(moduleHeading, sectionHeading, counts) {
  const base = slugify(extractModuleCode(moduleHeading) + "-" + sectionHeading) || "section";
  const next = (counts.get(base) || 0) + 1;
  counts.set(base, next);
  return next === 1 ? base : base + "-" + next;
}

function parseArgs(argv) {
  const args = { unit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--unit") {
      args.unit = Number(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function fileHasMeaningfulContent(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    return Boolean(
      (Array.isArray(parsed.notes) && parsed.notes.length) ||
      (Array.isArray(parsed.flashcards) && parsed.flashcards.length) ||
      (Array.isArray(parsed.mcq) && parsed.mcq.length) ||
      (Array.isArray(parsed.frq) && parsed.frq.length)
    );
  } catch (_error) {
    return true;
  }
}

function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(function (resolve) {
    rl.question(question, function (answer) {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase());
    });
  });
}

function validateResult(result) {
  const serialized = JSON.stringify(result.data);
  JSON.parse(serialized);

  if (!Array.isArray(result.data.notes) || !Array.isArray(result.data.flashcards) || !Array.isArray(result.data.mcq) || !Array.isArray(result.data.frq)) {
    throw new Error("Generated data is missing one or more required arrays.");
  }
}

function buildUnitDataScript(unitNumber, data) {
  return [
    "(function () {",
    "  window.__APP_UNIT_DATA__ = window.__APP_UNIT_DATA__ || {};",
    "  window.__APP_UNIT_DATA__[" + JSON.stringify(unitNumber) + "] = " + JSON.stringify(data, null, 2) + ";",
    "})();",
    ""
  ].join("\n");
}

function lowerCaseFirst(text) {
  const normalized = String(text || "");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function ensurePeriod(text) {
  const trimmed = normalizeWhitespace(text);
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : trimmed + ".";
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toProjectRelativePath(filePath, projectRoot) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFallbackExample(term, category) {
  const key = normalizeTermKey(term);

  switch (key) {
    case "developmental psychology":
      return "A researcher compares how memory, language, and relationships change from infancy through late adulthood.";
    case "maturation":
      return "An infant begins walking after the nervous system has developed enough to support coordinated movement.";
    case "teratogens":
      return "A fetus is exposed to alcohol, which increases the risk of physical and cognitive problems after birth.";
    case "critical period":
      return "A young child is exposed to language early in life, when learning it is especially easy and efficient.";
    case "imprinting":
      return "A newly hatched gosling starts following the first moving figure it sees.";
    case "adolescence":
      return "A 13-year-old is moving through the transitional period between childhood and adulthood.";
    case "puberty":
      return "A middle-school student begins experiencing rapid growth and reproductive maturation.";
    case "menarche":
      return "A girl experiences her first menstrual period.";
    case "spermarche":
      return "A boy experiences his first ejaculation during puberty.";
    case "menopause":
      return "A woman reaches the stage of life when menstrual cycles end.";
    case "primary sex characteristics":
      return "The ovaries or testes mature as part of reproductive development.";
    case "secondary sex characteristics":
      return "Facial hair or breast development appears during puberty.";
    case "gender identity":
      return "A child says, \"I am a girl,\" and sees that identity as part of who she is.";
    case "gender roles":
      return "A child hears that boys should be tough and girls should be gentle.";
    case "gender typing":
      return "A child copies the clothing, games, and chores that same-gender adults model.";
    case "sexual orientation":
      return "A person describes a consistent pattern of romantic attraction toward one sex, another sex, both, or neither.";
    case "sex":
      return "A doctor records biological traits such as chromosomes, hormones, and anatomy.";
    case "gender":
      return "A student reflects on the social and personal meaning of being male, female, both, or neither.";
    case "androgyny":
      return "A student is comfortable showing both assertiveness and emotional warmth.";
    case "intersex":
      return "A newborn has reproductive or anatomical traits that do not fit typical male or female definitions.";
    case "testosterone":
      return "A hormone surge contributes to voice changes and facial hair growth during male puberty.";
    case "estrogens":
      return "Hormonal changes support female reproductive development and menstrual cycles.";
    case "x chromosome":
      return "A sperm carrying an X chromosome contributes to an XX chromosomal combination.";
    case "y chromosome":
      return "A sperm carrying a Y chromosome contributes to an XY chromosomal combination.";
    case "schemas":
      return "A toddler calls every four-legged pet a dog because that is the mental category already in place.";
    case "assimilation":
      return "A child sees a zebra and calls it a horse because it fits an existing category.";
    case "accommodation":
      return "After learning that a zebra is not a horse, a child creates a new category for zebras.";
    case "sensorimotor stage":
      return "An infant learns by touching, looking, grasping, and moving around the environment.";
    case "object permanence":
      return "A baby searches under a blanket for a toy that was just hidden there.";
    case "preoperational stage":
      return "A preschooler thinks a taller glass holds more juice than a shorter, wider one.";
    case "egocentric":
      return "A young child assumes everyone else sees the world from the same point of view.";
    case "theory of mind":
      return "A child realizes that a friend can hold a belief that is different from reality.";
    case "conservation":
      return "A school-age child understands that the amount of water stays the same after it is poured into a new glass.";
    case "concrete operational stage":
      return "An 8-year-old can reason logically about real objects and events but struggles more with abstract hypotheticals.";
    case "formal operational":
      return "A teenager compares several hypothetical solutions to an ethical dilemma.";
    case "language":
      return "A child combines meaningful sounds and rules to communicate with family members.";
    case "phonemes":
      return "A student notices that changing /b/ to /p/ changes the word from \"bat\" to \"pat.\"";
    case "morphemes":
      return "Adding -ed to a verb changes its meaning to the past tense.";
    case "grammar":
      return "A child learns that word order matters when forming a sentence.";
    case "babbling stage":
      return "A baby repeats sounds like \"ba-ba-ba\" before speaking meaningful words.";
    case "one word stage":
      return "A toddler says \"milk\" to request a drink.";
    case "two word stage":
      return "A toddler says \"more juice\" to express a simple idea.";
    case "telegraphic speech":
      return "A young child says \"Daddy go work\" without using extra small words.";
    case "broca s area":
      return "After a stroke, a patient knows what to say but struggles to produce fluent speech.";
    case "wernicke s area":
      return "A patient speaks fluently but the words do not make sense and language is hard to understand.";
    case "aphasia":
      return "A brain injury disrupts a person's ability to understand or produce language.";
    case "universal grammar ug":
      return "A child quickly picks up sentence rules without needing formal lessons in grammar.";
    case "linguistic determinism":
      return "Someone argues that the language a person speaks completely determines what that person can think.";
    case "linguistic relativism":
      return "A student suggests that language influences how people notice and describe the world.";
    case "attachment":
      return "A frightened toddler reaches for a caregiver and calms down when held.";
    case "secure attachment":
      return "A toddler explores a room, becomes upset when a caregiver leaves, and quickly calms when the caregiver returns.";
    case "insecure attachment":
      return "A toddler becomes highly distressed or avoids contact when a caregiver returns after a separation.";
    case "strange situation":
      return "A researcher observes how infants react when caregivers leave and then return to the room.";
    case "temperament":
      return "One baby is naturally calm while another is easily upset, even before much learning occurs.";
    case "basic trust":
      return "An infant who is consistently comforted begins to expect caregivers to be reliable.";
    case "identity":
      return "A teenager explores beliefs, career plans, and values while deciding who to become.";
    case "intimacy":
      return "A young adult builds a close, committed relationship with a romantic partner.";
    case "emerging adulthood":
      return "A 20-year-old tries different jobs and living arrangements before settling into long-term adult roles.";
    case "social clock":
      return "An adult feels pressure to marry by the age their culture considers typical.";
    case "self concept":
      return "A child describes themselves as funny, smart, and good at soccer.";
    case "stranger anxiety":
      return "A baby cries when an unfamiliar adult suddenly approaches.";
    case "prosocial":
      return "A child shares crayons to help a classmate finish a project.";
    case "relational aggression":
      return "A student spreads rumors to damage someone else's friendships.";
    case "aggression":
      return "A child shoves another child during an argument over a toy.";
    case "sexual aggression":
      return "A person ignores another person's clear lack of consent during a sexual situation.";
    case "learning":
      return "A student becomes better at solving algebra problems after repeated practice.";
    case "associative learning":
      return "A dog learns that the sound of a can opener predicts food.";
    case "classical conditioning":
      return "A dog begins salivating at a bell after the bell is repeatedly paired with food.";
    case "behaviorism":
      return "A psychologist focuses only on observable actions instead of private thoughts or feelings.";
    case "conditioned stimulus cs":
      return "A bell that once meant nothing starts signaling that food is coming.";
    case "conditioned response cr":
      return "A dog salivates to a bell after learning that the bell predicts food.";
    case "unconditioned stimulus ucs":
      return "Food naturally causes a dog to salivate without any prior learning.";
    case "unconditioned response ucr":
      return "A dog automatically salivates when food is placed in its mouth.";
    case "acquisition":
      return "A dog hears a bell paired with food over several trials and gradually starts salivating to the bell.";
    case "extinction":
      return "A bell keeps ringing without food, and the dog's salivation gradually fades.";
    case "spontaneous recovery":
      return "After a rest period, a dog's extinguished salivation response briefly returns when the bell rings again.";
    case "generalization":
      return "After being bitten by one dog, a child becomes nervous around other similar dogs.";
    case "discrimination":
      return "A dog salivates to one tone that predicts food but not to a different tone that does not.";
    case "higher order conditioning":
      return "After a light is repeatedly paired with a food-predicting bell, the light alone triggers salivation.";
    case "preparedness":
      return "A person quickly develops a nausea response to a food but not to a flashing light that appeared at the same time.";
    case "operant conditioning":
      return "A child cleans a room more often after receiving allowance for doing it.";
    case "law of effect":
      return "A cat repeats a lever-pressing behavior that once led to food.";
    case "shaping":
      return "A trainer rewards a dog for each small step that gets closer to rolling over on command.";
    case "positive reinforcement":
      return "A teacher praises a student for turning in homework, and the student starts doing it more often.";
    case "negative reinforcement":
      return "Buckling a seat belt stops an annoying beeping sound, so a driver buckles up faster next time.";
    case "punishment":
      return "Touching a hot pan causes pain, making a child less likely to touch it again.";
    case "primary reinforcers":
      return "Food given to a hungry rat increases lever pressing.";
    case "conditioned reinforcers":
      return "Tokens earned in class motivate behavior because they can later be traded for privileges.";
    case "continuous reinforcement schedule":
      return "A trainer gives a dog a treat every single time it sits on command during early training.";
    case "fixed ratio schedules":
      return "A coffee shop gives one free drink after every tenth purchase.";
    case "variable ratio schedules":
      return "A slot machine pays off after an unpredictable number of plays.";
    case "fixed interval schedules":
      return "A student checks the online gradebook right before weekly grades are posted.";
    case "variable interval schedules":
      return "A person keeps checking a phone because new messages arrive at unpredictable times.";
    case "operant chamber":
      return "A rat is placed in a Skinner box where pressing a bar delivers food.";
    case "discriminative stimulus":
      return "A restaurant's OPEN sign tells customers that entering now will lead to service.";
    case "instinctive drift":
      return "A trained raccoon begins rubbing coins together instead of depositing them after many trials.";
    case "observational learning":
      return "A child learns a dance move by watching an older sibling perform it.";
    case "modeling":
      return "A teenager copies an admired athlete's pregame routine.";
    case "mirror neurons":
      return "A viewer winces while watching someone else accidentally cut a finger.";
    case "latent learning":
      return "A student can suddenly find the fastest route across campus after many casual walks, even without prior rewards.";
    case "cognitive map":
      return "A driver navigates a neighborhood using a mental layout of the streets.";
    case "insight learning":
      return "A chimp suddenly stacks boxes to reach a banana after seeming stuck for several minutes.";
    case "social learning theory":
      return "A child becomes more aggressive after watching an admired model act aggressively and get rewarded.";
    default:
      if (category === "classical conditioning") {
        return "A learner starts connecting two events that repeatedly occur together.";
      }
      if (category === "operant conditioning") {
        return "A behavior changes because its consequences make it more or less likely to happen again.";
      }
      if (category === "cognitive development") {
        return "A child's thinking changes as the child matures and gains experience.";
      }
      if (category === "language development") {
        return "A child shows a change in speech or language understanding over time.";
      }
      if (category === "social-emotional development") {
        return "A person's relationships or emotions shift in a way that reflects developmental change.";
      }
      if (category === "physical development") {
        return "A person shows a change in the body or in biological maturation across the lifespan.";
      }
      return "A student encounters a situation that illustrates " + term + " in everyday life.";
  }
}
