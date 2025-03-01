import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as chrono from 'chrono-node';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';

// Set environment variables for transformers.js
env.cacheDir = './.cache';
env.allowLocalModels = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Initialize AI models
let classifier = null;
let analyzer = null;

// Load AI models
const loadModels = async () => {
  console.log('Loading AI models...');
  try {
    // Load text classification model for expense categorization
    classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
    
    // Load text generation model for expense analysis
    analyzer = await pipeline('text2text-generation', 'Xenova/t5-small');
    
    console.log('AI models loaded successfully');
  } catch (error) {
    console.error('Error loading AI models:', error);
  }
};

// Load models on startup
loadModels();

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true });

// AI-powered expense categorization
const categorizeExpense = async (description) => {
  if (!classifier) return 'other';

  try {
    const categories = {
      'food': ['restaurant', 'dinner', 'lunch', 'breakfast', 'meal', 'food'],
      'groceries': ['grocery', 'supermarket', 'market', 'food store'],
      'transportation': ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'bus', 'train'],
      'utilities': ['electricity', 'water', 'internet', 'phone', 'bill'],
      'entertainment': ['movie', 'concert', 'show', 'game', 'streaming'],
      'shopping': ['clothes', 'shoes', 'amazon', 'store'],
      'health': ['doctor', 'medicine', 'pharmacy', 'medical'],
      'housing': ['rent', 'mortgage', 'maintenance', 'repair']
    };

    // First try keyword matching
    const lowerDesc = description.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }

    // If no keyword match, use AI model
    const result = await classifier(description, { topk: 1 });
    const sentiment = result[0].label;
    
    // Map sentiment to expense category
    if (sentiment.includes('POSITIVE')) {
      if (lowerDesc.includes('buy') || lowerDesc.includes('purchase')) {
        return 'shopping';
      } else if (lowerDesc.includes('eat') || lowerDesc.includes('drink')) {
        return 'food';
      }
    }
    
    return 'other';
  } catch (error) {
    console.error('Error categorizing expense:', error);
    return 'other';
  }
};

// AI-powered expense analysis
const analyzeExpensesWithAI = async (expenses) => {
  if (!analyzer) return null;

  try {
    // Prepare expense data for analysis
    const expenseText = expenses.map(e => 
      `${e.amount} on ${e.category} (${e.description})`
    ).join(', ');

    // Generate prompts for different types of analysis
    const prompts = [
      `Analyze spending pattern: ${expenseText}`,
      `Suggest savings from: ${expenseText}`,
      `Find unusual expenses in: ${expenseText}`
    ];

    // Get AI insights
    const insights = await Promise.all(prompts.map(prompt => 
      analyzer(prompt, { max_length: 100 })
    ));

    return {
      pattern: insights[0][0].generated_text,
      savings: insights[1][0].generated_text,
      unusual: insights[2][0].generated_text
    };
  } catch (error) {
    console.error('Error analyzing expenses:', error);
    return null;
  }
};

// Helper function to get file path for a specific date
const getFilePath = (date) => {
  const dateStr = date.toISOString().split('T')[0];
  return path.join(DATA_DIR, `${dateStr}.json`);
};

// Helper function to load expenses for a specific date
const loadDailyExpenses = async (date) => {
  const filePath = getFilePath(date);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { date: date.toISOString().split('T')[0], expenses: [] };
    }
    throw error;
  }
};

// Helper function to save expenses for a specific date
const saveDailyExpenses = async (date, expenses) => {
  const filePath = getFilePath(date);
  const data = { date: date.toISOString().split('T')[0], expenses };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

// Helper function to load expenses within a date range
const loadExpensesInRange = async (startDate, endDate) => {
  const files = await fs.readdir(DATA_DIR);
  const expenses = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const fileDate = file.replace('.json', '');
    if (fileDate >= startDate.toISOString().split('T')[0] && 
        fileDate <= endDate.toISOString().split('T')[0]) {
      const data = await loadDailyExpenses(new Date(fileDate));
      expenses.push(...data.expenses);
    }
  }

  return expenses;
};

// Helper function to analyze expenses using AI
const analyzeExpenses = (expenses) => {
  const analysis = {
    totalSpent: 0,
    categorySummary: {},
    dailyAverage: 0,
    unusualSpending: [],
    recommendations: []
  };

  // Calculate totals and category summaries
  expenses.forEach(expense => {
    analysis.totalSpent += expense.amount;
    analysis.categorySummary[expense.category] = 
      (analysis.categorySummary[expense.category] || 0) + expense.amount;
  });

  // Calculate daily average
  const uniqueDates = new Set(expenses.map(e => e.date.split('T')[0]));
  analysis.dailyAverage = analysis.totalSpent / Math.max(1, uniqueDates.size);

  // Identify unusual spending
  Object.entries(analysis.categorySummary).forEach(([category, total]) => {
    const avgPerDay = total / uniqueDates.size;
    if (avgPerDay > analysis.dailyAverage) {
      analysis.unusualSpending.push({
        category,
        total,
        avgPerDay
      });
    }
  });

  // Generate recommendations
  if (analysis.unusualSpending.length > 0) {
    analysis.recommendations.push(
      "Consider reducing spending in categories with above-average daily expenses"
    );
  }

  return analysis;
};

