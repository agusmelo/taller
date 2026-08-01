#!/usr/bin/env node
// Single entrypoint to stand up any environment with one parameter.
//
//   node scripts/env.js dev             full local stack: docker-compose.dev.yml
//                                        (db-dev + migrate-dev + api-dev + frontend-dev), dev data
//   node scripts/env.js test            full isolated QA stack: docker-compose.test.yml
//                                        (db-test + migrate-test + api-test + frontend-test),
//                                        fixed seed dataset
//   node scripts/env.js prod            local rehearsal of the prod deploy sequence
//                                        (builds fresh, never touches the real server)
//   node scripts/env.js prod --deploy   the real deploy — runs deploy.sh as-is.
//                                        Only makes sense run on the Raspberry Pi itself
//                                        (deploy.sh assumes /home/pi/workshop); this is
//                                        not something to run from a dev machine.
//
// Each `docker compose up` already resolves db -> migrate -> api -> frontend
// ordering via the depends_on/condition chains declared in the compose files,
// so one command is enough per environment.

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function dev() {
  console.log('=== dev: docker-compose.dev.yml (db-dev + migrate-dev + api-dev + frontend-dev) ===');
  run('docker compose -f docker-compose.dev.yml up --build -d');
  console.log(`
dev listo.
  API:      http://localhost:3000
  Frontend: http://localhost:4200
  Login:    admin / admin123
`);
}

function test() {
  console.log('=== test: docker-compose.test.yml (db-test + migrate-test + api-test + frontend-test) ===');
  run('docker compose -f docker-compose.test.yml up --build -d');
  console.log(`
test listo.
  API:      http://localhost:3001
  Frontend: http://localhost:4201
  Login:    admin / admin123 (dataset de QA fijo)

Para re-seedear (trunca y recarga el mismo dataset) sin tocar api/frontend:
  docker compose -f docker-compose.test.yml run --rm migrate-test
`);
}

function prodLocal() {
  console.log('=== prod (rehearsal local): mismos pasos que deploy.sh, pero buildeando en vez de pull ===');
  run('docker compose build');
  run('docker compose up -d db');
  run('docker compose run --rm migrate');
  run('docker compose up -d api frontend');
  console.log(`
prod (local) listo — valida que build, migraciones y arranque de api/frontend
funcionan, igual que en el deploy real.

Esto NO toca ningun servidor real. Y a diferencia de dev/test, aca no hay una
URL de localhost para abrir en el navegador: docker-compose.yml (el de prod)
ya no publica puertos de api/frontend al host, solo el reverse proxy 'edge'
en :80/:443 (que espera un dominio real + certificados TLS, asi que tampoco
sirve localmente). Para chequear que arranco bien:
  docker compose logs -f api      # deberia mostrar "Workshop API corriendo"
  docker compose ps               # api/frontend en estado "running"
`);
}

function prodDeploy() {
  console.log('=== prod --deploy: deploy real via deploy.sh ===');
  console.log('Esto asume que estas corriendo esto DESDE el servidor de produccion (deploy.sh usa /home/pi/workshop).\n');
  run('bash ./deploy.sh');
}

function usage() {
  console.error('Uso: node scripts/env.js <dev|test|prod> [--deploy]');
  process.exit(1);
}

const [, , envName, ...flags] = process.argv;
const deploy = flags.includes('--deploy');

if (!envName || !['dev', 'test', 'prod'].includes(envName)) usage();
if (deploy && envName !== 'prod') usage();

if (envName === 'dev') dev();
else if (envName === 'test') test();
else if (envName === 'prod') (deploy ? prodDeploy() : prodLocal());
