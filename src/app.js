const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

const app = express();   // ✅ THIS LINE WAS MISSING

app.use(cors());
app.use(express.json());

// ✅ Test route
app.get('/', (req, res) => {
  res.send('API Running...');
});

// ✅ DB Test route
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      success: true,
      time: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = app;
const leadRoutes = require('./modules/lead/lead.routes');

const reviewRoutes = require('./modules/review/review.routes');

app.use('/api/reviews', reviewRoutes);
app.use('/api/leads', leadRoutes);
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

app.use('/api/dashboard', dashboardRoutes);const authRoutes = require('./modules/auth/auth.routes');

app.use('/api/auth', authRoutes);

// Users dropdown (assign owner)
const userRoutes = require('./modules/user/user.routes');
app.use('/api/users', userRoutes);

// Customer master
const customerRoutes = require('./modules/customer/customer.routes');
app.use('/api/customers', customerRoutes);