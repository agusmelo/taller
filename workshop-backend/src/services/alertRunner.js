const pool = require('../config/database');
const { evaluateAndPersist } = require('../controllers/alertsController');

const TICK_MS = 5 * 60 * 1000;  // 5 minutes
let timer = null;

async function tick() {
  try {
    const due = await pool.query(`
      SELECT * FROM alert_definitions
      WHERE enabled = true
        AND (last_evaluated_at IS NULL
             OR last_evaluated_at + (eval_interval_hours * INTERVAL '1 hour') < NOW())
    `);
    if (due.rows.length === 0) return;

    for (const def of due.rows) {
      try {
        await evaluateAndPersist(def);
      } catch (err) {
        console.error(`[alertRunner] eval failed for ${def.id}:`, err.message);
      }
    }
    console.log(`[alertRunner] evaluated ${due.rows.length} definition(s)`);
  } catch (err) {
    console.error('[alertRunner] tick failed:', err.message);
  }
}

function start() {
  if (timer) return;
  // First tick: short delay so server can finish booting
  setTimeout(tick, 15_000);
  timer = setInterval(tick, TICK_MS);
  console.log(`[alertRunner] started (tick every ${TICK_MS / 1000}s)`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
