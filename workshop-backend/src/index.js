require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const morgan       = require('morgan');
const routes       = require('./routes/index');
const errorHandler = require('./middlewares/errorHandler');
const alertRunner  = require('./services/alertRunner');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust exactly one hop of X-Forwarded-For. In prod, requests go
// client -> edge (sets X-Forwarded-For once) -> frontend (passes it through
// unchanged, does not add another hop) -> api — so there's exactly one
// header-modifying proxy in front of the app, even though there are two
// nginx containers in the path. Without this, express-rate-limit refuses to
// start (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) because trusting X-Forwarded-For
// with no trust-proxy config is a classic rate-limit bypass, and req.ip
// would resolve to frontend's internal Docker IP instead of the real client.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Request logging — JSON in production so log shippers (Promtail/Loki) can
// parse status/path/response time without a text parser; 'dev' locally for
// readability.
const jsonLogFormat = (tokens, req, res) => JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  method: tokens.method(req, res),
  path: tokens.url(req, res),
  status: Number(tokens.status(req, res)),
  responseTimeMs: Number(tokens['response-time'](req, res)),
});

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? jsonLogFormat : 'dev'));
}

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intente de nuevo en un minuto' }
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login, intente de nuevo en un minuto' }
});

app.use(generalLimiter);

// CORS
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:4200'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Login rate limit
app.use('/api/auth/login', loginLimiter);

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} no encontrado` }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n Workshop API corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
  if (process.env.NODE_ENV !== 'test') alertRunner.start();
});

module.exports = app;
