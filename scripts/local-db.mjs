// Start/stop the local PostgreSQL cluster hustl uses in development.
//   npm run db:start | db:stop | db:status
//
// It runs on port 5433 with trust auth, separate from any PostgreSQL service
// already installed, so it needs no password and can't disturb other projects.
// Override with PG_BIN (PostgreSQL bin directory) and PG_PORT.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PG_BIN = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin"
const PORT = process.env.PG_PORT ?? "5433"
const DATA = process.env.PGDATA_DIR ?? join(root, ".local", "pgdata")
const LOG = join(root, ".local", "pg.log")
const DATABASES = ["hustl", "hustl_test"]

const bin = (name) => join(PG_BIN, name)
const run = (name, args, opts = {}) => execFileSync(bin(name), args, { encoding: "utf8", ...opts })

function isRunning() {
  try {
    run("pg_isready", ["-h", "localhost", "-p", PORT], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

function start() {
  if (isRunning()) return console.log(`PostgreSQL already accepting connections on :${PORT}`)
  if (!existsSync(join(DATA, "PG_VERSION"))) {
    mkdirSync(dirname(DATA), { recursive: true })
    console.log(`Creating a new cluster in ${DATA} …`)
    run("initdb", ["-D", DATA, "-U", "hustl", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "inherit" })
  }
  run("pg_ctl", ["-D", DATA, "-o", `-p ${PORT}`, "-l", LOG, "-w", "start"], { stdio: "inherit" })
  for (const db of DATABASES) {
    try {
      run("createdb", ["-h", "localhost", "-p", PORT, "-U", "hustl", db], { stdio: "pipe" })
      console.log(`Created database ${db}`)
    } catch {
      // already exists
    }
  }
  console.log(`\nDATABASE_URL=postgresql://hustl@localhost:${PORT}/hustl?schema=public`)
}

const commands = {
  start,
  stop: () => (isRunning() ? run("pg_ctl", ["-D", DATA, "-w", "stop"], { stdio: "inherit" }) : console.log("Not running")),
  status: () => console.log(isRunning() ? `up on :${PORT}` : "down"),
}

const command = commands[process.argv[2] ?? "start"]
if (!command) {
  console.error("Usage: node scripts/local-db.mjs [start|stop|status]")
  process.exit(1)
}
try {
  command()
} catch (err) {
  console.error(`\nFailed. Is PostgreSQL installed at ${PG_BIN}? Set PG_BIN to its bin directory.\n${err.message}`)
  process.exit(1)
}
