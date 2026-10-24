import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load variables from your .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable cross-origin resource sharing so your React frontend can talk to this server
app.use(cors());
app.use(express.json());

// A simple test route to ensure your backend is responsive
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Freelancer Copilot Backend is active!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
