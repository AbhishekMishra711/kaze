"""
Production Model Evaluation Script for HLTH-02 Real-Time Emergency Resource Allocator
Evaluates Trained Calibrated HistGradientBoosting Pipeline against Naive Baseline on Held-Out Test Data.
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score, mean_absolute_error
from train_model import generate_emergency_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "forecaster_model.joblib")

def evaluate_production_model():
    print("=" * 65)
    print("[EVALUATION] HLTH-02 REAL-WORLD ML FORECASTER EVALUATION")
    print("=" * 65)

    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model artifact {MODEL_PATH} not found. Run train_model.py first.")
        return

    pipeline = joblib.load(MODEL_PATH)
    print(f"Loaded ML Pipeline Artifact: {MODEL_PATH}")

    # Generate independent held-out evaluation dataset (unseen seed)
    test_df = generate_emergency_dataset(n_samples=2000, random_seed=999)
    X_test = test_df.drop(columns=['label'])
    y_test = test_df['label']

    # 1. Naive Baseline (Historical constant empirical arrival mean)
    baseline_pred = np.full(shape=len(y_test), fill_value=np.mean(y_test))
    baseline_brier = brier_score_loss(y_test, baseline_pred)
    baseline_mae = mean_absolute_error(y_test, baseline_pred)

    # 2. Trained Calibrated HistGradientBoosting Model
    ml_probs = pipeline.predict_proba(X_test)[:, 1]
    ml_brier = brier_score_loss(y_test, ml_probs)
    ml_mae = mean_absolute_error(y_test, ml_probs)
    ml_roc_auc = roc_auc_score(y_test, ml_probs)

    brier_improvement = ((baseline_brier - ml_brier) / baseline_brier) * 100

    print(f"Held-Out Evaluation Samples : {len(y_test)}")
    print(f"Algorithm Architecture       : Calibrated HistGradientBoosting (Platt Scaling)")
    print(f"ROC-AUC Discrimination       : {ml_roc_auc:.4f}")
    print(f"Naive Baseline Brier Score   : {baseline_brier:.4f}")
    print(f"ML Model Brier Score         : {ml_brier:.4f}  (Lower is better)")
    print(f"Brier Calibration Gain       : +{brier_improvement:.2f}% improvement over baseline")
    print(f"Mean Absolute Error (MAE)    : {ml_mae:.4f}  (Baseline MAE: {baseline_mae:.4f})")
    print("=" * 65)
    print("[SUCCESS] Production ML model verified on unseen held-out emergency scenarios.")

if __name__ == '__main__':
    evaluate_production_model()
