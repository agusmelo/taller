const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireAdminOrRecep } = require('../middlewares/auth');

const auth      = require('../controllers/authController');
const clients   = require('../controllers/clientsController');
const vehicles  = require('../controllers/vehiclesController');
const jobs      = require('../controllers/jobsController');
const search    = require('../controllers/searchController');
const dashboard = require('../controllers/dashboardController');
const users     = require('../controllers/usersController');
const pdf       = require('../controllers/pdfController');

// Auth
router.post('/auth/login', auth.login);
router.get('/auth/me',     authenticate, auth.me);

// Search
router.get('/search', authenticate, search.search);

// Clients
router.get('/clients',                   authenticate, clients.list);
router.post('/clients',                  authenticate, requireAdminOrRecep, clients.create);
router.get('/clients/by-rut/:rut',       authenticate, clients.getByRut);
router.get('/clients/:id',               authenticate, clients.getOne);
router.put('/clients/:id',               authenticate, requireAdminOrRecep, clients.update);
router.delete('/clients/:id',            authenticate, requireAdmin, clients.remove);
router.get('/clients/:id/vehicles',      authenticate, clients.getVehicles);
router.get('/clients/:id/jobs',          authenticate, clients.getJobs);

// Vehicles
router.get('/vehicles',                        authenticate, vehicles.list);
router.post('/vehicles',                       authenticate, requireAdminOrRecep, vehicles.create);
router.get('/vehicles/by-plate/:plate',        authenticate, vehicles.getByPlate);
router.get('/vehicles/:id',                    authenticate, vehicles.getOne);
router.get('/vehicles/:id/ownership-history',  authenticate, vehicles.getOwnershipHistory);
router.post('/vehicles/:id/transfer-ownership',authenticate, requireAdmin, vehicles.transferOwnership);
router.put('/vehicles/:id',                    authenticate, requireAdminOrRecep, vehicles.update);
router.delete('/vehicles/:id',                 authenticate, requireAdmin, vehicles.remove);

// Jobs
router.get('/jobs',        authenticate, jobs.list);
router.post('/jobs',       authenticate, requireAdminOrRecep, jobs.create);
router.get('/jobs/:id',    authenticate, jobs.getOne);
router.put('/jobs/:id',    authenticate, jobs.update);
router.delete('/jobs/:id', authenticate, requireAdmin, jobs.remove);
router.get('/jobs/:id/pdf',authenticate, pdf.generatePdf);

// Items
router.get('/jobs/:id/items',            authenticate, jobs.listItems);
router.post('/jobs/:id/items',           authenticate, jobs.addItem);
router.put('/jobs/:id/items/:itemId',    authenticate, jobs.updateItem);
router.delete('/jobs/:id/items/:itemId', authenticate, requireAdminOrRecep, jobs.removeItem);

// Payments
router.get('/jobs/:id/payments',               authenticate, jobs.listPayments);
router.post('/jobs/:id/payments',              authenticate, requireAdminOrRecep, jobs.addPayment);
router.delete('/jobs/:id/payments/:paymentId', authenticate, requireAdmin, jobs.removePayment);

// Dashboard (admin only)
router.get('/dashboard/summary',            authenticate, requireAdmin, dashboard.summary);
router.get('/dashboard/revenue-trend',      authenticate, requireAdmin, dashboard.revenueTrend);
router.get('/dashboard/job-status',         authenticate, requireAdmin, dashboard.jobStatus);
router.get('/dashboard/client-financials',  authenticate, requireAdmin, dashboard.clientFinancials);
router.get('/dashboard/recent-jobs',        authenticate, requireAdmin, dashboard.recentJobs);

// Users (admin only)
router.get('/users',         authenticate, requireAdmin, users.list);
router.post('/users',        authenticate, requireAdmin, users.create);
router.put('/users/:id',     authenticate, requireAdmin, users.update);
router.delete('/users/:id',  authenticate, requireAdmin, users.remove);

module.exports = router;
