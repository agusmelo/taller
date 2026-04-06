require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const routes       = require('./routes/index');
const errorHandler = require('./middlewares/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} no encontrado` }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n Workshop API corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
