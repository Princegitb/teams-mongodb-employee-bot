# AI-Powered Employee Database Assistant (NLP & MongoDB)

A state-of-the-art AI-powered chatbot assistant that allows users to ask questions about employee data in plain natural language. The backend uses the offline-friendly **Wink NLP** framework to perform tokenization, lemmatization, custom entity extraction (for names and departments), and intent classification (using Jaccard similarity and keyword boosting). It maps parsed user intent directly to Mongoose queries and returns interactive, human-readable responses.

---

## Key Features

- **Local NLP Pipeline:** Powered by **Wink NLP** (`wink-eng-lite-web-model`), eliminating external API request delays or usage caps.
- **Dynamic Entity Extraction:** Dynamically registers employee names and department entities fetched from the MongoDB database to improve query accuracy.
- **Intent Classification:** Classifies queries (e.g., counting, listing, timeline, or salary analytics) using Jaccard similarity combined with heuristic keyword boosting.
- **Interactive UI:** A premium, glassmorphic dark-themed chat interface with click-to-query suggestion chips and a highly responsive design.
- **Auto-Seeding:** Automatically seeds the database with sample employee records if the collection is empty.

---

## Tech Stack

- **Frontend:** HTML5, CSS3 (Vanilla Glassmorphic Design), Vanilla JavaScript (ES6)
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas, Mongoose
- **NLP Engine:** Wink NLP (`wink-nlp`, `wink-eng-lite-web-model`)

---

## Project Structure

```text
teams-mongodb-bot/
├── models/
│   └── Employee.js          # Mongoose schema definition
├── public/
│   ├── index.html           # Premium UI structure
│   ├── style.css            # Dark glassmorphic stylesheet
│   └── script.js            # Frontend interactivity & suggestions
├── services/
│   ├── entityExtractor.js   # Wink NLP custom entity trainer
│   ├── nlpService.js        # Main NLP pipeline, Jaccard classifier, and query mapper
│   ├── parser.js            # Legacy rule-based query parser (kept for backwards-compatibility)
│   └── trainer.js           # Utterance preprocessor & intent training data
├── .env                     # Local environment configurations
├── package.json             # Dependencies and scripts
└── server.js                # Express app entry point, seeding, and API endpoints
```

---

## Setup & Installation

### 1. Clone the Project

Download or clone the files to your working directory.

### 2. Configure Environment Variables

Create a `.env` file in the root of the project:

```env
PORT=3005
MONGODB_URI=mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/companyDB?retryWrites=true&w=majority
```

*Note: Replace `<username>`, `<password>`, and `<your-cluster>` with your actual MongoDB Atlas cluster credentials.*

### 3. Install Dependencies

Install all required Node.js packages:

```bash
npm install
```

### 4. Run the Application

Start the development server with hot-reloading (via nodemon):

```bash
npm run dev
```

---

## Supported Natural Language Queries

You can type conversational queries into the chat box or use the quick suggestion chips:

1. **Count Query:**
   - *How many employees are there?*
   - *What is the total employee count?*
2. **List All:**
   - *List all employees.*
   - *Show all employee records.*
3. **Department Filters (Dynamic):**
   - *Show employees in the IT department.*
   - *Who works in Finance?*
4. **Salary Analytics:**
   - *What is the average salary?*
   - *Show the highest paid employee.*
   - *Find the lowest salary.*
   - *What is the salary of Prince Kumar?*
5. **Timeline Queries:**
   - *Who joined recently?*
   - *List recent hires.*
