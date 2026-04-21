import cors from 'cors';
import morgan from 'morgan';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import indexRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app: Express = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());
// app.use(cors({
//   origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:3000',
//   credentials: true,
// }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes
app.use('/', indexRouter);

// Error handling
app.use(errorHandler);

export default app;