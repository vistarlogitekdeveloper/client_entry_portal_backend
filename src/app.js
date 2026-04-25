const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

// Serving uploaded files statically
// Must match the same UPLOAD_DIR logic as the agreement controller
const uploadBase = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadBase));

// ✅ Test routes
app.get('/', (req, res) => {
  res.send('API Running...');
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Module Routes
const authRoutes = require('./modules/auth/auth.routes');
const leadRoutes = require('./modules/lead/lead.routes');
const reviewRoutes = require('./modules/review/review.routes');
const planningRoutes = require('./modules/planning/planning.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const userRoutes = require('./modules/user/user.service'); // Note: req.user/user.routes exists too
const userApiRoutes = require('./modules/user/user.routes');
const customerRoutes = require('./modules/customer/customer.routes');

// New HO Routes
const hoCustomerRoutes = require('./modules/ho_customer/ho_customer.routes');
const hoAgreementRoutes = require('./modules/ho_agreement/ho_agreement.routes');
const hoCostSheetRoutes = require('./modules/ho_cost_sheet/ho_cost_sheet.routes');
const hoCertificationRoutes = require('./modules/ho_certification/ho_certification.routes');
const taskRoutes = require('./modules/task/task.routes');


app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userApiRoutes);
app.use('/api/customers', customerRoutes);

// New HO Endpoints
app.use('/api/ho-customers', hoCustomerRoutes);
app.use('/api/agreements', hoAgreementRoutes);
app.use('/api/cost-sheets', hoCostSheetRoutes);
app.use('/api/certifications', hoCertificationRoutes);
app.use('/api/tasks', taskRoutes);


module.exports = app;