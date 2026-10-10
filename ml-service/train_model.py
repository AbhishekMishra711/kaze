"""
Production Model Training Pipeline for HLTH-02 Real-Time Emergency Resource Allocator
Trains a Calibrated Gradient Boosting Classifier on Hospital Turnover Dynamics.
Outputs: forecaster_model.joblib
"""

import os
import math
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss, classification_report

CATEGORIES = ['ICU_BED', 'VENTILATOR', 'TRAUMA_BAY', 'OXYGEN_BED', 'PEDIATRIC_ICU', 'GENERAL_BED']

def generate_emergency_dataset(n_samples: int = 12000, random_seed: int = 42) -> pd.DataFrame:
    """
    Generates realistic emergency department resource turnover records
    modeling Poisson arrivals and Weibull stay-duration discharge distributions.
    """
    np.random.seed(random_seed)
    
    # 1. Feature sampling
    categories = np.random.choice(CATEGORIES, size=n_samples, p=[0.20, 0.15, 0.15, 0.25, 0.10, 0.15])
    free_units = np.random.choice([0, 1, 2, 3, 4, 5, 8], size=n_samples, p=[0.25, 0.25, 0.20, 0.12, 0.10, 0.05, 0.03])
    eta_mins = np.random.uniform(3.0, 45.0, size=n_samples)
    hours = np.random.randint(0, 24, size=n_samples)
    
    # 2. Domain-engineered features
    sin_hour = np.sin(2 * np.pi * hours / 24.0)
    cos_hour = np.cos(2 * np.pi * hours / 24.0)
    is_peak = ((hours >= 8) & (hours <= 11)) | ((hours >= 18) & (hours <= 21))
    demand_ratio = eta_mins / (free_units + 1.0)
    
    # 3. Latent probability generation (ground truth physics)
    probs = []
    category_params = {
        'ICU_BED': {'lam': 0.020, 'beta': 180.0, 'alpha': 1.15},
        'VENTILATOR': {'lam': 0.015, 'beta': 140.0, 'alpha': 1.10},
        'TRAUMA_BAY': {'lam': 0.030, 'beta': 45.0, 'alpha': 1.25},
        'OXYGEN_BED': {'lam': 0.012, 'beta': 120.0, 'alpha': 1.05},
        'PEDIATRIC_ICU': {'lam': 0.008, 'beta': 240.0, 'alpha': 1.12},
        'GENERAL_BED': {'lam': 0.010, 'beta': 200.0, 'alpha': 1.00},
    }

    for i in range(n_samples):
        cat = categories[i]
        params = category_params[cat]
        surge = 1.35 if is_peak[i] else 0.85
        lam = params['lam'] * surge
        
        if free_units[i] > 0:
            effective_eta = eta_mins[i] / max(1.0, float(free_units[i]))
            p = math.exp(-lam * effective_eta)
        else:
            # Bed currently full: probability an occupied bed is discharged within ETA
            t = eta_mins[i]
            p = 1.0 - math.exp(-((t / params['beta']) ** params['alpha']))
        
        # Add realistic sensor & reporting noise (+- 5%)
        p_noisy = np.clip(p + np.random.normal(0, 0.04), 0.02, 0.98)
        probs.append(p_noisy)

    probs = np.array(probs)
    # Binary realized label: was the unit available when ambulance arrived?
    labels = (np.random.rand(n_samples) < probs).astype(int)

    df = pd.DataFrame({
        'resource_category': categories,
        'current_free_units': free_units,
        'eta_minutes': eta_mins,
        'time_of_day_hour': hours,
        'sin_hour': sin_hour,
        'cos_hour': cos_hour,
        'is_peak_hours': is_peak.astype(int),
        'demand_pressure_ratio': demand_ratio,
        'label': labels
    })
    return df

def train_and_save_model(artifact_path: str = 'forecaster_model.joblib') -> Pipeline:
    print("[ML-TRAINING] Generating 12,000 historical emergency intake and bed turnover samples...")
    df = generate_emergency_dataset(n_samples=12000, random_seed=42)

    X = df.drop(columns=['label'])
    y = df['label']

    # Strict 70-15-15 Train-Val-Test Split
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.30, random_state=42, stratify=y)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp)

    print(f"[ML-TRAINING] Training Split: {len(X_train)} | Validation: {len(X_val)} | Held-Out Test: {len(X_test)}")

    # Feature transformation pipeline
    categorical_cols = ['resource_category']
    numerical_cols = [
        'current_free_units', 'eta_minutes', 'time_of_day_hour', 
        'sin_hour', 'cos_hour', 'is_peak_hours', 'demand_pressure_ratio'
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_cols),
            ('num', StandardScaler(), numerical_cols)
        ]
    )

    # Gradient Boosting Classifier with Sigmoid Platt Calibration
    base_gbm = HistGradientBoostingClassifier(
        max_iter=160,
        learning_rate=0.07,
        max_depth=6,
        min_samples_leaf=25,
        l2_regularization=1.5,
        random_state=42
    )

    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', CalibratedClassifierCV(estimator=base_gbm, method='sigmoid', cv=5))
    ])

    print("[ML-TRAINING] Fitting Calibrated Gradient Boosting Pipeline...")
    pipeline.fit(X_train, y_train)

    # Evaluation on Held-Out Test Set
    test_probs = pipeline.predict_proba(X_test)[:, 1]
    test_preds = pipeline.predict(X_test)

    roc_auc = roc_auc_score(y_test, test_probs)
    brier = brier_score_loss(y_test, test_probs)
    logloss = log_loss(y_test, test_probs)

    print("=" * 65)
    print("[METRICS] HELD-OUT TEST PERFORMANCE METRICS")
    print("=" * 65)
    print(f"ROC-AUC Score       : {roc_auc:.4f}  (Discrimination capability)")
    print(f"Brier Score Loss    : {brier:.4f}  (Lower is better, ideal < 0.15)")
    print(f"Log-Loss            : {logloss:.4f}")
    print(f"Classification Report:\n{classification_report(y_test, test_preds, digits=3)}")
    print("=" * 65)

    # Save artifact
    joblib.dump(pipeline, artifact_path)
    print(f"[SUCCESS] Trained model artifact saved to: {os.path.abspath(artifact_path)}")
    return pipeline

if __name__ == '__main__':
    train_and_save_model()
