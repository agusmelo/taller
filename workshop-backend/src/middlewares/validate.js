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
  body('items.*.children').optional().isArray().withMessage('children debe ser un array'),
  body('items.*.children.*.description').optional().trim().notEmpty().withMessage('Descripcion del detalle es requerida'),
  body('items.*.children.*.unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario del detalle debe ser positivo'),
  handleValidation
];

const updateJobRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('status').optional().isIn(['abierto', 'terminado', 'pagado']).withMessage('Estado invalido'),
  body('tax_rate').optional().isFloat({ min: 0, max: 1 }).withMessage('tax_rate debe estar entre 0 y 1'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Descuento debe ser positivo'),
  body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('Tipo de descuento invalido'),
  body('job_date').optional().isISO8601().withMessage('Fecha del trabajo invalida'),
  body('show_item_details_pricing').optional().isBoolean().withMessage('show_item_details_pricing debe ser booleano'),
  handleValidation
];

// Job Items
const addItemRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  body('description').trim().notEmpty().withMessage('Descripcion es requerida'),
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
  body('unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario debe ser positivo'),
  body('item_type').optional().isIn(['mano_de_obra', 'repuesto', 'otro']).withMessage('Tipo de item invalido'),
  body('parent_id').optional({ values: 'null' }).isUUID().withMessage('parent_id debe ser un UUID valido'),
  body('catalog_item_id').optional({ values: 'null' }).isUUID().withMessage('catalog_item_id debe ser un UUID valido'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order debe ser entero >= 0'),
  body('children').optional().isArray().withMessage('children debe ser un array'),
  body('children.*.description').optional().trim().notEmpty().withMessage('Descripcion del detalle es requerida'),
  body('children.*.unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario del detalle debe ser positivo'),
  handleValidation
];

const updateItemRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  param('itemId').isUUID().withMessage('ID de item invalido'),
  body('quantity').optional().isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
  body('unit_price').optional().isFloat({ min: 0 }).withMessage('Precio unitario debe ser positivo'),
  body('item_type').optional().isIn(['mano_de_obra', 'repuesto', 'otro']).withMessage('Tipo de item invalido'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order debe ser entero >= 0'),
  handleValidation
];

// Payments
const addPaymentRules = [
  param('id').isUUID().withMessage('ID de trabajo invalido'),
  body('amount').isFloat({ gt: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('method').optional().isIn(['efectivo', 'transferencia', 'credito', 'cheque']).withMessage('Metodo de pago invalido'),
  body('payment_date').optional().isISO8601().withMessage('Fecha de pago invalida'),
  handleValidation
];

// Users
const createUserRules = [
  body('username').trim().notEmpty().withMessage('Username es requerido')
    .isLength({ min: 3 }).withMessage('Username debe tener al menos 3 caracteres'),
  body('password').notEmpty().withMessage('Contrasena es requerida')
    .isLength({ min: 8 }).withMessage('Contrasena debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('Contrasena debe tener al menos una mayuscula')
    .matches(/[0-9]/).withMessage('Contrasena debe tener al menos un numero'),
  body('full_name').trim().notEmpty().withMessage('Nombre completo es requerido'),
  body('role').optional().isIn(['admin', 'recepcionista', 'mecanico']).withMessage('Rol invalido'),
  handleValidation
];

const updateUserRules = [
  param('id').isUUID().withMessage('ID invalido'),
  body('password').optional()
    .isLength({ min: 8 }).withMessage('Contrasena debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('Contrasena debe tener al menos una mayuscula')
    .matches(/[0-9]/).withMessage('Contrasena debe tener al menos un numero'),
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