// Helper function to parse expense from text
const parseExpense = async (text) => {
  const amountMatch = text.match(/\$?\d+(\.\d{2})?/);
  if (!amountMatch) return null;
  
  const amount = parseFloat(amountMatch[0].replace('$', ''));
  
  // Parse date from text
  const currentDate = new Date();
  const parsedDate = chrono.parseDate(text, currentDate, { forwardDate: false });
  const date = parsedDate || currentDate;
  
  // Use AI to categorize the expense
  const category = await categorizeExpense(text);
  
  return {
    amount,
    category,
    description: text,
    date: date.toISOString()
  };
};

// Add expense endpoint
app.post('/api/expenses', async (req, res) => {
  try {
    const { text } = req.body;
    const expense = await parseExpense(text);
    
    if (!expense) {
      return res.status(400).json({ error: 'Could not parse expense from text. Please include an amount (e.g., $20).' });
    }

    const expenseDate = new Date(expense.date);
    const dailyData = await loadDailyExpenses(expenseDate);
    dailyData.expenses.push(expense);
    await saveDailyExpenses(expenseDate, dailyData.expenses);
    
    res.json(expense);
  } catch (error) {
    console.error('Error saving expense:', error);
    res.status(500).json({ error: error.message });
  }
});

// Query expenses endpoint
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    const lowerQuery = query.toLowerCase();
    console.log('Processing query:', query);

    // Default to last 30 days if no specific time is mentioned
    const endDate = new Date();
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Adjust date range based on query
    if (lowerQuery.includes('today')) {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (lowerQuery.includes('this week')) {
      startDate.setDate(endDate.getDate() - endDate.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else if (lowerQuery.includes('this month')) {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }

    const expenses = await loadExpensesInRange(startDate, endDate);
    
    if (!expenses || expenses.length === 0) {
      return res.json({ answer: "No expenses found for the specified time period." });
    }

    // Get both statistical and AI analysis
    const analysis = analyzeExpenses(expenses);
    const aiAnalysis = await analyzeExpensesWithAI(expenses);
    
    let answer = '';
    
    // Handle time-based queries
    if (lowerQuery.includes('today')) {
      const todayTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      answer = `Today's total spending: $${todayTotal.toFixed(2)}. `;
      
      // Add category breakdown for today
      const categories = {};
      expenses.forEach(exp => {
        categories[exp.category] = (categories[exp.category] || 0) + exp.amount;
      });
      
      if (Object.keys(categories).length > 0) {
        answer += 'Breakdown by category: ';
        Object.entries(categories).forEach(([category, amount]) => {
          answer += `${category}: $${amount.toFixed(2)}, `;
        });
        answer = answer.slice(0, -2);
      }
    } else if (lowerQuery.includes('this week')) {
      answer = `This week's total spending: $${analysis.totalSpent.toFixed(2)}. `;
      answer += `Daily average: $${analysis.dailyAverage.toFixed(2)}. `;
    } else if (lowerQuery.includes('total') || lowerQuery.includes('spent')) {
      answer = `Total spending: $${analysis.totalSpent.toFixed(2)}. `;
      answer += `Daily average: $${analysis.dailyAverage.toFixed(2)}. `;
    }
    
    // Add AI insights based on query type
    if (aiAnalysis) {
      if (lowerQuery.includes('pattern') || lowerQuery.includes('trend')) {
        answer += `\nSpending Pattern: ${aiAnalysis.pattern}`;
      }
      if (lowerQuery.includes('save') || lowerQuery.includes('savings')) {
        answer += `\nSavings Suggestions: ${aiAnalysis.savings}`;
      }
      if (lowerQuery.includes('unusual') || lowerQuery.includes('strange')) {
        answer += `\nUnusual Expenses: ${aiAnalysis.unusual}`;
      }
    }
    
    // Add category breakdown if requested
    if (lowerQuery.includes('category') || lowerQuery.includes('breakdown')) {
      answer += '\nCategory breakdown: ';
      Object.entries(analysis.categorySummary).forEach(([category, amount]) => {
        answer += `${category}: $${amount.toFixed(2)}, `;
      });
      answer = answer.slice(0, -2);
    }

    // If no specific answer was generated, provide a general summary with AI insights
    if (!answer && aiAnalysis) {
      answer = `Total spending: $${analysis.totalSpent.toFixed(2)}. `;
      answer += `Daily average: $${analysis.dailyAverage.toFixed(2)}.\n`;
      answer += `Spending Pattern: ${aiAnalysis.pattern}\n`;
      answer += `Savings Suggestions: ${aiAnalysis.savings}`;
    }

    console.log('Generated answer:', answer);
    res.json({ answer: answer.trim() });
  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({ error: 'Failed to process query: ' + error.message });
  }
});

// Get all expenses endpoint
app.get('/api/expenses', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days by default
    
    const expenses = await loadExpensesInRange(startDate, endDate);
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI insights endpoint
app.get('/api/insights', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days
    
    const expenses = await loadExpensesInRange(startDate, endDate);
    if (!expenses || expenses.length === 0) {
      return res.json({
        message: "No expenses found for analysis",
        insights: null
      });
    }

    const aiAnalysis = await analyzeExpensesWithAI(expenses);
    if (!aiAnalysis) {
      return res.json({
        message: "AI analysis not available",
        insights: null
      });
    }

    res.json({
      message: "AI analysis completed",
      insights: aiAnalysis
    });
  } catch (error) {
    console.error('Error generating AI insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get expense analysis endpoint
app.get('/api/analysis', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days by default
    
    const expenses = await loadExpensesInRange(startDate, endDate);
    const analysis = analyzeExpenses(expenses);
    
    res.json(analysis);
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
