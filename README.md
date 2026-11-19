# RetailIQ — Retail Analytics & Store Intelligence

RetailIQ turns Walmart's historical weekly sales dataset into an interactive analytics dashboard. The application combines a React + TypeScript frontend with a FastAPI data and machine-learning API.

## What it does

- Summarizes sales volume, stores, departments, and average weekly sales.
- Explores weekly and monthly sales trends.
- Compares stores by total sales, average sales, and sales variability.
- Segments stores into three descriptive K-Means groups.
- Evaluates a Random Forest using a chronological holdout and compares it with a seasonal-naive baseline.

The included data describes Walmart weekly sales from 2010–2012. Analytics are descriptive and do not establish causal relationships or guarantee future performance.

## Project layout

```text
RetailIQ/
├── archive/             # Original notebooks and project presentation
├── backend/
│   ├── app/main.py      # FastAPI endpoints and analytics
│   └── requirements.txt
├── data/                # Walmart sales, features, and store CSV files
├── frontend/
│   ├── src/             # React dashboard
│   ├── .env.example
│   └── vercel.json
├── render.yaml          # Render API service
└── README.md
```

## Run locally

### Backend

From the project root, create and activate a virtual environment, then install the backend dependencies:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`; interactive API documentation is at `http://localhost:8000/docs`.

### Frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The frontend defaults to the deployed RetailIQ API. For local backend development, copy `frontend/.env.example` to `frontend/.env.local`; its value points to `http://localhost:8000`. To use another backend, set `VITE_API_URL` to its origin, without a trailing slash or `/api` path.

Build and type-check the frontend with:

```powershell
cd frontend
npm run build
```

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/overview` | Dataset-level sales KPIs and date range |
| `GET` | `/api/sales/trend?granularity=month` | Sales grouped by month; accepts `month` or `week` |
| `GET` | `/api/stores` | Store sales, variability, type, and size |
| `GET` | `/api/segments` | Three-cluster K-Means store segmentation |
| `GET` | `/api/model/evaluation` | Cached Random Forest evaluation and baseline metrics |

## Deploy: Render API + Vercel frontend

Deployment requires a Git repository connected to your own Render and Vercel accounts. The project includes configuration for both platforms; this workspace cannot publish to accounts without their authorization.

### 1. Deploy the API to Render

1. Push the project to a Git provider supported by Render.
2. In Render, create a **Blueprint** from the repository. Render will use the root `render.yaml` to build the `retailiq-api` service.
3. Set the service's `CORS_ORIGINS` environment variable to your exact Vercel site origin, for example `https://retailiq.vercel.app`. Add additional origins as a comma-separated list; include `http://localhost:5173` if you still need local development.
4. Wait for the service to become healthy at `/api/health`, then copy its public origin, for example `https://retailiq-api.onrender.com`.

The free Render instance may sleep when idle and take longer to answer its first request after waking.

### 2. Deploy the frontend to Vercel

1. Import the same repository into Vercel and set the **Root Directory** to `frontend`.
2. Use `npm run build` as the build command and `dist` as the output directory. `frontend/vercel.json` configures client-side route fallback.
3. Optionally add the `VITE_API_URL` environment variable with the Render API origin, e.g. `https://retailiq-api.onrender.com` (no trailing slash and no `/api`). The frontend defaults to this project's Render API URL.
4. Deploy the site. The API allows this project's production origin (`https://retailiq-sigma.vercel.app`) in addition to origins listed in `CORS_ORIGINS`. If your Vercel production domain differs, add that exact origin to Render's `CORS_ORIGINS` variable, then redeploy the API.

Vite embeds `VITE_API_URL` during the frontend build, so redeploy the frontend after changing it. Check the deployed site, its browser console, and `https://YOUR-API.onrender.com/docs` after both services are live.

## Model evaluation notes

The model endpoint holds out the latest 20% of unique dates, fits imputation values on the training period only, and reports MAE, RMSE, and R² on later observations. Its seasonal-naive baseline uses the prior year's sales for the same store and department where available; missing matches use the training-period target median. The endpoint is cached for the lifetime of the API process, so the first evaluation after a cold start takes longer. Feature importance is descriptive, not causal.

## Limitations

- The API serves the bundled dataset; there is no data upload or persistence workflow.
- The application is read-only and has no authentication or user-specific access control. Do not treat it as a private-data service without adding those controls.
- Store clusters are descriptive and cluster IDs do not imply a performance ranking.
- Free hosting tiers may have cold starts, resource limits, or other plan restrictions.
