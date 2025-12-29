# Backend Startup Guide

## Quick Start

The Tree of Life System backend is a Node.js Express server that provides API endpoints for the system.

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the backend server:**
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Verify the server is running:**
   The server will start on port 3000 (or the PORT specified in .env)
   
   You should see:
   ```
   Tree of Life System API listening on port 3000
   Health check at http://localhost:3000/health
   ```

### Testing the API

Test the endpoints using curl:

```bash
# Health check endpoint
curl http://localhost:3000/health

# Main endpoint
curl http://localhost:3000/

# Status endpoint
curl http://localhost:3000/api/v1/status
```

Expected responses:
- `/health`: `{"status":"healthy"}`
- `/`: `{"status":"healthy","service":"Tree of Life System","version":"1.0.0"}`
- `/api/v1/status`: `{"status":"operational"}`

### Configuration

Environment variables are configured in `.env` file:
- `PORT`: Server port (default: 3000)
- See `.env` file for full configuration options

### Available Scripts

- `npm start`: Start the server
- `npm run dev`: Start with nodemon for development
- `npm test`: Run tests
- `npm run lint`: Run ESLint

### Troubleshooting

**Port already in use:**
If port 3000 is already in use, either:
- Stop the process using port 3000
- Change the PORT in your .env file

**Dependencies not installed:**
Run `npm install` to install all required dependencies

### API Endpoints

- `GET /`: Main health check with service information
- `GET /health`: Simple health check
- `GET /api/v1/status`: Operational status

## Architecture

The backend follows a simple Express.js architecture:
- **server.js**: Main application entry point
- **Middleware**: CORS, JSON parsing, error handling
- **Routes**: RESTful API endpoints

For more information about the full Tree of Life System architecture, see [README.md](README.md).
