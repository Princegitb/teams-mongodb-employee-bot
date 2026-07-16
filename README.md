# AI-Powered Teams Employee Database Bot (Wink NLP, MongoDB & Gemini AI)

A conversational AI assistant integrated with Microsoft Teams that allows users to query, search, and analyze employee records in plain natural language. The backend uses the offline-friendly **Wink NLP** framework for fast, rule-based database query mapping, combined with **Google Gemini 3.5 Flash** as a fallback for conversational small talk, typo corrections, and complex generation tasks (like drafting emails).

The project features a modular, unified server architecture and supports automatic cloud deployment to **Azure App Service** via **GitHub Actions**.

---

## Key Features

- **Hybrid AI Architecture:** Uses a rule-based engine (`wink-nlp`) to perform database queries with zero AI latency, falling back to **Gemini 3.5 Flash** for unstructured conversational queries, typos, and text generation.
- **Dynamic Entity Matching:** Dynamically trains the Wink NLP engine on startup using employee names, departments, designations, and cities fetched from MongoDB Atlas.
- **Context-Aware Gemini Fallback:** Automatically forwards the database schema and context to Gemini for requests that fail standard rule-based parsing.
- **Selective Directory Listing:** When users run `"list all"`, the bot prints only the **names** of the employees to protect privacy.
- **Specific Attribute Retrieval:** If users query a single employee detail (e.g., *"What is Prince's salary?"* or *"Alice's email"*), the bot responds with **only the requested detail** instead of the entire profile card.
- **Command Bypass for Content Generation:** Requests starting with keywords like `write`, `create`, `draft`, `email`, or `generate` bypass the local database parser and route directly to Gemini for smart document generation (e.g., drafting welcome emails).
- **Zero-Azure Local Debugging:** Fully configured with the **Teams App Test Tool** (`teamsapptester`) for offline sandbox testing.

---

## Project Structure

```text
teams-mongodb-bot/
├── .github/workflows/       # GitHub Actions deployment configurations
├── appPackage/
│   ├── manifest.json        # Teams app configuration manifest
│   ├── color.png            # Bot color icon (192x192 pixels)
│   └── outline.png          # Bot outline icon (32x32 pixels, transparent)
├── models/
│   └── Employee.js          # Mongoose database schema
├── services/
│   ├── conversationModule.js# General conversation module (Greetings, small talk, etc.)
│   ├── entityExtractor.js   # Dynamic custom entity learning (Wink NLP)
│   ├── nlpService.js        # NLP pipeline, intent overrides, and tag parsers
│   ├── parser.js            # Router bridge (Facade pattern)
│   └── trainer.js           # Preprocessed lemma sets & training corpus
├── .env                     # Local environment variable configuration
├── bot.js                   # Teams ActivityHandler (forwards messages to Express)
├── index.js                 # Teams Bot webhook server (Local debug - Port 3978)
├── package.json             # NPM dependencies & running scripts
└── server.js                # Main Express server, Webhook listener & MongoDB query mapper (Port 8080)
```

---

## Setup & Local Testing

### 1. Configure Environment Variables

Create a `.env` file in the root of the project:

```env
# Server Port (Express Backend & Unified Bot Gateway)
PORT=3006

# MongoDB Connection String
MONGODB_URI=mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/companyDB

# Microsoft Teams Bot Configurations
BOT_PORT=3978
BACKEND_URL=http://127.0.0.1:3006/chat

# Gemini API Key
GEMINI_API_KEY=your_google_gemini_api_key

# Azure Credentials (optional for local test-tool)
MicrosoftAppId=your_app_id
MicrosoftAppPassword=your_app_password
MicrosoftAppTenantId=your_tenant_id
MicrosoftAppType=SingleTenant
```

### 2. Install Dependencies

Run this command in the project directory to install all packages:

```bash
npm install
```

### 3. Run the Servers (Local Testing - Open 3 Terminals)

* **Terminal 1 (Express Backend & Unified Server):**
  ```bash
  npm run dev
  ```

* **Terminal 2 (Local Bot Webhook Gateway):**
  ```bash
  npm run bot-dev
  ```

* **Terminal 3 (Teams App Test Tool):**
  ```bash
  npm run test-tool
  ```

### 4. Start Testing in the Browser

Open your browser and navigate to:
**[http://localhost:56150](http://localhost:56150)**

---

## Production Cloud Deployment (Azure App Service)

This project is deployed to **Azure App Services** in the **Korea Central** region (which is fully supported by the Gemini API, bypassing East Asia location restrictions).

### 1. Configure App Service Settings
Add the following Application Settings under the configuration of your Azure App Service:
* `MicrosoftAppId`
* `MicrosoftAppPassword` (Entra ID Client Secret value)
* `MicrosoftAppTenantId`
* `MicrosoftAppType` (`SingleTenant`)
* `MONGODB_URI`
* `GEMINI_API_KEY`

### 2. Automated CI/CD Deployment
Any push to the `main` branch of this repository triggers the **GitHub Actions** deployment pipeline. The deployment configuration automatically packages the Node.js project, uploads it to Azure, installs dependencies, and restarts the web app.

```bash
git add .
git commit -m "commit message"
git push origin main
```

---

## Supported Natural Language Operations

Try sending any of these queries in Microsoft Teams:

| Operation Category | Example Chat Queries |
| :--- | :--- |
| **Greetings & Help** | `"hii"`, `"good morning"`, `"help"`, `"who are you?"` |
| **Search & Counts** | `"How many employees are there?"`, `"List all employees"` *(displays names only)* |
| **Lookup by Attributes** | `"Find employee with email bob.s@company.com"`, `"Who is located in Chicago?"` |
| **Salary Analytics** | `"Average salary"`, `"Highest paid employee"`, `"Salary above 70000"` |
| **Comparisons** | `"Compare Alice Johnson and Bob Smith"`, `"Compare HR and IT"` |
| **Fuzzy Spell Checks** | `"Show details of Prinve"` *(Gemini corrects typo to Prince and lists details)* |
| **Specific Detail Check** | `"What is Prince's salary?"` *(displays only his salary)* |
| **Content Generation** | `"Create a welcome email for Prince using his details"` *(Gemini drafts a custom email)* |
