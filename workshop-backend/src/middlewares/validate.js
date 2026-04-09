const { body, param, query, validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Datos invalidos',
      detalles: errors.array().map(e => ({ campo: e.path, mensaje: e.msg }))
    });
  }
  next();
}

// Auth
const loginRules = [
  body('username').trim().notEmpty().withMessage('Usuario es requerido'),
  body('password').notEmpty().withMessage('Contrasena es requerida'),
  handleValidation
];

// Clients
const createClientRules = [
  body('full_name').trim().notEmpty().withMessage('Nombre completo es requerido'),
  body('type').optional().isIn(['individual', 'empresa']).withMessage('Tipo debe ser individual o empresa'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email invalido'),
  body('rut').optional({ values: 'falsy' }).isString().withMessage('RUT debe ser texto'),
  handleValidation
];

const updateClientRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('type').optional().isIn(['individual', 'empresa']).withMessage('Tipo debe ser individual o empresa'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email invalido'),
  body('rut').optional({ values: 'falsy' }).isString().withMessage('RUT debe ser texto'),
  handleValidation
];

// Vehicles
const createVehicleRules = [
  body('plate_number').trim().notEmpty().withMessage('Patente es requerida'),
  body('client_id').isUUID().withMessage('client_id debe ser un UUID valido'),
  body('make').trim().notEmpty().withMessage('Marca es requerida'),
  body('model').trim().notEmpty().withMessage('Modelo es requerido'),
  body('year').optional({ values: 'falsy' }).isInt({ min: 1900, max: 2100 }).withMessage('Ano invalido'),
  body('mileage').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Kilometraje debe ser positivo'),
  handleValidation
];

const updateVehicleRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('year').optional({ values: 'falsy' }).isInt({ min: 1900, max: 2100 }).withMessage('Ano invalido'),
  body('mileage').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Kilometraje debe ser positivo'),
  handleValidation
];

const transferOwnershipRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('new_client_id').isUUID().withMessage('new_client_id debe ser un UUID valido'),
  handleValidation
];

// Jobs
const createJobRules = [
  body('client_id').isUUID().withMessage('client_id debe ser un UUID valido'),
  body('vehicle_id').isUUID().withMessage('vehicle_id debe ser un UUID valido'),
  body('tax_rate').optional().isFloat({ min: 0, max: 1 }).withMessage('tax_rate debe estar entre 0 y 1'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Descuento debe ser positivo'),
  body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('Tipo de descuento invalido'),
  body('job_date').optional().isISO8601().withMessage('Fecha del trabajo invalida'),
  body('items').optional().isArray().withMessage('Items debe ser un array'),
  body('items.*.description').optional().trim().notEmpty().withMessage('Descripcion del item es requerida'),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
  body('items.*.unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario debe ser positivo'),
  body('items.*.item_type').optional().isIn(['mano_de_obra', 'repuesto', 'otro']).withMessage('Tipo de item invalido'),
  handleValidation
];

const updateJobRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('status').optional().isIn(['abierto', 'terminado', 'pagado']).withMessage('Estado invalido'),
  body('tax_rate').optional().isFloat({ min: 0, max: 1 }).withMessage('tax_rate debe estar entre 0 y 1'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Descuento debe ser positivo'),
  body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('Tipo de descuento invalido'),
  body('job_date').optional().isISO8601().withMessage('Fecha del trabajo invalida'),
  handleValidation
];

// Job Items
const addItemRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  body('description').trim().notEmpty().withMessage('Descripcion es requerida'),
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
  body('unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario debe ser positivo'),
  body('item_type').optional().isIn(['mano_de_obra', 'repuesto', 'otro']).withMessage('Tipo de item invalido'),
  handleValidation
];

const updateItemRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  param('itemId').isUUID().withMessage('ID de item invalido'),
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
  body('unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario debe ser positivo'),
  body('item_type').optional().isIn(['mano_de_obra', 'repuesto', 'otro']).withMessage('Tipo de item invalido'),
  handleValidation
];

// Payments
const addPaymentRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  body('amount').isFloat({ gt: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('method').optional().isIn(['efectivo', 'transferencia', 'credito']).withMessage('Metodo de pago invalido'),
  body('payment_date').optional().isISO8601().withMessage('Fecha de pago invalida'),
  handleValidation
];

// Users
const createUserRules = [
  body('username').trim().notEmpty().withMessage('Username es requerido')
    .isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
  body('password').notEmpty().withMessage('Contrasena es requerida')
    .isLength({ min: 6 }).withMessage('Contrasena debe tener al menos 6 caracteres'),
  body('full_name').trim().notEmpty().withMessage('Nombre completo es requerido'),
  body('role').optional().isIn(['admin', 'recepcionista', 'mecanico']).withMessage('Rol invalido'),
  handleValidation
];

const updateUserRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('password').optional().isLength({ min: 6 }).withMessage('Contrasena debe tener al menos 6 caracteres'),
  body('role').optional().isIn(['admin', 'recepcionista', 'mecanico']).withMessage('Rol invalido'),
  handleValidation
];

// UUID param validator (reusable)
const uuidParam = [
  param('id').isUUID().withMessage('ID invalido'),
  handleValidation
];

module.exports = {
  loginRules, createClientRules, updateClientRules,
  createVehicleRules, updateVehicleRules, transferOwnershipRules,
  createJobRules, updateJobRules, addItemRules, updateItemRules,
  addPaymentRules, createUserRules, updateUserRules, uuidParam
};
