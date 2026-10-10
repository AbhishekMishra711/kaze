import os
import math
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI
from pydantic import BaseModel, Field
from train_model import train_and_save_model

MODEL_PATH = os.path.join(os.path.dirname(__file__), "forecaster_model.joblib")

# Ensure trained ML model artifact exists
if not os.path.exists(MODEL_PATH):
    print("[STARTUP] No model artifact found. Training calibrated gradient boosting pipeline...")
    train_and_save_model(MODEL_PATH)

print(f"[STARTUP] Loading trained ML model from: {MODEL_PATH}")
model_pipeline = joblib.load(MODEL_PATH)
print("[STARTUP] Calibrated ML Model Pipeline loaded successfully into memory!")

app = FastAPI(
    title="HLTH-02 Real-Time Emergency Resource Allocator - Explainable ML Forecaster",
    version="2.1.0",
    description="Explainable Calibrated HistGradientBoosting model for Resource Availability Probability at ETA"
)

class PredictRequest(BaseModel):
    hospital_id: str = Field(default="aditya-birla-01")
    resource_category: str = Field(default="ICU_BED")
    current_free_units: int = Field(ge=0, default=2)
    eta_minutes: float = Field(ge=1.0, default=15.0)
    time_of_day_hour: int = Field(default=14, ge=0, le=23)

class FeatureContribution(BaseModel):
    demand_pressure: str
    peak_surge_status: str

class XAIAttribution(BaseModel):
    feature: str
    impact: str
    direction: str
    description: str

class PredictResponse(BaseModel):
    p_available: float
    model_version: str
    eta_minutes: float
    ci_lower: float
    ci_upper: float
    algorithm: str
    xai_attributions: list[XAIAttribution]
    clinical_summary: str
    insights: FeatureContribution

def build_feature_df(category: str, free_units: int, eta: float, hour: int) -> pd.DataFrame:
    sin_h = math.sin(2 * math.pi * hour / 24.0)
    cos_h = math.cos(2 * math.pi * hour / 24.0)
    is_p = 1 if ((8 <= hour <= 11) or (18 <= hour <= 21)) else 0
    ratio = eta / (free_units + 1.0)
    return pd.DataFrame([{
        "resource_category": category,
        "current_free_units": free_units,
        "eta_minutes": eta,
        "time_of_day_hour": hour,
        "sin_hour": sin_h,
        "cos_hour": cos_h,
        "is_peak_hours": is_p,
        "demand_pressure_ratio": ratio
    }])

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "hlth02-forecaster-ml",
        "model_loaded": model_pipeline is not None,
        "model_version": "v2.1-explainable-calibrated-gbm"
    }

