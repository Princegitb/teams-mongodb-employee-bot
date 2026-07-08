# AI-Powered Teams Employee Database Bot (Wink NLP & MongoDB)

A conversational AI assistant integrated with Microsoft Teams that allows users to query, search, and analyze employee records in plain natural language. The backend uses the offline-friendly **Wink NLP** framework to perform tokenization, lemmatization, custom entity extraction (for names, departments, designations, and cities), and intent classification (using Jaccard similarity and keyword boosting). It maps parsed user queries directly to MongoDB query filters and aggregations.

The project features a modular two-tier server architecture and supports offline testing using the **Teams App Test Tool**.

---

## Key Features

- **23 Conversational Operations:** Supports simple counting, advanced multi-attribute profile search, range queries, department/employee comparison metrics, and salary analytics.
- **Intelligent Typo Correction:** Implements a Levenshtein distance fuzzy matching did-you-mean helper that recommends the top 3 closest employee names if an exact search match fails.
- **Dynamic Entity Matching:** Dynamically trains the Wink NLP engine on startup using employee names, departments, and cities fetched from MongoDB Atlas.
- **Zero-Azure Local Debugging:** Fully configured with the Teams App Test Tool (`teamsapptester`) for offline sandbox testing.
- **Auto-Seeding:** Automatically seeds your MongoDB database with sample records if the collection is empty.

---

## Project Structure

```text
teams-mongodb-bot/
├── appPackage/
│   ├── manifest.json        # Teams app configuration manifest
│   ├── color.png            # Bot color icon placeholder
│   └── outline.png          # Bot outline icon placeholder
├── models/
│   └── Employee.js          # Mongoose database schema
├── services/
│   ├── entityExtractor.js   # Dynamic custom entity learning (Wink NLP)
│   ├── nlpService.js        # NLP pipeline, intent overrides, and tag parsers
│   ├── parser.js            # Router bridge
│   └── trainer.js           # Preprocessed lemma sets & training corpus
├── .env                     # Local environment variable configuration
├── .gitignore               # Configured to exclude node_modules & credentials
├── bot.js                   # Teams ActivityHandler (forwards messages to Express)
├── index.js                 # Teams Bot webhook server (Port 3978)
├── package.json             # NPM dependencies & running scripts
└── server.js                # Main Express server & MongoDB query mapper (Port 3006)
```

---

## Setup & Local Testing

### 1. Clone the Project
Place the project files inside your working directory.

### 2. Configure Environment Variables
Create a `.env` file in the root of the project:
```env
# Server Port (Express Backend)
PORT=3006

# MongoDB Connection String (replace with your Atlas credentials)
MONGODB_URI=mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/companyDB?retryWrites=true&w=majority

# Microsoft Teams Bot Configurations
BOT_PORT=3978
BACKEND_URL=http://127.0.0.1:3006/chat

# Azure Credentials (keep empty for local emulator/test-tool testing)
MicrosoftAppId=
MicrosoftAppPassword=
MicrosoftAppTenantId=
MicrosoftAppType=MultiTenant
```

### 3. Install Dependencies
Run this command in the project directory to install all packages:
```bash
npm install
```

### 4. Run the Servers (Open 3 Terminals)

- **Terminal 1 (Express Backend):**
  ```bash
  npm run dev
  ```
- **Terminal 2 (Teams Bot Webhook):**
  ```bash
  npm run bot-dev
  ```
- **Terminal 3 (Teams App Test Tool):**
  ```bash
  npm run test-tool
  ```

### 5. Start Testing in the Browser
Open your browser and navigate to:
**[http://localhost:56150](http://localhost:56150)**

You will see a simulated Microsoft Teams chat sandbox environment where you can query your bot.

---

## Supported Natural Language Operations

Try sending any of these queries in your test tool:

| Operation Category | Example Chat Queries |
| :--- | :--- |
| **Greetings & Help** | `"hii"`, `"good morning"`, `"help"`, `"what can you do?"` |
| **Search & Counts** | `"How many employees are there?"`, `"List all employees"` |
| **Lookup by Attributes** | `"Find employee with email bob.s@company.com"`, `"Who has phone number 1234567894?"` |
| **City-wise Filtering** | `"Show employees from Chicago"`, `"List employees of Delhi"` |
| **Headcount Analytics** | `"Employee count by department"`, `"Which department has the most employees?"` |
| **Salary Ranges** | `"salary above 70000"`, `"salary between 50000 and 80000"` |
| **Salary Leaders** | `"Top 5 highest paid employees"`, `"Top 3 lowest salary employees"` |
| **Department Analytics** | `"Average salary in HR"`, `"Highest salary in Finance"` |
| **Employee ID Check** | `"Does EMP005 exist?"`, `"Is EMP025 a valid employee?"` |
| **Contact Retrieval** | `"Rahul's email"`, `"Phone number of Alice"` |
| **Head-to-head Comparisons** | `"Compare Alice Johnson and Bob Smith"`, `"Compare HR and IT"` |
| **Fuzzy Spell Checks** | `"Show Princ"` *(will recommend Prince)*, `"Search Bob Smth"` |
| **Directory Directories** | `"List all departments"`, `"List job roles"` |
