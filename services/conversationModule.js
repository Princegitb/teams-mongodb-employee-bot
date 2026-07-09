/**
 * services/conversationModule.js
 *
 * General Conversation Layer — handles non-database conversational interactions.
 *
 * Architecture:
 *   User Message
 *       |
 *       +---> conversationModule.handle(message)
 *                   |
 *                   +-- { handled: true,  reply: '...' }  --> send to user
 *                   |
 *                   +-- { handled: false }               --> pass to DB pipeline
 *
 * Modules:
 *   1. Greeting    — Hi, Hello, Good Morning, etc.
 *   2. Goodbye     — Bye, See you, Take care, etc.
 *   3. Thank You   — Thanks, Appreciate it, etc.
 *   4. Identity    — Who are you?, What is your name?, etc.
 *   5. Help        — What can you do?, Features, Commands, etc.
 *   6. Small Talk  — How are you?, What's up?, etc.
 *
 * Rules:
 *   - No external APIs or LLMs used.
 *   - All pattern matching is rule-based using keyword arrays.
 *   - Responses are stored separately from database intents.
 *   - Does NOT touch MongoDB.
 */

// ============================================================
// 1. GREETING MODULE
// ============================================================

const GREETING_PATTERNS = [
  'hi', 'hii', 'hiii', 'hiiii',
  'hello', 'hey', 'hola', 'yo',
  'hi there', 'hello there', 'hey there',
  'good morning', 'good afternoon', 'good evening', 'good night',
  'greetings', 'whats up', 'sup'
];

// Maps specific greeting prefixes to a specific contextual reply
const GREETING_RESPONSES = {
  'good morning': 'Good Morning! 🌞 Hope you have a wonderful day. How can I help you today?',
  'good afternoon': 'Good Afternoon! ☀️ Hope your day is going well. How can I assist you?',
  'good evening': 'Good Evening! 🌇 How may I assist you today?',
  'good night': 'Good Night! 🌙 Take care. See you next time!',
};

// Default greeting responses (rotated randomly for variety)
const DEFAULT_GREETING_REPLIES = [
  'Hi! 👋 How can I help you today?',
  'Hello! 👋 How can I assist you?',
  'Hey there! 👋 What would you like to know?',
  'Hi there! 😊 I am ready to help. What are you looking for?'
];

// ============================================================
// 2. GOODBYE MODULE
// ============================================================

const GOODBYE_PATTERNS = [
  'bye', 'goodbye', 'good bye',
  'see you', 'see ya', 'see you later', 'see you soon',
  'take care', 'take care bye',
  'exit', 'quit', 'close', 'done', 'that will be all'
];

const GOODBYE_REPLIES = [
  'Bye! 👋 Have a great day!',
  'Goodbye! See you soon. 😊',
  'Take care! Feel free to return anytime.',
  'See you again! 👋',
  'Goodbye! Have a wonderful day ahead!'
];

// ============================================================
// 3. THANK YOU MODULE
// ============================================================

const THANKYOU_PATTERNS = [
  'thanks', 'thank you', 'thank you so much',
  'thankyou', 'ty', 'thx', 'thnx', 'thnks',
  'appreciate it', 'much appreciated', 'greatly appreciated',
  'thanks a lot', 'thanks buddy', 'thanks man', 'thanks a ton',
  'that was helpful', 'you were helpful', 'great help'
];

const THANKYOU_REPLIES = [
  "You're welcome! 😊",
  'Happy to help!',
  'My pleasure! 😊',
  'Anytime! Feel free to ask more questions.',
  "Glad I could help! Don't hesitate to ask if you need anything else."
];

// ============================================================
// 4. IDENTITY MODULE
// ============================================================

const IDENTITY_PATTERNS = [
  'who are you', 'what are you',
  'what is your name', 'whats your name',
  'introduce yourself', 'tell me about yourself',
  'what do you do', 'are you a bot', 'are you human',
  'who made you', 'who created you', 'who built you',
];

