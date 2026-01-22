import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/auth', authRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use(errorHandler);

export default app;
