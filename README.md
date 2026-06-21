# 🌿 Carbon Footprint Tracker

A full-stack MERN application that helps individuals track, understand, and reduce their personal carbon footprint through daily logging and gamified progress.

---

## Tech Stack

| Layer     | Technology                                               |
|-----------|----------------------------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, Recharts                  |
| Backend   | Node.js, Express 4, MongoDB, Mongoose                   |
| Auth      | JWT (access token) + httpOnly cookie (refresh token)    |
| Security  | Helmet, CORS, express-rate-limit, express-mongo-sanitize |

---

## Project Structure

```
carbon-tracker/
├── package.json              ← Root workspace (concurrently dev runner)
├── .env.example
│
├── server/
│   ├── app.js                ← Express entry point
│   ├── config/db.js          ← MongoDB connection
│   ├── controllers/
│   │   ├── authController.js ← register, login, logout, me, refresh
│   │   └── carbonController.js ← submitLog, getStats, getDashboard
│   ├── middleware/
│   │   ├── auth.js           ← JWT protect() guard
│   │   ├── authLimiter.js    ← Brute-force rate limiters
│   │   ├── errorHandler.js   ← Centralised error + 404
│   │   └── validateRequest.js ← express-validator collector
│   ├── models/
│   │   ├── User.js           ← Schema + XP/badge/streak methods
│   │   └── Log.js            ← Daily activity log schema
│   ├── routes/
│   │   ├── authRoutes.js     ← /api/v1/auth/*
│   │   └── carbonRoutes.js   ← /api/v1/carbon/*
│   └── utils/
│       ├── carbonEngine.js   ← Pure emission calculator
│       └── logger.js         ← Winston logger
│
└── client/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx           ← Router + lazy-loaded pages
        ├── index.css         ← Tailwind + DM Mono / Inter fonts
        ├── context/
        │   └── AuthContext.jsx  ← Global auth state
        ├── services/
        │   └── api.js           ← Fetch wrapper for all endpoints
        ├── components/
        │   ├── Dashboard.jsx    ← Main authenticated view
        │   ├── dashboard/
        │   │   ├── CarbonGauge.jsx    ← SVG radial gauge
        │   │   └── AnalyticsChart.jsx ← 7-day Recharts bar chart
        │   ├── tracker/
        │   │   └── CarbonLogForm.jsx  ← 4-step log modal
        │   ├── layout/
        │   │   └── ProtectedRoute.jsx ← Auth guard
        │   └── ui/
        │       └── index.jsx    ← MetricCard, XPBar, BadgeChip, etc.
        └── pages/
            └── AuthPage.jsx     ← Login + 2-step register
```

---

## Quick Start

### 1. Prerequisites

- Node.js ≥ 18
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))

### 2. Clone and install

```bash
git clone <your-repo-url> carbon-tracker
cd carbon-tracker
npm run install:all
```

### 3. Configure environment

```bash
# Copy the example and fill in your values
cp .env.example server/.env
```

Open `server/.env` and set at minimum:

```env
MONGO_URI=mongodb://localhost:27017/carbon_tracker
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
PORT=5000
```

### 4. Run in development

```bash
npm run dev
```

This starts both servers concurrently:
- **API**      → http://localhost:5000/api/v1
- **Frontend** → http://localhost:5173
- **Health**   → http://localhost:5000/health

---

## API Reference

### Auth — `/api/v1/auth`

| Method | Path        | Auth | Description                          |
|--------|-------------|------|--------------------------------------|
| POST   | /register   | —    | Create account, returns JWT          |
| POST   | /login      | —    | Authenticate, returns JWT            |
| POST   | /logout     | —    | Clear refresh token                  |
| POST   | /refresh    | —    | New access token via refresh cookie  |
| GET    | /me         | JWT  | Get current user profile             |
| PATCH  | /me         | JWT  | Update name or baseline              |

### Carbon — `/api/v1/carbon`

| Method | Path          | Auth | Description                          |
|--------|---------------|------|--------------------------------------|
| POST   | /log          | JWT  | Submit daily carbon log              |
| GET    | /logs         | JWT  | Paginated log history                |
| GET    | /logs/:id     | JWT  | Single log detail                    |
| GET    | /stats        | JWT  | Aggregated lifetime statistics       |
| GET    | /dashboard    | JWT  | Lightweight dashboard payload        |

### Example: Submit a log

```bash
curl -X POST http://localhost:5000/api/v1/carbon/log \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "diet": "vegetarian",
    "energy": { "electricityKwh": 5, "naturalGasKwh": 2 },
    "transport": [
      { "mode": "train", "distanceKm": 20 },
      { "mode": "walking", "distanceKm": 1 }
    ]
  }'
```

---

## Carbon Emission Coefficients

| Category        | Source                                            |
|-----------------|---------------------------------------------------|
| Transport       | UK DEFRA Greenhouse Gas Conversion Factors 2023   |
| Diet            | Poore & Nemecek (2018); Oxford / Our World in Data|
| Home energy     | UK DEFRA 2023; UK BEIS gas combustion factor      |

---

## Gamification

- **+10 XP** for every day logged (participation)
- **+20 XP** bonus when you beat your personal baseline
- **+1 XP** per full kg saved below baseline (capped at 50)
- **Streak multipliers**: ×1.25 at 7 days · ×1.5 at 14 days · ×2.0 at 30 days
- **10 badges** awarded for milestones (first log, streaks, carbon reduction %, green commuting, plant-based weeks, low energy days)
- **Level system**: `level = floor(sqrt(XP / 100)) + 1`
