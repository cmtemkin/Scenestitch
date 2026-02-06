// Simple health check server to verify production deployment
import express from 'express';

const app = express();
const port = process.env.PORT || 5000;

// Basic middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Basic API test
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'API is working' });
});

// Scenes endpoint with minimal dependencies
app.get('/api/scenes/:scriptId', async (req, res) => {
  try {
    const scriptId = parseInt(req.params.scriptId);
    console.log(`Health server: Request for scenes ${scriptId}`);
    
    // Return static response for now to verify routing works
    if (scriptId === 132) {
      res.status(200).json({ 
        scenes: [
          { id: 1, scriptId: 132, sceneNumber: 1, title: "Test Scene", scriptExcerpt: "Test content" }
        ]
      });
    } else {
      res.status(200).json({ scenes: [] });
    }
  } catch (err) {
    console.error('Health server error:', err);
    res.status(200).json({ scenes: [] });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Health check server running on port ${port}`);
});

export default app;