@app.post("/predict", response_model=PredictResponse)
def predict_availability(req: PredictRequest):
    # 1. Base Input Prediction
    actual_df = build_feature_df(req.resource_category, req.current_free_units, req.eta_minutes, req.time_of_day_hour)
    p_actual = float(model_pipeline.predict_proba(actual_df)[0][1])

    # 2. Explainable AI (XAI) Marginal Attributions
    # Reference baseline state (neutral baseline)
    ref_df = build_feature_df("GENERAL_BED", 1, 20.0, 14)
    p_ref = float(model_pipeline.predict_proba(ref_df)[0][1])

    # Feature 1: Current Free Units Effect
    df_units = build_feature_df("GENERAL_BED", req.current_free_units, 20.0, 14)
    delta_units = float(model_pipeline.predict_proba(df_units)[0][1]) - p_ref

    # Feature 2: Peak Surge Effect
    df_peak = build_feature_df("GENERAL_BED", 1, 20.0, req.time_of_day_hour)
    delta_peak = float(model_pipeline.predict_proba(df_peak)[0][1]) - p_ref

    # Feature 3: ETA Travel Time Effect
    df_eta = build_feature_df("GENERAL_BED", 1, req.eta_minutes, 14)
    delta_eta = float(model_pipeline.predict_proba(df_eta)[0][1]) - p_ref

    # Feature 4: Resource Category Scarcity Effect
    df_cat = build_feature_df(req.resource_category, 1, 20.0, 14)
    delta_cat = float(model_pipeline.predict_proba(df_cat)[0][1]) - p_ref

    def format_attribution(feature_name: str, delta: float, positive_desc: str, negative_desc: str) -> XAIAttribution:
        pct = round(delta * 100, 1)
        sign = "+" if pct >= 0 else ""
        direction = "POSITIVE" if pct >= 0 else "NEGATIVE"
        desc = positive_desc if pct >= 0 else negative_desc
        return XAIAttribution(
            feature=feature_name,
            impact=f"{sign}{pct}%",
            direction=direction,
            description=desc
        )

    attributions = [
        format_attribution(
            f"Current Free Units ({req.current_free_units} units)",
            delta_units,
            "Strong local buffer against competing walk-in patients",
            "Near-zero inventory increases risk of bed exhaustion before arrival"
        ),
        format_attribution(
            f"Time of Day ({req.time_of_day_hour:02d}:00 Hrs)",
            delta_peak,
            "Off-peak hours: minimal emergency admissions expected",
            "Peak emergency surge period: high local admission turnover"
        ),
        format_attribution(
            f"Transit ETA ({req.eta_minutes:.1f} mins)",
            delta_eta,
            "Rapid response transit minimizes diversion exposure",
            "Extended travel time widens vulnerability to walk-in preemption"
        ),
        format_attribution(
            f"Resource Category ({req.resource_category})",
            delta_cat,
            "High base turnover allows dynamic bed readiness",
            "Specialized critical unit with high regional scarcity"
        )
    ]

    # 3. Clinical Summary Generation
    p_rounded = round(float(np.clip(p_actual, 0.02, 0.98)), 3)
    margin = round(0.08 * math.sqrt(p_rounded * (1 - p_rounded)), 3)
    ci_lower = round(max(0.01, p_rounded - margin), 3)
    ci_upper = round(min(0.99, p_rounded + margin), 3)

    is_peak = ((8 <= req.time_of_day_hour <= 11) or (18 <= req.time_of_day_hour <= 21))
    ratio = req.eta_minutes / (req.current_free_units + 1.0)

    if p_rounded >= 0.75:
        verdict = f"High availability likelihood ({p_rounded * 100:.1f}%)"
    elif p_rounded >= 0.50:
        verdict = f"Moderate availability likelihood ({p_rounded * 100:.1f}%)"
    else:
        verdict = f"High contention risk ({p_rounded * 100:.1f}%)"

    clinical_summary = (
        f"{verdict} for {req.resource_category}. "
        f"Key driver: {req.current_free_units} vacant beds ({'+' if delta_units >= 0 else ''}{delta_units*100:.1f}%), "
        f"{'elevated by non-peak flow' if not is_peak else 'dampened by peak emergency rush (' + str(round(delta_peak*100, 1)) + '%)'}, "
        f"with {req.eta_minutes:.0f}m travel window ({round(delta_eta*100, 1)}%)."
    )

    demand_desc = "High Contention Risk" if ratio > 8.0 else ("Moderate Load" if ratio > 3.0 else "Stable Capacity")
    peak_desc = "Peak Surge Hours (High Admission Pressure)" if is_peak else "Normal Operating Flow"

    return PredictResponse(
        p_available=p_rounded,
        model_version="v2.1-explainable-calibrated-gbm",
        eta_minutes=req.eta_minutes,
        ci_lower=ci_lower,
        ci_upper=ci_upper,
        algorithm="Calibrated HistGradientBoosting Classifier (Platt Sigmoid Scaled)",
        xai_attributions=attributions,
        clinical_summary=clinical_summary,
        insights=FeatureContribution(
            demand_pressure=demand_desc,
            peak_surge_status=peak_desc
        )
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
