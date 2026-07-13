/**
 * services/nlpService.js
 * 
 * The main NLP Runtime Service that integrates tokenization, custom entity extraction,
 * and intent classification via Jaccard similarity.
 */

const { nlp, its, loadCustomEntities } = require('./entityExtractor');
const { preprocessText, getPreparedTrainingData } = require('./trainer');

// Configuration constants
const CONFIDENCE_THRESHOLD = 0.35; // Lowered to 0.35 to be more permissive with natural variations

// Keep the prepared training data in memory
let trainedDataset = [];

// Interrogatives and action verbs that are often capitalized at sentence-start
// and incorrectly classified as proper nouns (PROPN) by tokenizer
const ACTION_VERBS_AND_PRONOUNS = new Set([
  'show', 'list', 'tell', 'find', 'who', 'search', 'get', 'view', 'details', 'info', 'about', 'salary', 'avg', 'average', 'is', 'are', 'be'
]);

/**
 * Initializes the NLP engine by loading database records as entities and training intents
 * 
 * @param {Array<Object>} employees - List of employees from MongoDB
 */
async function initializeNLP(employees) {
  try {
    // 1. Train custom entities with names and departments from the DB
    loadCustomEntities(employees);

    // 2. Preprocess and load intent utterances into memory
    trainedDataset = getPreparedTrainingData();
    console.log('[NLP Service] NLP Engine initialized and trained successfully.');
  } catch (error) {
    console.error('[NLP Service] Error initializing NLP engine:', error);
  }
}

/**
 * Calculates Jaccard similarity between two token sets.
 * Jaccard index = (size of intersection) / (size of union)
 * 
 * @param {Set<string>} setA 
 * @param {Set<string>} setB 
 * @returns {number} Jaccard similarity score [0, 1]
 */
function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Classifies the intent of a preprocessed user query by scoring against trained utterances.
 * 
 * @param {Array<string>} queryTokens - Lemmatized tokens of the user query
 * @returns {Object} { intent: string, confidence: number }
 */
function classifyIntent(queryTokens) {
  if (queryTokens.length === 0) {
    return { intent: 'unknown', confidence: 0 };
  }

  const querySet = new Set(queryTokens);
  let bestIntent = 'unknown';
  let maxConfidence = 0;

  // Compare query against each trained intent and its sample utterances
  trainedDataset.forEach(group => {
    group.preparedUtterances.forEach(utteranceTokens => {
      const utteranceSet = new Set(utteranceTokens);
      let similarity = calculateJaccardSimilarity(querySet, utteranceSet);

      // --- KEYWORD BOOSTING & TIE-BREAKING ---
      // If we have strong indicator words, boost the similarity to break ties
      if (group.intent === 'highest_salary') {
        const highIndicators = ['maximum', 'max', 'highest', 'most', 'biggest', 'top'];
        if (highIndicators.some(word => querySet.has(word))) {
          similarity += 0.25;
        }
      }
      if (group.intent === 'lowest_salary') {
        const lowIndicators = ['minimum', 'min', 'lowest', 'least', 'smallest', 'bottom'];
        if (lowIndicators.some(word => querySet.has(word))) {
          similarity += 0.25;
        }
      }

      if (similarity > maxConfidence) {
        maxConfidence = similarity;
        bestIntent = group.intent;
      }
    });
  });

  // Apply confidence threshold
  if (maxConfidence < CONFIDENCE_THRESHOLD) {
    return { intent: 'unknown', confidence: maxConfidence };
  }

  return { intent: bestIntent, confidence: maxConfidence };
}

/**
 * Processes the raw user message, extracts intent and entities (name, department)
 * 
 * @param {string} message - User query message
 * @returns {Object} Structured JSON output containing intent, entities, and confidence
 */
