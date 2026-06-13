'use strict';

const pLimit = require('p-limit');
const pool = require('../config/database');
const { evaluateAndPersist } = require('../controllers/alertsController');

const TICK_MS = 5 * 60 * 1000;  // 5 minutos
const EVAL_CONCURRENCY = parseInt(process.env.ALERTS_EVAL_CONCURRENCY, 10) || 5;

// Jitter base + ventana (HU-05). Tests pueden setear ALERTS_RUNNER_JITTER_MS=0
// para evitar la espera aleatoria de hasta 30s en el primer tick.
function initialDelayMs() {
  if (process.env.ALERTS_RUNNER_JITTER_MS != null) {
    return parseInt(process.env.ALERTS_RUNNER_JITTER_MS, 10);
  }
  return 15_000 + Math.floor(Math.random() * 30_000);
}

let timer = null;

// HU-05: pg_try_advisory_xact_lock evita que dos instancias del backend
// (e.g. detrás de un load balancer) evalúen la misma definición a la vez.
// hashtext convierte el UUID a int4 para el lock; el riesgo de colisión es
// despreciable y el peor caso es un skip de una def por tick.
async function evaluateWithLock(def) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
      [def.id]
    );
    if (!r.rows[0].locked) {
      await client.query('ROLLBACK');
      return { skipped: true };
    }
    await evaluateAndPersist(def);
    await client.query('COMMIT');
    return { skipped: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function tick() {
  try {
    const due = await pool.query(`
      SELECT * FROM alert_definitions
      WHERE enabled = true
        AND (last_evaluated_at IS NULL
             OR last_evaluated_at + (eval_interval_hours * INTERVAL '1 hour') < NOW())
    `);
    if (due.rows.length === 0) return;

    // HU-06: limitar concurrencia para no saturar el pool de conexiones.
    const limit = pLimit(EVAL_CONCURRENCY);
    let skipped = 0;
    let failed = 0;

    await Promise.all(due.rows.map(def => limit(async () => {
      try {
        const r = await evaluateWithLock(def);
        if (r.skipped) skipped++;
      } catch (err) {
        failed++;
        console.error(`[alertRunner] eval failed for ${def.id}:`, err.message);
      }
    })));

    console.log(
      `[alertRunner] tick: ${due.rows.length} due, ` +
      `${skipped} skipped (lock), ${failed} failed`
    );
  } catch (err) {
    console.error('[alertRunner] tick failed:', err.message);
  }
}

function start() {
  if (timer) return;
  setTimeout(tick, initialDelayMs());
  timer = setInterval(tick, TICK_MS);
  console.log(`[alertRunner] started (tick every ${TICK_MS / 1000}s)`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick, evaluateWithLock };
