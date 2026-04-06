import cors from 'cors';
import logger from 'morgan';
import express from 'express';
import cookieParser from 'cookie-parser';
import indexController from './src/routes/index.js';
import { errorHandler } from './src/middlewares/errorHandler.js';

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', indexController);
app.use(errorHandler);

export default app;