function processMessage(message) {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { intent: 'unknown', confidence: 0 };
  }

  // 1. Regex check for Employee ID (e.g. emp011, EMP001)
  const empIdMatch = message.match(/\b(emp\d+)\b/i);
  let idMatch = empIdMatch ? empIdMatch[1].toUpperCase() : null;

  // 2. Parse the document using wink-nlp
  const doc = nlp.readDoc(message);

  // 3. Preprocess/lemmatize the message for intent classification
  const queryTokens = preprocessText(message);

  // 4. Classify intent
  let classification = classifyIntent(queryTokens);

  // 5. Extract entities using wink-nlp's learned custom entities
  const customEntities = doc.customEntities().out(its.detail);

  const allNames = [];
  const allDepts = [];
  const allDesignations = [];
  const allCities = [];

  customEntities.forEach(ent => {
    if (ent.type === 'department') {
      allDepts.push(ent.value.toUpperCase());
    } else if (ent.type === 'name') {
      allNames.push(ent.value);
    } else if (ent.type === 'designation') {
      allDesignations.push(ent.value);
    } else if (ent.type === 'city') {
      allCities.push(ent.value);
    }
  });

  let department = allDepts[0] || null;
  let name = allNames[0] || idMatch;
  let designation = allDesignations[0] || null;
  let city = allCities[0] || null;

  // 6. Regex matchers for emails and phone numbers
  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/i);
  const email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = message.match(/\b\d{10}\b/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  // 7. Extract integers / numbers
  const numbers = [];
  doc.tokens().each(t => {
    if (t.out(its.pos) === 'NUM') {
      const val = parseInt(t.out(its.value), 10);
      if (!isNaN(val)) numbers.push(val);
    }
  });

  // 8. Range operators (above/below/between)
  let rangeOperator = null;
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('between') || (lowerMsg.includes('from') && lowerMsg.includes('to') && numbers.length >= 2)) {
    rangeOperator = 'between';
  } else if (lowerMsg.includes('above') || lowerMsg.includes('over') || lowerMsg.includes('more than') || lowerMsg.includes('greater than') || lowerMsg.includes('higher than') || lowerMsg.includes('earning above') || lowerMsg.includes('pay above')) {
    rangeOperator = 'above';
  } else if (lowerMsg.includes('below') || lowerMsg.includes('under') || lowerMsg.includes('less than') || lowerMsg.includes('lower than') || lowerMsg.includes('earning below') || lowerMsg.includes('pay below')) {
    rangeOperator = 'below';
  }

  // 9. Sorting indicators (asc/desc)
  let sortDirection = null;
  if (lowerMsg.includes('desc') || lowerMsg.includes('z to a') || lowerMsg.includes('z-a') || lowerMsg.includes('reverse') || lowerMsg.includes('descending')) {
    sortDirection = 'desc';
  } else if (lowerMsg.includes('asc') || lowerMsg.includes('a to z') || lowerMsg.includes('a-z') || lowerMsg.includes('alphabetic') || lowerMsg.includes('ascending') || lowerMsg.includes('sort')) {
    sortDirection = 'asc';
  }

  // Fallback heuristics for entity extraction if wink-nlp custom entity is not found
  // Executed BEFORE overrides to ensure robust multi-condition parsing
  if (!department) {
    const depts = ['hr', 'it', 'finance', 'sales', 'marketing', 'engineering', 'development'];
    const matchedDept = queryTokens.find(token => depts.includes(token));
    if (matchedDept) {
      department = matchedDept.toUpperCase();
    }
  }

  if (!designation) {
    const knownDesignations = ['manager', 'engineer', 'developer', 'analyst', 'specialist', 'architect', 'accountant', 'executive', 'administrator', 'recruiter'];
    const matched = queryTokens.find(token => knownDesignations.includes(token));
    if (matched) {
      designation = matched;
    }
  }

  if (!city) {
    const knownCities = ['york', 'francisco', 'chicago', 'boston', 'angeles', 'miami', 'seattle', 'austin', 'dallas', 'delhi', 'mumbai', 'bangalore'];
    const matched = queryTokens.find(token => knownCities.includes(token));
    if (matched) {
      city = matched;
    }
  }

  // Override / refine intent based on extracted entities
  if (allDepts.length >= 2) {
    classification = { intent: 'compare_departments', confidence: 1.0 };
  } else if (allNames.length >= 2) {
    classification = { intent: 'compare_employees', confidence: 1.0 };
  } else if (email || phone || idMatch) {
    classification = { intent: 'employee_lookup_attr', confidence: 1.0 };
  } else if (department && (classification.intent === 'average_salary' || classification.intent === 'highest_salary' || classification.intent === 'lowest_salary' || classification.intent === 'dept_salary_analytics')) {
    // Override salary queries with department to department stats
    classification = { intent: 'dept_salary_analytics', confidence: 1.0 };
  } else if (department && classification.intent === 'employee_count') {
    // How many employees in IT -> just give stats/count, not list
    classification = { intent: 'department_stats', confidence: 1.0 };
  } else if (
    (department && designation) ||
    (designation && city) ||
    (department && city) ||
    (rangeOperator && (department || designation || city))
  ) {
    // Multi-condition search (e.g. software engineers in Seattle, managers in HR, employees in Delhi earning above 50000)
    classification = { intent: 'multi_condition_search', confidence: 1.0 };
  } else if (designation && (classification.intent === 'list_all' || classification.intent === 'unknown' || classification.intent === 'employee_by_name' || classification.intent === 'employee_count')) {
    classification = { intent: 'employees_by_designation', confidence: 0.9 };
  } else if (department && (classification.intent === 'list_all' || classification.intent === 'unknown' || (classification.intent === 'employee_by_name' && !name))) {
    classification = { intent: 'employees_by_department', confidence: 0.9 };
  } else if (name && (classification.intent === 'list_all' || classification.intent === 'unknown')) {
    classification = { intent: 'employee_by_name', confidence: 0.9 };
  } else if (city && (classification.intent === 'list_all' || classification.intent === 'unknown' || classification.intent === 'employee_count')) {
    classification = { intent: 'city_filter', confidence: 0.9 };
  }

  if (classification.intent === 'employee_by_name' && !name) {
    const propnTokens = doc.tokens()
      .filter(t => {
        const isPropn = t.out(its.pos) === 'PROPN';
        const val = t.out(its.value).toLowerCase();
        return isPropn && !ACTION_VERBS_AND_PRONOUNS.has(val);
      })
      .map(t => t.out(its.value));

    if (propnTokens.length > 0) {
      name = propnTokens.join(' ');
    } else {
      const nameTokens = doc.tokens()
        .filter(t => t.out(its.type) === 'word' && t.out(its.pos) !== 'VERB')
        .map(t => t.out(its.value));

      const filtered = nameTokens.filter(w => !ACTION_VERBS_AND_PRONOUNS.has(w.toLowerCase()) && !['who', 'is', 'about', 'details', 'tell', 'show', 'salary', 'info'].includes(w.toLowerCase()));
      if (filtered.length > 0) {
        name = filtered.join(' ');
      }
    }
  }

  // Fallback did-you-mean heuristic: Force employee_by_name if intent is unknown but matches search pattern
  if (classification.intent === 'unknown') {
    const searchVerbs = ['show', 'find', 'search', 'who is', 'tell me about', 'get', 'details of', 'info on'];
    const cleanMsg = message.toLowerCase().trim();

    let matchedVerb = searchVerbs.find(verb => cleanMsg.startsWith(verb));
    if (matchedVerb) {
      classification = { intent: 'employee_by_name', confidence: 0.8 };
      const idx = cleanMsg.indexOf(matchedVerb) + matchedVerb.length;
      name = message.substring(idx).trim();
    } else {
      const wordCount = message.split(/\s+/).length;
      if (wordCount <= 2 && !department && !designation && !city && !email && !phone && numbers.length === 0) {
        classification = { intent: 'employee_by_name', confidence: 0.8 };
        name = message.trim();
      }
    }
  }

  return {
    intent: classification.intent,
    confidence: parseFloat(classification.confidence.toFixed(2)),
    department,
    name,
    designation,
    city,
    email,
    phone,
    numbers,
    rangeOperator,
    sortDirection,
    allNames,
    allDepts,
    allCities,
    allDesignations
  };
}

module.exports = {
  initializeNLP,
  processMessage
};