const IDENTITY_REPLY =
  `🤖 **I am the AI Employee Assistant!**\n\n` +
  `I can help you search and analyze employee information directly from the company database.\n\n` +
  `Here is what I can do:\n\n` +
  `• 🔍 Search employees by name, ID, email, or phone\n` +
  `• 🏢 Filter by department or designation\n` +
  `• 📍 Find employees by city\n` +
  `• 💰 Salary analytics (average, highest, lowest, ranges)\n` +
  `• 📊 Department comparisons and statistics\n` +
  `• 🔄 Compare two employees side by side\n` +
  `• 🔡 Sort and list employees alphabetically\n\n` +
  `Type **help** anytime to see all available commands.`;

// ============================================================
// 5. HELP / CAPABILITIES MODULE
// ============================================================

const HELP_PATTERNS = [
  'help', 'info', 'information', 'support',
  'what can you do', 'what can u do',
  'features', 'commands', 'available commands',
  'show commands', 'list commands', 'what are your features',
  'capabilities', 'what do you support', 'menu', 'options', 'list all the features u can perform', 'list all the features you can perform',
];

const HELP_REPLY =
  `ℹ️ **AI Employee Assistant — Available Commands:**\n\n` +
  `**🔍 Employee Search**\n` +
  `• "Who is Alice Johnson?"\n` +
  `• "Show details of EMP004"\n` +
  `• "Find employee with email bob.s@company.com"\n\n` +
  `**📊 Employee Count**\n` +
  `• "How many employees are there?"\n` +
  `• "Total headcount"\n\n` +
  `**🏢 Department & Designation Search**\n` +
  `• "Show IT employees"\n` +
  `• "List all managers"\n` +
  `• "Software Engineers in Seattle"\n\n` +
  `**📍 City-wise Search**\n` +
  `• "Show employees from Chicago"\n` +
  `• "List employees in Mumbai"\n\n` +
  `**📞 Contact Information**\n` +
  `• "What is Alice's email?"\n` +
  `• "Phone number of Bob Smith"\n\n` +
  `**💰 Salary Analytics**\n` +
  `• "Average salary"\n` +
  `• "Highest paid employee"\n` +
  `• "Salary above 70000"\n` +
  `• "Employees earning between 60000 and 80000"\n` +
  `• "Top 5 highest paid employees"\n\n` +
  `**📈 Department Statistics**\n` +
  `• "Average salary in HR"\n` +
  `• "Which department has the most employees?"\n\n` +
  `**🔄 Comparisons**\n` +
  `• "Compare Alice and Bob"\n` +
  `• "Compare HR and IT"\n\n` +
  `**🔡 Sorting & Directories**\n` +
  `• "List employees alphabetically"\n` +
  `• "List all departments"\n` +
  `• "Show all job roles"`;

// ============================================================
// 6. SMALL TALK MODULE
// ============================================================

const SMALLTALK_PATTERNS = [
  'how are you', 'how are you doing', 'how r u', 'how are u',
  'hows it going', "how's it going",
  'how are things', 'how are things going',
  'whats up', "what's up",
  'hows your day', "how's your day",
  'hows everything', "how's everything",
  'you ok', 'are you ok', 'you good', 'are you good'
];

const SMALLTALK_REPLIES = [
  "I'm doing great! 😊 Ready to help you find any employee information.",
  "I'm doing well. Thanks for asking! 😊 What can I help you with today?",
  "Everything is running smoothly! 🚀 How can I assist you today?",
  "Feeling productive! 😄 What employee information are you looking for?",
  "All systems go! 💪 How can I help you today?"
];

// ============================================================
// 7. ACKNOWLEDGEMENT MODULE
// ============================================================
// Handles affirmative/neutral short responses like "ok", "okay",
// "alright", "sure", "got it", "noted", "cool", "fine", etc.

