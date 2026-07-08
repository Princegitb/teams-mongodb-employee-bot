const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const Employee = require('./models/Employee');
const { parseMessage } = require('./services/parser');
const { initializeNLP } = require('./services/nlpService');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());

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

  // Check for simple greetings and help queries
  const greetings = [
    'hi', 'hii', 'hiii', 'hello', 'hey', 'greetings', 'hola', 'yo', 
    'hi there', 'hello there', 'hey there', 'good morning', 'good afternoon', 'good evening'
  ];
  const helpPrompts = ['help', 'info', 'support', 'what can you do', 'menu', 'who are you'];
  
  const normalizedMsg = message.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  
  if (greetings.includes(normalizedMsg)) {
    return res.json({ reply: '👋 Hello! I am your AI Employee Assistant. How can I help you search or analyze the employee database today?' });
  }
  
  if (helpPrompts.includes(normalizedMsg)) {
    return res.json({ 
      reply: 'ℹ️ **AI Employee Assistant capabilities:**\n\n' +
             'I can help you search, filter, and analyze employee records from the database. Try asking:\n\n' +
             '• "How many employees are there?"\n' +
             '• "List all employees"\n' +
             '• "Show IT employees"\n' +
             '• "What is the average salary?"\n' +
             '• "Show the highest paid employee"\n' +
             '• "What is the salary of Bob Smith?"'
    });
  }

  try {
    // 1. Analyze user message via NLP parser service
    const parsed = parseMessage(message);
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
        const query = Employee.find({}, 'name department designation');
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
            employees.map(emp => `• **${emp.name}** - ${emp.designation} (${emp.department})`).join('\n\n');
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
          // typos / did you mean fuzzy match recommendations
          const allEmps = await Employee.find({}, 'name');
          const suggestions = allEmps
            .map(emp => {
              const dist = getLevenshteinDistance(name.toLowerCase(), emp.name.toLowerCase());
              return { name: emp.name, dist };
            })
            .filter(item => item.dist <= 4 || item.name.toLowerCase().includes(name.toLowerCase()))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3)
            .map(item => `• **${item.name}**`);

          reply = `No exact match found for "${name}".`;
          if (suggestions.length > 0) {
            reply += `\n\nDid you mean:\n\n` + suggestions.join('\n\n');
          }
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
        reply = `I'm sorry, I didn't quite understand that question. Try asking one of these:\n\n` +
          `• *How many employees work in HR?*\n` +
          `• *Top 5 highest paid employees*\n` +
          `• *Compare Finance and IT*\n` +
          `• *List job roles*\n` +
          `• *Compare Rahul and Bob*\n` +
          `• *Employees earning between 60000 and 80000*\n` +
          `• *Show employees from Delhi*\n` +
          `• *Aman's email*`;
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
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1  // deletion
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

