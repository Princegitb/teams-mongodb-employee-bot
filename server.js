const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log('[Gemini Initializer] API Key present in environment:', !!process.env.GEMINI_API_KEY);

const Employee = require('./models/Employee');
const { parseMessage } = require('./services/parser');
const { initializeNLP } = require('./services/nlpService');
const conversation = require('./services/conversationModule');
const {
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  CloudAdapter
} = require('botbuilder');
const { TeamsBot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Initialize credentials factory using Microsoft App variables from .env
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant'
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

// Create the CloudAdapter that handles communication with Azure Bot Service / Microsoft Teams
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Catch-all for unhandled adapter turn errors
adapter.onTurnError = async (context, error) => {
  console.error(`\n [Teams Bot Server Error] Unhandled error: ${error}`);
  try {
    await context.sendTraceActivity(
      'OnTurnError Trace',
      `${error}`,
      'https://www.botframework.com/schemas/error',
      'TurnError'
    );
  } catch (traceError) {
    console.error('Failed to send trace activity:', traceError);
  }
  await context.sendActivity('The bot encountered an error or bug during processing.');
};

// Instantiate our Teams Bot
const bot = new TeamsBot();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sample Data to seed if Database is empty
const sampleEmployees = [
  { employeeId: 'EMP001', name: 'Alice Johnson', department: 'HR', designation: 'HR Manager', salary: 75000, email: 'alice.j@company.com', phone: '1234567890', city: 'New York' },
  { employeeId: 'EMP002', name: 'Bob Smith', department: 'IT', designation: 'Senior Engineer', salary: 95000, email: 'bob.s@company.com', phone: '1234567891', city: 'San Francisco' },
  { employeeId: 'EMP003', name: 'Charlie Brown', department: 'Finance', designation: 'Financial Analyst', salary: 68000, email: 'charlie.b@company.com', phone: '1234567892', city: 'Chicago' },
  { employeeId: 'EMP004', name: 'Diana Prince', department: 'IT', designation: 'Lead Architect', salary: 120000, email: 'diana.p@company.com', phone: '1234567893', city: 'Boston' },
  { employeeId: 'EMP005', name: 'Ethan Hunt', department: 'HR', designation: 'HR Specialist', salary: 52000, email: 'ethan.h@company.com', phone: '1234567894', city: 'Los Angeles' },
  { employeeId: 'EMP006', name: 'Fiona Gallagher', department: 'Finance', designation: 'Accountant', salary: 60000, email: 'fiona.g@company.com', phone: '1234567895', city: 'Chicago' },
  { employeeId: 'EMP007', name: 'George Clark', department: 'Sales', designation: 'Sales Executive', salary: 48000, email: 'george.c@company.com', phone: '1234567896', city: 'Miami' },
  { employeeId: 'EMP008', name: 'Hannah Abbott', department: 'IT', designation: 'Junior Developer', salary: 58000, email: 'hannah.a@company.com', phone: '1234567897', city: 'Seattle' },
  { employeeId: 'EMP009', name: 'Ian Malcolm', department: 'Marketing', designation: 'Marketing Director', salary: 110000, email: 'ian.m@company.com', phone: '1234567898', city: 'Austin' },
  { employeeId: 'EMP010', name: 'Julia Roberts', department: 'Sales', designation: 'Sales Manager', salary: 85000, email: 'julia.r@company.com', phone: '1234567899', city: 'Dallas' }
];

// Seed Database function
async function seedDatabase() {
  try {
    const count = await Employee.countDocuments();
    if (count === 0) {
      console.log('Employee database is empty. Seeding sample employees...');
      await Employee.insertMany(sampleEmployees);
      console.log('Successfully seeded 10 sample employee records!');
    } else {
      console.log(`Database already has ${count} employee records. Skipping seeding.`);
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Connect to MongoDB Atlas
if (!MONGODB_URI) {
  console.error('CRITICAL: MONGODB_URI environment variable is not defined in .env');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB Atlas successfully.');
    await seedDatabase();

    // Initialize the NLP service with employee names and departments from the database
    const employees = await Employee.find({});
    await initializeNLP(employees);
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
  });

// POST /chat Endpoint
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ reply: 'Please provide a valid question message.' });
  }

  // Check MongoDB connection status
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ reply: 'Database is currently offline. Please try again later.' });
  }

  // ── General Conversation Layer ──────────────────────────────────────────
  // Check if the message is a general conversational query (greeting, goodbye,
  // thank you, identity, help, small talk) BEFORE hitting the DB pipeline.
  // If handled, return the reply immediately — MongoDB is never queried.
  const conversationResult = conversation.handle(message);
  if (conversationResult.handled) {
    return res.json({ reply: conversationResult.reply });
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    // 1. Analyze user message via NLP parser service
    let parsed = parseMessage(message);

    // Check if user is asking to write/draft/generate content (e.g. an email) using employee data.
    // If so, override local intent to 'unknown' to bypass local DB card formatting and let Gemini handle it.
    const normalizedMsg = message.toLowerCase();
    const isGenerationTask = /\b(write|draft|email|congratulate|congratulations|template|message|compose)\b/i.test(normalizedMsg);
    if (isGenerationTask) {
      parsed.intent = 'unknown';
    }

    const {
      intent, department, name, designation, city, email, phone,
      numbers, rangeOperator, sortDirection, allNames, allDepts,
      allCities, allDesignations, confidence
    } = parsed;

    console.log(`[NLP Analysis] Input: "${message}" -> Intent: ${intent} (confidence: ${confidence || 0})`);

    let reply = '';
    let dbCount = await Employee.countDocuments();

    // Handle empty database edge case
    if (dbCount === 0 && intent !== 'unknown') {
      return res.json({ reply: 'The employee database is currently empty. Please populate it with records first.' });
    }

    // 2. Map intent to MongoDB query
    switch (intent) {
      case 'employee_count': {
        reply = `There are **${dbCount}** employees currently registered in the database.`;
        break;
      }

      case 'list_all': {
        const query = Employee.find({}, 'name');
        if (sortDirection === 'desc') {
          query.sort({ name: -1 });
        } else {
          query.sort({ name: 1 });
        }
        const employees = await query;
        if (employees.length === 0) {
          reply = 'No employees found.';
        } else {
          reply = `Here is the list of all employees:\n\n` +
            employees.map(emp => `• **${emp.name}**`).join('\n\n');
        }
        break;
      }

      case 'employees_by_department': {
        const query = Employee.find({ department: new RegExp(`^${department}$`, 'i') });
        if (sortDirection === 'desc') {
          query.sort({ name: -1 });
        } else {
          query.sort({ name: 1 });
        }
        const employees = await query;
        if (employees.length === 0) {
          reply = `No employees found in the **${department}** department.`;
        } else {
          reply = `Here are the employees in the **${department}** department:\n\n` +
            employees.map(emp => `• **${emp.name}** - ${emp.designation} (Salary: $${emp.salary.toLocaleString()})`).join('\n\n');
        }
        break;
      }

      case 'employees_by_designation': {
        const query = Employee.find({ designation: new RegExp(designation, 'i') });
        if (sortDirection === 'desc') {
          query.sort({ name: -1 });
        } else {
          query.sort({ name: 1 });
        }
        const employees = await query;
        if (employees.length === 0) {
          reply = `No employees found with the designation "${designation}".`;
        } else {
          reply = `Here are the employees with the designation **${designation}**:\n\n` +
            employees.map(emp => `• **${emp.name}** - ${emp.designation} (${emp.department})`).join('\n\n');
        }
        break;
      }

      case 'average_salary': {
        const result = await Employee.aggregate([
          { $group: { _id: null, avgSalary: { $avg: '$salary' } } }
        ]);
        if (result.length === 0) {
          reply = 'Cannot calculate average salary (no data available).';
        } else {
          const avg = Math.round(result[0].avgSalary);
          reply = `The average salary across all employees is **$${avg.toLocaleString()}** per year.`;
        }
        break;
      }

      case 'highest_salary': {
        const employee = await Employee.findOne().sort({ salary: -1 });
        if (!employee) {
          reply = 'No employee data found.';
        } else {
          reply = `The highest paid employee is **${employee.name}** (${employee.designation} in ${employee.department}) earning **$${employee.salary.toLocaleString()}** per year.`;
        }
        break;
      }

      case 'lowest_salary': {
        const employee = await Employee.findOne().sort({ salary: 1 });
        if (!employee) {
          reply = 'No employee data found.';
        } else {
          reply = `The lowest paid employee is **${employee.name}** (${employee.designation} in ${employee.department}) earning **$${employee.salary.toLocaleString()}** per year.`;
        }
        break;
      }

      case 'employee_by_name': {
        const employees = await Employee.find({
          $or: [
            { name: new RegExp(name, 'i') },
            { employeeId: new RegExp(`^${name}$`, 'i') }
          ]
        });

        if (employees.length === 0) {
          // Fallback to Gemini AI since direct name query yielded no database records (e.g. false positive or conversation)
          try {
            const allEmployees = await Employee.find({});
            const employeeContext = allEmployees.map(emp => ({
              employeeId: emp.employeeId,
              name: emp.name,
              department: emp.department,
              designation: emp.designation,
              salary: emp.salary,
              email: emp.email,
              phone: emp.phone,
              city: emp.city
            }));

            const response = await ai.models.generateContent({
              model: 'gemini-3.5-flash',
              contents: `You are an AI Employee Assistant.
You have access to the employee database below:

${JSON.stringify(employeeContext, null, 2)}

User's Input: "${message}"

Rules:
1. Provide a direct, friendly, and helpful response.
2. If the user's input is general conversation, feedback, or a reaction (like "good", "oh good", "ok", "nice"), reply naturally.
3. If they were looking for a specific employee name that does not exist in the database, politely state that no employee was found matching that name.
4. If the user asks for a specific attribute of an employee (such as salary, email, phone, city, department, or designation), output ONLY that requested attribute and the employee's name. Do NOT list other details (like department, designation, or ID) unless they explicitly asked for all details.
5. Format your response using clean Markdown.`
            });

            reply = response.text;
          } catch (error) {
            console.error('[Gemini Fallback Error]:', error);
            reply = `No exact match found for "${name}".`;
          }
        } else if (employees.length === 1) {
          const emp = employees[0];
          const queryLower = message.toLowerCase();
          
          if (queryLower.includes('salary')) {
            reply = `The salary of **${emp.name}** is **$${emp.salary.toLocaleString()}/year**.`;
          } else if (queryLower.includes('email')) {
            reply = `The email address of **${emp.name}** is **${emp.email}**.`;
          } else if (queryLower.includes('phone') || queryLower.includes('number') || queryLower.includes('contact')) {
            reply = `The phone number of **${emp.name}** is **${emp.phone}**.`;
          } else if (queryLower.includes('city') || queryLower.includes('location') || queryLower.includes('live')) {
            reply = `**${emp.name}** is located in **${emp.city}**.`;
          } else if (queryLower.includes('department') || queryLower.includes('dept')) {
            reply = `**${emp.name}** works in the **${emp.department}** department.`;
          } else if (queryLower.includes('designation') || queryLower.includes('role') || queryLower.includes('job') || queryLower.includes('position')) {
            reply = `The designation of **${emp.name}** is **${emp.designation}**.`;
          } else if (queryLower.includes('id')) {
            reply = `The employee ID of **${emp.name}** is **${emp.employeeId}**.`;
          } else {
            reply = `Here are the details for **${emp.name}**:\n\n` +
              `• **Employee ID:** ${emp.employeeId}\n` +
              `• **Designation:** ${emp.designation}\n` +
              `• **Department:** ${emp.department}\n` +
              `• **Email:** ${emp.email}\n` +
              `• **Phone:** ${emp.phone}\n` +
              `• **City:** ${emp.city}\n` +
              `• **Salary:** $${emp.salary.toLocaleString()}/year\n`;
          }
        } else {
          reply = `I found multiple employees matching "${name}":\n\n` +
            employees.map(emp => `• **${emp.name}** (${emp.designation} in ${emp.department})`).join('\n\n') +
            `\n\nPlease be more specific (e.g. search for full name).`;
        }
        break;
      }

      case 'employee_lookup_attr': {
        const queryCond = {};
        if (email) {
          queryCond.email = new RegExp(`^${email}$`, 'i');
        } else if (phone) {
          queryCond.phone = phone;
        } else if (city) {
          queryCond.city = new RegExp(`^${city}$`, 'i');
        } else if (name) {
          queryCond.$or = [
            { name: new RegExp(name, 'i') },
            { employeeId: new RegExp(`^${name}$`, 'i') }
          ];
        }

        const employees = await Employee.find(queryCond);
        if (employees.length === 0) {
          reply = `Could not find any employee matching those parameters.`;
        } else if (employees.length === 1) {
          const emp = employees[0];
          reply = `Here are the details for **${emp.name}**:\n\n` +
            `• **Employee ID:** ${emp.employeeId}\n` +
            `• **Designation:** ${emp.designation}\n` +
            `• **Department:** ${emp.department}\n` +
            `• **Email:** ${emp.email}\n` +
            `• **Phone:** ${emp.phone}\n` +
            `• **City:** ${emp.city}\n` +
            `• **Salary:** $${emp.salary.toLocaleString()}/year\n`;
        } else {
          reply = `Matched multiple profiles:\n\n` +
            employees.map(emp => `• **${emp.name}** (${emp.department})`).join('\n\n');
        }
        break;
      }

      case 'city_filter': {
        const employees = await Employee.find({ city: new RegExp(`^${city}$`, 'i') }).sort({ name: 1 });
        if (employees.length === 0) {
          reply = `No employees found living in **${city}**.`;
        } else {
          reply = `Employees located in **${city}**:\n\n` +
            employees.map(emp => `• **${emp.name}** - ${emp.designation} (${emp.department})`).join('\n\n');
        }
        break;
      }

      case 'department_stats': {
        if (department) {
          const count = await Employee.countDocuments({ department: new RegExp(`^${department}$`, 'i') });
          reply = `There are **${count}** employees in the **${department}** department.`;
        } else if (message.toLowerCase().includes('max') || message.toLowerCase().includes('most') || message.toLowerCase().includes('highest headcount')) {
          const stats = await Employee.aggregate([
            { $group: { _id: '$department', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
          ]);
          if (stats.length > 0) {
            reply = `The department with the highest headcount is **${stats[0]._id}** with **${stats[0].count}** employees.`;
          } else {
            reply = 'No department statistics available.';
          }
        } else {
          const stats = await Employee.aggregate([
            { $group: { _id: '$department', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]);
          reply = `Headcount breakdown by department:\n\n` +
            stats.map(s => `• **${s._id}**: ${s.count} employees`).join('\n\n');
        }
        break;
      }

      case 'salary_range': {
        const rangeFilter = {};
        let rangeDesc = '';

        if (rangeOperator === 'between' && numbers.length >= 2) {
          const min = Math.min(numbers[0], numbers[1]);
          const max = Math.max(numbers[0], numbers[1]);
          rangeFilter.salary = { $gte: min, $lte: max };
          rangeDesc = `earning between $${min.toLocaleString()} and $${max.toLocaleString()}`;
        } else if (rangeOperator === 'above' && numbers.length >= 1) {
          rangeFilter.salary = { $gt: numbers[0] };
          rangeDesc = `earning above $${numbers[0].toLocaleString()}`;
        } else if (rangeOperator === 'below' && numbers.length >= 1) {
          rangeFilter.salary = { $lt: numbers[0] };
          rangeDesc = `earning below $${numbers[0].toLocaleString()}`;
        } else {
          reply = 'Please specify a valid salary value or range.';
          break;
        }

        const employees = await Employee.find(rangeFilter).sort({ salary: -1 });
        if (employees.length === 0) {
          reply = `No employees found ${rangeDesc}.`;
        } else {
          reply = `Employees ${rangeDesc}:\n\n` +
            employees.map(emp => `• **${emp.name}** - $${emp.salary.toLocaleString()} (${emp.designation})`).join('\n\n');
        }
        break;
      }

      case 'top_n_employees': {
        const limit = numbers[0] || 5;
        const isLowest = message.toLowerCase().includes('lowest') || message.toLowerCase().includes('bottom') || message.toLowerCase().includes('least');
        const sortOrder = isLowest ? 1 : -1;
        const label = isLowest ? 'Lowest' : 'Highest';

        const employees = await Employee.find({}).sort({ salary: sortOrder }).limit(limit);
        reply = `Top **${limit}** ${label} Paid Employees:\n\n` +
          employees.map((emp, index) => `${index + 1}. **${emp.name}** - $${emp.salary.toLocaleString()} (${emp.designation})`).join('\n\n');
        break;
      }

      case 'dept_salary_analytics': {
        const targetDept = department || (allDepts.length > 0 ? allDepts[0] : null);
        if (!targetDept) {
          reply = 'Please specify a department name for salary analytics.';
          break;
        }

        const stats = await Employee.aggregate([
          { $match: { department: new RegExp(`^${targetDept}$`, 'i') } },
          { $group: { _id: '$department', avg: { $avg: '$salary' }, max: { $max: '$salary' }, min: { $min: '$salary' } } }
        ]);

        if (stats.length === 0) {
          reply = `No records found in the **${targetDept}** department.`;
        } else {
          const item = stats[0];
          reply = `Salary analytics for the **${item._id}** department:\n\n` +
            `• **Average Salary:** $${Math.round(item.avg).toLocaleString()}/year\n` +
            `• **Highest Salary:** $${item.max.toLocaleString()}/year\n` +
            `• **Lowest Salary:** $${item.min.toLocaleString()}/year\n`;
        }
        break;
      }

      case 'id_validation': {
        if (!name) {
          reply = 'Please provide an Employee ID to validate.';
          break;
        }
        const emp = await Employee.findOne({ employeeId: new RegExp(`^${name}$`, 'i') });
        if (emp) {
          reply = `✅ Yes, **${name}** is a valid Employee ID. It belongs to **${emp.name}** (${emp.designation} in ${emp.department}).`;
        } else {
          reply = `❌ No, **${name}** does not match any registered employee in the system.`;
        }
        break;
      }

      case 'contact_info': {
        const employees = await Employee.find({
          $or: [
            { name: new RegExp(name, 'i') },
            { employeeId: new RegExp(`^${name}$`, 'i') }
          ]
        });

        if (employees.length === 0) {
          reply = `Could not find any contact information for "${name}".`;
        } else if (employees.length === 1) {
          const emp = employees[0];
          reply = `Contact details for **${emp.name}**:\n\n` +
            `• **Email:** ${emp.email}\n` +
            `• **Phone:** ${emp.phone}\n`;
        } else {
          reply = `Multiple matches for "${name}". Please choose one:\n\n` +
            employees.map(emp => `• **${emp.name}** (Email: ${emp.email})`).join('\n\n');
        }
        break;
      }

      case 'department_directory': {
        const depts = await Employee.distinct('department');
        reply = `Available Departments:\n\n` +
          depts.map(d => `• **${d}**`).join('\n\n');
        break;
      }

      case 'designation_directory': {
        const roles = await Employee.distinct('designation');
        reply = `Available Job Roles / Designations:\n\n` +
          roles.map(r => `• **${r}**`).join('\n\n');
        break;
      }

      case 'multi_condition_search': {
        const query = {};

        if (department) query.department = new RegExp(`^${department}$`, 'i');
        if (designation) query.designation = new RegExp(designation, 'i');
        if (city) query.city = new RegExp(`^${city}$`, 'i');

        if (rangeOperator && numbers.length >= 1) {
          if (rangeOperator === 'above') query.salary = { $gt: numbers[0] };
          else if (rangeOperator === 'below') query.salary = { $lt: numbers[0] };
          else if (rangeOperator === 'between' && numbers.length >= 2) {
            query.salary = { $gte: Math.min(numbers[0], numbers[1]), $lte: Math.max(numbers[0], numbers[1]) };
          }
        }

        const results = await Employee.find(query).sort({ name: 1 });
        if (results.length === 0) {
          reply = 'No employees matched the specified filters.';
        } else {
          reply = `Found **${results.length}** matching employees:\n\n` +
            results.map(emp => `• **${emp.name}** - ${emp.designation} in ${emp.department} (Salary: $${emp.salary.toLocaleString()}, City: ${emp.city})`).join('\n\n');
        }
        break;
      }

      case 'compare_employees': {
        if (allNames.length < 2) {
          reply = 'Please specify two employee names to compare.';
          break;
        }

        const emps = await Employee.find({
          name: { $in: [new RegExp(allNames[0], 'i'), new RegExp(allNames[1], 'i')] }
        });

        if (emps.length < 2) {
          reply = 'Could not find both employees for comparison. Ensure both names exist.';
          break;
        }

        const [emp1, emp2] = emps;
        const diff = Math.abs(emp1.salary - emp2.salary);
        const higher = emp1.salary > emp2.salary ? emp1 : emp2;
        const lower = emp1.salary > emp2.salary ? emp2 : emp1;

        reply = `Comparison: **${emp1.name}** vs **${emp2.name}**:\n\n` +
          `• **Designation:** ${emp1.designation} vs ${emp2.designation}\n\n` +
          `• **Department:** ${emp1.department} vs ${emp2.department}\n\n` +
          `• **City Location:** ${emp1.city} vs ${emp2.city}\n\n` +
          `• **Salary:** $${emp1.salary.toLocaleString()} vs $${emp2.salary.toLocaleString()}\n\n` +
          `📊 **Salary Difference:** **${higher.name}** earns **$${diff.toLocaleString()}** more per year than **${lower.name}**.`;
        break;
      }

      case 'compare_departments': {
        if (allDepts.length < 2) {
          reply = 'Please specify two departments to compare.';
          break;
        }

        const dept1 = allDepts[0];
        const dept2 = allDepts[1];

        const stats1 = await Employee.aggregate([
          { $match: { department: new RegExp(`^${dept1}$`, 'i') } },
          { $group: { _id: '$department', count: { $sum: 1 }, avg: { $avg: '$salary' } } }
        ]);

        const stats2 = await Employee.aggregate([
          { $match: { department: new RegExp(`^${dept2}$`, 'i') } },
          { $group: { _id: '$department', count: { $sum: 1 }, avg: { $avg: '$salary' } } }
        ]);

        if (stats1.length === 0 || stats2.length === 0) {
          reply = 'Could not retrieve statistics for both departments. Make sure they both contain employees.';
          break;
        }

        const s1 = stats1[0];
        const s2 = stats2[0];
        const countDiff = Math.abs(s1.count - s2.count);
        const avgDiff = Math.round(Math.abs(s1.avg - s2.avg));

        reply = `Comparison: **${s1._id}** vs **${s2._id}**:\n\n` +
          `• **Headcount:** ${s1.count} vs ${s2.count} employees (${s1.count > s2.count ? s1._id : s2._id} has ${countDiff} more)\n\n` +
          `• **Average Salary:** $${Math.round(s1.avg).toLocaleString()} vs $${Math.round(s2.avg).toLocaleString()} (${s1.avg > s2.avg ? s1._id : s2._id} pays $${avgDiff.toLocaleString()} more on average).`;
        break;
      }

      case 'alphabetical_sorting': {
        const sortOrder = sortDirection === 'desc' ? -1 : 1;
        const employees = await Employee.find({}, 'name department designation').sort({ name: sortOrder });
        reply = `Employee list sorted (A-Z/Z-A):\n\n` +
          employees.map(emp => `• **${emp.name}** - ${emp.designation} (${emp.department})`).join('\n\n');
        break;
      }

      case 'unknown':
      default: {
        try {
          // Fetch all employees to give Gemini complete database context
          const employees = await Employee.find({});
          const employeeContext = employees.map(emp => ({
            employeeId: emp.employeeId,
            name: emp.name,
            department: emp.department,
            designation: emp.designation,
            salary: emp.salary,
            email: emp.email,
            phone: emp.phone,
            city: emp.city
          }));

          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: `You are an AI Employee Assistant for a company.
You have access to the employee database below:

${JSON.stringify(employeeContext, null, 2)}

User's Question: "${message}"

Rules:
1. Provide a direct, professional, and concise answer using the database above.
2. If the user asks for a specific attribute of an employee (such as salary, email, phone, city, department, or designation), output ONLY that requested attribute and the employee's name. Do NOT list other details (like their department, designation, or ID) unless they explicitly asked for "all details" or a "profile". For example, if they ask for "salary of prinve", correct the spelling to Prince and return only his salary.
3. If the user asks you to write an email, schedule/draft a message, or perform text generation using the data, feel free to do so in a helpful manner.
4. If the user asks for something completely unrelated to the company, employees, or general conversational greetings, politely decline and steer the conversation back to employee assistance.
5. Format your response using clean Markdown compatible with MS Teams.`
          });

          reply = response.text;
        } catch (error) {
          console.error('[Gemini API Error]:', error);
          reply = `I'm sorry, I didn't quite understand that question, and I had trouble reaching my AI engine. Try asking one of these:\n\n` +
            `• *How many employees work in HR?*\n` +
            `• *Top 5 highest paid employees*\n` +
            `• *Compare Finance and IT*`;
        }
        break;
      }
    }

    return res.json({ reply });

  } catch (error) {
    console.error('Error processing chat message:', error);
    return res.status(500).json({ reply: 'An error occurred while fetching information from the employee database.' });
  }
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your web browser to test.`);
});

// Helper for Fuzzy Matching (Levenshtein Distance)
function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Register the API endpoint where Microsoft Teams/Azure Bot Service will forward activities
app.post('/api/messages', async (req, res) => {
  try {
    await adapter.process(req, res, (context) => bot.run(context));
  } catch (err) {
    console.error('Error processing Teams activity:', err);
    res.status(500).send('Error processing activity');
  }
});