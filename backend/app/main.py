from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os
import pandas as pd
import numpy as np
from functools import lru_cache
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CORS_ORIGINS = [
    origin
    for origin in {
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    } | {"https://retailq-sigma.vercel.app"}
]

app = FastAPI(title="RetailIQ API", version="1.0.0",
              description="Retail sales analytics and store optimization API")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

@lru_cache(maxsize=1)
def load_data():
    sales = pd.read_csv(DATA / "sales data-set.csv")
    features = pd.read_csv(DATA / "Features data set.csv")
    stores = pd.read_csv(DATA / "stores data-set.csv")
    for df in (sales, features):
        df["Date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
    markdown_cols = [f"MarkDown{i}" for i in range(1, 6)]
    features[markdown_cols] = features[markdown_cols].fillna(0)
    for col in ["CPI", "Unemployment"]:
        features[col] = features.groupby("Store")[col].transform(
            lambda s: s.ffill().bfill()
        )
        features[col] = features[col].fillna(features[col].median())
    merged = sales.merge(features, on=["Store", "Date", "IsHoliday"], how="left")
    merged = merged.merge(stores, on="Store", how="left")
    merged["Month"] = merged["Date"].dt.month
    merged["Year"] = merged["Date"].dt.year
    merged["Week"] = merged["Date"].dt.isocalendar().week.astype(int)
    merged = merged.replace([np.inf, -np.inf], np.nan)
    return merged, stores

def records(df):
    return df.replace({np.nan: None}).to_dict(orient="records")

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "RetailIQ API"}

@app.get("/api/overview")
def overview():
    df, stores = load_data()
    total = float(df["Weekly_Sales"].sum())
    return {
        "total_sales": round(total, 2),
        "sales_records": int(len(df)),
        "stores": int(stores["Store"].nunique()),
        "departments": int(df["Dept"].nunique()),
        "average_weekly_sales": round(float(df["Weekly_Sales"].mean()), 2),
        "date_start": df["Date"].min().strftime("%Y-%m-%d"),
        "date_end": df["Date"].max().strftime("%Y-%m-%d"),
    }

@app.get("/api/sales/trend")
def sales_trend(granularity: str = "month"):
    if granularity not in {"month", "week"}:
        raise HTTPException(400, "granularity must be month or week")
    df, _ = load_data()
    key = df["Date"].dt.to_period("M").astype(str) if granularity == "month" else df["Date"].dt.to_period("W").astype(str)
    result = df.assign(period=key).groupby("period", as_index=False)["Weekly_Sales"].sum()
    return records(result.rename(columns={"period": "period", "Weekly_Sales": "sales"}))

@app.get("/api/stores")
def store_performance():
    df, _ = load_data()
    result = df.groupby("Store").agg(
        total_sales=("Weekly_Sales", "sum"),
        avg_weekly_sales=("Weekly_Sales", "mean"),
        sales_volatility=("Weekly_Sales", "std"),
        store_type=("Type", "first"),
        size=("Size", "first")
    ).reset_index()
    result["sales_volatility"] = result["sales_volatility"].fillna(0)
    return records(result.sort_values("total_sales", ascending=False))

@app.get("/api/segments")
def store_segments():
    df, _ = load_data()
    summary = df.groupby("Store").agg(
        avg_sales=("Weekly_Sales", "mean"),
        sales_std=("Weekly_Sales", "std"),
        size=("Size", "first"),
        store_type=("Type", "first")
    ).reset_index()
    summary["sales_std"] = summary["sales_std"].fillna(0)
    summary["sales_cv"] = np.where(summary["avg_sales"] != 0,
                                   summary["sales_std"] / summary["avg_sales"], 0)
    features = summary[["avg_sales", "sales_cv", "size"]].fillna(0)
    scaled = StandardScaler().fit_transform(features)
    summary["cluster"] = KMeans(n_clusters=3, random_state=42, n_init=10).fit_predict(scaled)
    return records(summary.sort_values(["cluster", "avg_sales"], ascending=[True, False]))

@app.get("/api/model/evaluation")
@lru_cache(maxsize=1)
def model_evaluation():
    df, _ = load_data()
    cols = ["Store", "Dept", "Temperature", "Fuel_Price", "CPI", "Unemployment",
            "IsHoliday", "Type", "Size", "Month", "Week",
            "MarkDown1", "MarkDown2", "MarkDown3", "MarkDown4", "MarkDown5"]
    model_df = df[["Date", "Store", "Dept", "Weekly_Sales"] + cols[2:]].copy()
    model_df["IsHoliday"] = model_df["IsHoliday"].astype(int)
    model_df["Type"] = model_df["Type"].map({"A": 0, "B": 1, "C": 2})
    model_df[cols] = model_df[cols].replace([np.inf, -np.inf], np.nan)

    dates = np.sort(model_df["Date"].dropna().unique())
    if len(dates) < 2:
        raise HTTPException(500, "Not enough distinct dates to evaluate the model")
    cutoff_index = min(len(dates) - 1, max(1, int(len(dates) * 0.8)))
    cutoff_date = dates[cutoff_index]
    train_mask = model_df["Date"] < cutoff_date
    test_mask = model_df["Date"] >= cutoff_date
    X_train = model_df.loc[train_mask, cols]
    X_test = model_df.loc[test_mask, cols]
    y_train = model_df.loc[train_mask, "Weekly_Sales"]
    y_test = model_df.loc[test_mask, "Weekly_Sales"]
    if X_train.empty or X_test.empty:
        raise HTTPException(500, "Unable to create chronological model holdout")

    medians = X_train.median(numeric_only=True)
    X_train = X_train.fillna(medians).fillna(0)
    X_test = X_test.fillna(medians).fillna(0)
    model = RandomForestRegressor(n_estimators=120, random_state=42, n_jobs=-1,
                                  min_samples_leaf=2)
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    train_sales = model_df.loc[train_mask, ["Store", "Dept", "Date", "Weekly_Sales"]]
    seasonal_baseline = (
        model_df.loc[test_mask, ["Store", "Dept", "Date"]]
        .assign(seasonal_date=lambda test: test["Date"] - pd.Timedelta(weeks=52))
        .merge(
            train_sales.rename(
                columns={"Date": "seasonal_date", "Weekly_Sales": "seasonal_sales"}
            ),
            on=["Store", "Dept", "seasonal_date"],
            how="left",
        )["seasonal_sales"]
        .fillna(float(y_train.median()))
        .to_numpy()
    )
    train_end = model_df.loc[train_mask, "Date"].max()
    test_start = model_df.loc[test_mask, "Date"].min()
    return {
        "model": "Random Forest Regressor",
        "test_rows": int(len(y_test)),
        "train_end": train_end.strftime("%Y-%m-%d"),
        "test_start": test_start.strftime("%Y-%m-%d"),
        "mae": round(float(mean_absolute_error(y_test, pred)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test, pred))), 2),
        "r2": round(float(r2_score(y_test, pred)), 4),
        "baseline_mae": round(
            float(mean_absolute_error(y_test, seasonal_baseline)), 2
        ),
        "baseline_rmse": round(
            float(np.sqrt(mean_squared_error(y_test, seasonal_baseline))), 2
        ),
        "feature_importance": [
            {"feature": name, "importance": round(float(value), 5)}
            for name, value in sorted(zip(cols, model.feature_importances_),
                                      key=lambda x: x[1], reverse=True)
        ]
    }
