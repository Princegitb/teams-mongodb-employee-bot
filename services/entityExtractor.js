const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');

// Initialize wink-nlp with the English language model
const nlp = winkNLP(model);
const { its, as } = nlp;

/**
 * Dynamically registers departments and employee names from the database
 * as custom entities in wink-nlp.
 * 
 * @param {Array<Object>} employees - Array of employee documents from MongoDB
 */
function loadCustomEntities(employees) {
  const patterns = [];

  // 1. Gather all unique departments and normalize them
  const departments = new Set(['hr', 'it', 'finance', 'sales', 'marketing', 'engineering']); // defaults
  employees.forEach(emp => {
    if (emp.department) {
      const dept = emp.department.toLowerCase().trim();
      departments.add(dept);
      departments.add(dept + 's');
    }
  });

  // Add department matching patterns (e.g. "[hr|it|finance...]")
  const deptPatternStr = `[${Array.from(departments).join('|')}]`;
  patterns.push({
    name: 'department',
    patterns: [deptPatternStr]
  });

  // 2. Gather employee name patterns
  const namePatterns = new Set();
  employees.forEach(emp => {
    if (emp.name) {
      const fullName = emp.name.trim();
      const parts = fullName.split(/\s+/);

      // Add full name pattern (exact match)
      namePatterns.add(fullName);

      // Add first name pattern if it's long enough and unique
      if (parts[0] && parts[0].length > 2) {
        namePatterns.add(parts[0]);
      }
    }
  });

  // Add employee name patterns to patterns array
  if (namePatterns.size > 0) {
    patterns.push({
      name: 'name',
      patterns: Array.from(namePatterns)
    });
  }

  // 3. Gather employee designation patterns
  const designationPatterns = new Set(['manager', 'engineer', 'developer', 'analyst', 'specialist', 'architect', 'accountant', 'executive', 'administrator']); // default keywords
  // Add plurals for defaults
  Array.from(designationPatterns).forEach(d => {
    designationPatterns.add(d + 's');
    designationPatterns.add(d + 'es');
  });

  employees.forEach(emp => {
    if (emp.designation) {
      const design = emp.designation.toLowerCase().trim();
      designationPatterns.add(design);
      designationPatterns.add(design + 's');
      designationPatterns.add(design + 'es');

      // Also add individual words if they are long/significant
      design.split(/\s+/).forEach(word => {
        if (word.length > 3 && !['senior', 'lead', 'junior', 'associate'].includes(word)) {
          designationPatterns.add(word);
          designationPatterns.add(word + 's');
          designationPatterns.add(word + 'es');
        }
      });
    }
  });

  if (designationPatterns.size > 0) {
    patterns.push({
      name: 'designation',
      patterns: Array.from(designationPatterns)
    });
  }

  // 4. Gather unique cities from database and add defaults
  const cities = new Set(['new york', 'san francisco', 'chicago', 'boston', 'los angeles', 'miami', 'seattle', 'austin', 'dallas', 'mumbai', 'delhi', 'bangalore']);
  employees.forEach(emp => {
    if (emp.city) {
      const city = emp.city.toLowerCase().trim();
      cities.add(city);
      cities.add(city + 's');
    }
  });

  patterns.push({
    name: 'city',
    patterns: Array.from(cities)
  });

  // Train/learn these custom entities in wink-nlp
  nlp.learnCustomEntities(patterns);
  console.log(`[NLP Entity Extractor] Learned ${departments.size} departments, ${namePatterns.size} name patterns, ${designationPatterns.size} designation patterns, and ${cities.size} cities.`);
}

module.exports = {
  nlp,
  its,
  as,
  loadCustomEntities
};
