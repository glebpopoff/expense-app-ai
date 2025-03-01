import React, { useState, useEffect } from 'react';
import {
  Container,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  Paper,
  Box,
  CircularProgress,
  Tabs,
  Tab,
  Grid
} from '@mui/material';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

// Custom colors for charts
const COLORS = [
  '#1976d2', // Primary blue
  '#2196f3', // Light blue
  '#4caf50', // Green
  '#ff9800', // Orange
  '#f44336', // Red
  '#9c27b0', // Purple
  '#795548', // Brown
  '#607d8b', // Blue grey
];

function App() {
  const [expenseText, setExpenseText] = useState('');
  const [query, setQuery] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/expenses`);
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseText) return;

    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/expenses`, { text: expenseText });
      setExpenseText('');
      fetchExpenses();
    } catch (error) {
      console.error('Error adding expense:', error);
    }
    setLoading(false);
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/query`, { query });
      setAnswer(response.data.answer);
    } catch (error) {
      console.error('Error querying expenses:', error);
    }
    setLoading(false);
  };

  // Prepare data for charts
  const prepareChartData = () => {
    const categoryTotals = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {});

    return Object.entries(categoryTotals).map(([category, amount]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      amount: Number(amount.toFixed(2))
    }));
  };

  // Prepare data for timeline chart
  const prepareTimelineData = () => {
    const timelineData = expenses.reduce((acc, expense) => {
      const date = new Date(expense.date).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { date, total: 0 };
      }
      acc[date].total += expense.amount;
      return acc;
    }, {});

    return Object.values(timelineData).map(item => ({
      date: item.date,
      total: Number(item.total.toFixed(2))
    }));
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        AI Expense Tracker
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <form onSubmit={handleAddExpense}>
          <Typography variant="h6" gutterBottom>
            Add Expense
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              value={expenseText}
              onChange={(e) => setExpenseText(e.target.value)}
              placeholder="E.g., I spent $20 on gas"
              disabled={loading}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
            >
              Add
            </Button>
          </Box>
        </form>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <form onSubmit={handleQuery}>
          <Typography variant="h6" gutterBottom>
            Query Expenses
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g., How much did I spend on gas?"
              disabled={loading}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
            >
              Ask
            </Button>
          </Box>
        </form>
        {answer && (
          <Paper sx={{ p: 2, mt: 2, bgcolor: '#f5f5f5' }}>
            <Typography>{answer}</Typography>
          </Paper>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Expense Analysis
        </Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Charts" />
            <Tab label="List" />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            {tabValue === 0 ? (
              <Grid container spacing={2}>
                {/* Category Distribution (Pie Chart) */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: 300 }}>
                    <Typography variant="subtitle1" gutterBottom align="center">
                      Expenses by Category
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={prepareChartData()}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry) => `${entry.category}: $${entry.amount}`}
                        >
                          {prepareChartData().map((entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>

                {/* Spending Timeline (Bar Chart) */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: 300 }}>
                    <Typography variant="subtitle1" gutterBottom align="center">
                      Daily Spending
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={prepareTimelineData()}>
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="total" fill="#1976d2" name="Total Spent" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <List>
                {expenses.map((expense, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={expense.description}
                      secondary={`$${expense.amount} - ${expense.category} - ${new Date(expense.date).toLocaleDateString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </Paper>
    </Container>
  );
}

export default App;
