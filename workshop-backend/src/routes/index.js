const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireAdminOrRecep } = require('../middlewares/auth');
const v = require('../middlewares/validate');

const auth      = require('../controllers/authController');
const clients   = require('../controllers/clientsController');
const vehicles  = require('../controllers/vehiclesController');
const jobs      = require('../controllers/jobsController');
const search    = require('../controllers/searchController');
const dashboard = require('../controllers/dashboardController');
const users     = require('../controllers/usersController');
const pdf       = require('../controllers/pdfController');

// Auth
router.post('/auth/login', v.loginRules, auth.login);
router.get('/auth/me',     authenticate, auth.me);

// Search
router.get('/search', authenticate, search.search);

// Clients
router.get('/clients',                   authenticate, clients.list);
router.post('/clients',                  authenticate, requireAdminOrRecep, v.createClientRules, clients.create);
router.get('/clients/by-rut/:rut',       authenticate, clients.getByRut);
router.get('/clients/:id',               authenticate, v.uuidParam, clients.getOne);
router.put('/clients/:id',               authenticate, requireAdminOrRecep, v.updateClientRules, clients.update);
router.delete('/clients/:id',            authenticate, requireAdmin, v.uuidParam, clients.remove);
router.get('/clients/:id/vehicles',      authenticate, v.uuidParam, clients.getVehicles);
router.get('/clients/:id/jobs',          authenticate, v.uuidParam, clients.getJobs);

// Vehicles
router.get('/vehicles',                        authenticate, vehicles.list);
router.post('/vehicles',                       authenticate, requireAdminOrRecep, v.createVehicleRules, vehicles.create);
router.get('/vehicles/by-plate/:plate',        authenticate, vehicles.getByPlate);
router.get('/vehicles/:id',                    authenticate, v.uuidParam, vehicles.getOne);
router.get('/vehicles/:id/ownership-history',  authenticate, v.uuidParam, vehicles.getOwnershipHistory);
router.post('/vehicles/:id/transfer-ownership',authenticate, requireAdmin, v.transferOwnershipRules, vehicles.transferOwnership);
router.put('/vehicles/:id',                    authenticate, requireAdminOrRecep, v.updateVehicleRules, vehicles.update);
router.delete('/vehicles/:id',                 authenticate, requireAdmin, v.uuidParam, vehicles.remove);

// Jobs
router.get('/jobs',        authenticate, jobs.list);
router.post('/jobs',       authenticate, requireAdminOrRecep, v.createJobRules, jobs.create);
router.get('/jobs/:id',    authenticate, v.uuidParam, jobs.getOne);
router.put('/jobs/:id',    authenticate, v.updateJobRules, jobs.update);
router.delete('/jobs/:id', authenticate, requireAdmin, v.uuidParam, jobs.remove);
router.get('/jobs/:id/pdf',authenticate, v.uuidParam, pdf.generatePdf);

// Items
router.get('/jobs/:id/items',            authenticate, v.uuidParam, jobs.listItems);
router.post('/jobs/:id/items',           authenticate, v.addItemRules, jobs.addItem);
router.put('/jobs/:id/items/:itemId',    authenticate, v.updateItemRules, jobs.updateItem);
router.delete('/jobs/:id/items/:itemId', authenticate, requireAdminOrRecep, v.updateItemRules, jobs.removeItem);

// Payments
router.get('/jobs/:id/payments',               authenticate, v.uuidParam, jobs.listPayments);
router.post('/jobs/:id/payments',              authenticate, requireAdminOrRecep, v.addPaymentRules, jobs.addPayment);
router.delete('/jobs/:id/payments/:paymentId', authenticate, requireAdmin, v.uuidParam, jobs.removePayment);

// Dashboard (admin only)
router.get('/dashboard/summary',            authenticate, requireAdmin, dashboard.summary);
router.get('/dashboard/revenue-trend',      authenticate, requireAdmin, dashboard.revenueTrend);
router.get('/dashboard/job-status',         authenticate, requireAdmin, dashboard.jobStatus);
router.get('/dashboard/client-financials',  authenticate, requireAdmin, dashboard.clientFinancials);
router.get('/dashboard/recent-jobs',        authenticate, requireAdmin, dashboard.recentJobs);

// Users (admin only)
router.get('/users',         authenticate, requireAdmin, users.list);
router.post('/users',        authenticate, requireAdmin, v.createUserRules, users.create);
router.put('/users/:id',     authenticate, requireAdmin, v.updateUserRules, users.update);
router.delete('/users/:id',  authenticate, requireAdmin, v.uuidParam, users.remove);

module.exports = router;
