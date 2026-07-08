const { nlp, its } = require('./entityExtractor');
// Stop words to filter out for intent matching to focus on core semantic tokens

const STOP_WORDS = new Set(['is', 'are', 'be', 'the', 'a', 'an', 'of', 'to', 'in', 'for', 'at', 'on', 'with', 'about', 'here', 'me']);
// The training dataset mapping intents to sample natural language utterances
const trainingCorpus = [
  {
    intent: 'employee_count',
    utterances: [
      'how many employees are there',
      'what is the total employee count',
      'number of employees',
      'count of employees',
      'show total employees',
      'employee headcount',
      'how many workers do we have',
      'total headcount',
      'how many people work here',
      'count how many people',
      'how many people are employed',
      'staff count',
      'total staff size',
      'number of staff',
      'how big is the team',
      'how many employees',
      'count employees',
      'active employee count'
    ]
  },
  {
    intent: 'list_all',
    utterances: [
      'list all employees',
      'show all employees',
      'view all employees',
      'all employees',
      'get all workers',
      'show everyone',
      'list of all employees',
      'show everybody',
      'list all people',
      'show all staff',
      'list staff members',
      'show me the list of employees',
      'print employee list',
      'who are all the employees',
      'get list of workers',
      'show all people'
    ]
  },
  {
    intent: 'employees_by_department',
    utterances: [
      'show employees in department',
      'list IT employees',
      'show everyone in HR',
      'who works in Finance',
      'list employees in sales department',
      'marketing department workers',
      'find engineering employees',
      'how many people work in HR',
      'who is in IT department',
      'people in Finance',
      'list HR staff',
      'who belongs to Marketing department',
      'show engineering team',
      'who is working in Finance',
      'get all sales employees'
    ]
  },
  {
    intent: 'average_salary',
    utterances: [
      'average salary of employees',
      'what is the average salary',
      'avg salary',
      'mean salary',
      'what is the average pay',
      'how much is average wage',
      'typical salary here',
      'mean earnings',
      'what is the average compensation',
      'average salary of all employees',
      'average pay',
      'mean salary in company'
    ]
  },
  {
    intent: 'highest_salary',
    utterances: [
      'who earns the most',
      'which employee has the highest salary',
      'maximum salary in the company',
      'who has the biggest paycheck',
      'most paid employee',
      'who gets the highest pay',
      'highest salary',
      'highest paid',
      'highest earner',
      'max salary',
      'who is the highest paid person',
      'who gets the most money',
      'richest employee',
      'who earn maximum',
      'who earns maximum',
      'who got maximum salary'
    ]
  },
  {
    intent: 'lowest_salary',
    utterances: [
      'who earns the least',
      'minimum salary of employee',
      'least paid worker',
      'who has the lowest salary',
      'who gets the minimum pay',
      'lowest salary',
      'lowest paid',
      'minimum compensation',
      'min salary',
      'who gets the least salary',
      'who gets the smallest paycheck',
      'least salary',
      'who earn minimum',
      'who earns minimum',
      'who got minimum salary'
    ]
  },
  {
    intent: 'employee_by_name',
    utterances: [
      'show details of Prince',
      'tell me about Rahul',
      'who is Bob Smith',
      'what is the salary of Alice Johnson',
      'information about George',
      'search for employee named Diana',
      'details of Priyanshu',
      'get profile of Amit',
      'search Rahul',
      'tell me about Priya',
      'who is Amit',
      'show details of Bob',
      'find employee Alice',
      'who is Diana Prince'
    ]
  },
  {
    intent: 'employees_by_designation',
    utterances: [
      'show all managers',
      'who is the office administrator',
      'list software engineers',
      'show me the senior engineers',
      'who works as an analyst',
      'find lead architects',
      'get list of accountants',
      'show executives',
      'who is developer here',
      'list all managers',
      'show developers',
      'who has designation of manager'
    ]
  },
  {
    intent: 'employee_lookup_attr',
    utterances: [
      'find employee with email',
      'search employee with email',
      'who has phone number',
      'find employee with phone number',
      'search employee',
      'who has email',
      'find employee from city',
      'search employee from city'
    ]
  },
  {
    intent: 'city_filter',
    utterances: [
      'show employees from',
      'list employees in Mumbai',
      'who works from Bangalore',
      'show employees in city',
      'list employees of Delhi',
      'employees belonging to Delhi'
    ]
  },
  {
    intent: 'department_stats',
    utterances: [
      'how many employees are in HR',
      'employee count by department',
      'which department has the most employees',
      'count of employees in IT',
      'department having maximum employees',
      'which department has maximum staff'
    ]
  },
  {
    intent: 'salary_range',
    utterances: [
      'employees earning above',
      'employees earning below',
      'employees earning between',
      'salary above 70000',
      'salary below 50000',
      'salary between 60000 and 80000',
      'earn more than',
      'earn less than',
      'who earns above',
      'who earns below'
    ]
  },
  {
    intent: 'top_n_employees',
    utterances: [
      'top 5 highest paid employees',
      'top 3 lowest salary employees',
      'show top 10 earners',
      'top 10 highest salary',
      'top 5 earners',
      'lowest 3 salaries',
      'top 3 paid workers'
    ]
  },
  {
    intent: 'dept_salary_analytics',
    utterances: [
      'average salary in HR',
      'highest salary in Finance',
      'lowest salary in IT',
      'avg salary of IT department',
      'mean salary in marketing',
      'maximum pay in sales'
    ]
  },
  {
    intent: 'id_validation',
    utterances: [
      'does EMP005 exist',
      'is EMP010 a valid employee',
      'exists employee',
      'validate employee id',
      'check employee id'
    ]
  },
  {
    intent: 'contact_info',
    utterances: [
      'email of Alice',
      'phone number of Alice',
      'contact details of Bob',
      'whats the email of Rahul',
      'whats the phone number of Amit'
    ]
  },
  {
    intent: 'department_directory',
    utterances: [
      'list all departments',
      'show available departments',
      'what departments do we have',
      'show all unique departments',
      'list departments'
    ]
  },
  {
    intent: 'designation_directory',
    utterances: [
      'show all designations',
      'list job roles',
      'what roles do we have',
      'show all unique designations',
      'list job titles'
    ]
  },
  {
    intent: 'multi_condition_search',
    utterances: [
      'managers in HR',
      'software engineers in Delhi',
      'developers earning above 80000',
      'HR employees earning below 60000',
      'finance analysts in Chicago',
      'engineers earning more than 90000'
    ]
  },
  {
    intent: 'compare_employees',
    utterances: [
      'compare Rahul and Aman',
      'who earns more Alice or Bob',
      'compare Alice and Bob',
      'who has higher salary Alice or Charlie',
      'comparison between Bob and Charlie'
    ]
  },
  {
    intent: 'compare_departments',
    utterances: [
      'compare HR and IT',
      'which department pays more',
      'comparison between Finance and Marketing',
      'which department has more employees'
    ]
  },
  {
    intent: 'alphabetical_sorting',
    utterances: [
      'list employees alphabetically',
      'show employees from A to Z',
      'sort employees by name descending',
      'list employees sorted',
      'sort employees from Z to A'
    ]
  }
];

/**
 * Preprocesses a sentence: tokenizes, lowercases, lemmatizes, and removes stop words.
 * 
 * @param {string} text - The input text query
 * @returns {Array<string>} Array of normalized (lemmatized) semantic tokens
 */
function preprocessText(text) {
  if (!text) return [];
  const doc = nlp.readDoc(text.toLowerCase());

  // Extract lemmatized tokens and filter out stop words or punctuation
  return doc.tokens()
    .filter(token => {
      const isPunct = token.out(its.type) === 'punctuation';
      const wordValue = token.out(its.lemma);
      return !isPunct && !STOP_WORDS.has(wordValue) && wordValue.length > 0;
    })
    .map(token => token.out(its.lemma));
}

/**
 * Processes the training corpus into a trained index of intents and lemma sets.
 * 
 * @returns {Array<Object>} Processed training data
 */
function getPreparedTrainingData() {
  return trainingCorpus.map(item => {
    const preparedUtterances = item.utterances.map(utterance => {
      return preprocessText(utterance);
    });
    return {
      intent: item.intent,
      preparedUtterances
    };
  });
}

module.exports = {
  preprocessText,
  getPreparedTrainingData
};