const ACKNOWLEDGEMENT_PATTERNS = [
  'ok', 'okay', 'ok ok',
  'alright', 'alright then',
  'sure', 'sure thing',
  'got it', 'got it thanks',
  'noted', 'noted thanks',
  'cool', 'cool thanks',
  'fine', 'sounds good',
  'understood', 'makes sense',
  'nice', 'great', 'perfect',
  'awesome', 'wow', 'ohh', 'oh ok', 'oh okay', 'ohh ok',
  'roger', 'roger that',
  'yep', 'yup', 'yes', 'yeah', 'ya', 'yaa'
];

const ACKNOWLEDGEMENT_REPLIES = [
  'Great! 😊 Is there anything else I can help you with?',
  'Alright! Let me know if you need anything else.',
  'Sure! Feel free to ask me anything about the employee database.',
  'Got it! 👍 What else can I help you with?',
  'Perfect! Ask me anything anytime. 😊'
];

// ============================================================
// HELPER UTILITIES
// ============================================================

/**
 * Normalizes a message for pattern matching.
 * Lowercases, trims, and removes punctuation.
 * @param {string} msg - Raw user input
 * @returns {string} Normalized string
 */
function normalize(msg) {
  return msg
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"!]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Picks a random item from an array.
 * @param {Array} arr
 * @returns {*} A random element
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Checks if the normalized message exactly matches or starts with any of the given patterns.
 * @param {string} normalized - Normalized message
 * @param {string[]} patterns - Array of keyword patterns
 * @returns {boolean}
 */
function matchesAny(normalized, patterns) {
  return patterns.some(pattern => normalized === pattern || normalized.startsWith(pattern));
}

// ============================================================
// MAIN HANDLER — exported function
// ============================================================

/**
 * Determines if a message is a general conversational message.
 * If it is, returns the appropriate reply.
 * If it is not, returns { handled: false } to allow the DB pipeline to handle it.
 *
 * @param {string} message - Raw user input from Teams
 * @returns {{ handled: boolean, reply?: string }}
 */
function handle(message) {
  if (!message || typeof message !== 'string') {
    return { handled: false };
  }

  const normalized = normalize(message);

  // --- Module 1: Greetings ---
  if (matchesAny(normalized, GREETING_PATTERNS)) {
    // Check for specific time-based greetings first (good morning, good evening, etc.)
    const specificGreeting = Object.keys(GREETING_RESPONSES).find(key => normalized.startsWith(key));
    if (specificGreeting) {
      return { handled: true, reply: GREETING_RESPONSES[specificGreeting] };
    }
    // Default greeting
    return { handled: true, reply: pickRandom(DEFAULT_GREETING_REPLIES) };
  }

  // --- Module 2: Goodbye ---
  if (matchesAny(normalized, GOODBYE_PATTERNS)) {
    return { handled: true, reply: pickRandom(GOODBYE_REPLIES) };
  }

  // --- Module 3: Thank You ---
  if (matchesAny(normalized, THANKYOU_PATTERNS)) {
    return { handled: true, reply: pickRandom(THANKYOU_REPLIES) };
  }

  // --- Module 4: Identity ---
  if (matchesAny(normalized, IDENTITY_PATTERNS)) {
    return { handled: true, reply: IDENTITY_REPLY };
  }

  // --- Module 5: Help / Capabilities ---
  if (matchesAny(normalized, HELP_PATTERNS)) {
    return { handled: true, reply: HELP_REPLY };
  }

  // --- Module 6: Small Talk ---
  if (matchesAny(normalized, SMALLTALK_PATTERNS)) {
    return { handled: true, reply: pickRandom(SMALLTALK_REPLIES) };
  }

  // --- Module 7: Acknowledgement ---
  if (matchesAny(normalized, ACKNOWLEDGEMENT_PATTERNS)) {
    return { handled: true, reply: pickRandom(ACKNOWLEDGEMENT_REPLIES) };
  }

  // Not a conversational message — pass to DB layer
  return { handled: false };
}

module.exports = { handle };
