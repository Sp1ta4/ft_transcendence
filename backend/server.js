import 'dotenv/config'
import app from './app.js';
import debug from 'debug';
import http from 'http';
import prisma from "./src/resources/prisma.js";
import redis from "./src/resources/redis.js";

const _debug = debug('pet-project:server');

async function checkConnections() {
  try {
    await prisma.$connect();
    console.log("Postgres connected");
    await redis.set("check_connection", "connected");
    const redisValue = await redis.get("check_connection");
    console.log("Redis connected, test value:", redisValue);
    await redis.del("check_connection");
  } catch (err) {
    console.error("Connection error:", err);
    process.exit(1);
  }
}

const port = normalizePort(process.env.PORT || '8080');
app.set('port', port);

const server = http.createServer(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  _debug('Listening on ' + bind);
  checkConnections();
  console.log('Server is running on ' + bind);
}
