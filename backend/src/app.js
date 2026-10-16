const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'DLPMS Backend is running' });
});

// Swagger API Documentation (Uncomment when swagger.yaml is created)
// try {
//   const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
//   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// } catch (e) {
//   console.log('Swagger documentation not found yet.');
// }

// Routes
const authRoutes = require('./routes/auth');
const citizenRoutes = require('./routes/citizen');
const officerRoutes = require('./routes/officer');
const taxRoutes = require('./routes/tax');
const gisRoutes = require('./routes/gis');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const appointmentRoutes = require('./routes/appointments');

app.use('/api/auth', authRoutes);
app.use('/api/citizen', citizenRoutes);
app.use('/api/officer', officerRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/appointments', appointmentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
