import { ResourceCategory } from '../../types/index.js';
import { env } from '../../config/env.js';

export interface ForecasterInput {
  hospitalId: string;
  category: ResourceCategory;
  currentFreeCount: number;
  etaMinutes: number;
  timeOfDayHour?: number;
}

export interface ForecasterOutput {
  pAvailable: number; // Probability between 0.0 and 1.0
  source: 'PYTHON_ML_SERVICE' | 'EMBEDDED_PROBABILISTIC_ENGINE';
  modelVersion: string;
}

export class ForecasterClient {
  /**
   * Embedded fallback probabilistic engine using resource turnover curves.
   */
  static calculateEmbeddedProbability(input: ForecasterInput): number {
    const { currentFreeCount, etaMinutes, category } = input;

    // Rate parameters based on resource turnaround characteristics
    const demandRates: Record<ResourceCategory, number> = {
      RESUSCITATION: 0.03, // Per-minute arrival rate
      ICU_BED: 0.02,
      VENTILATOR: 0.015,
      TRAUMA_BAY: 0.025,
      OXYGEN_BED: 0.01,
      PEDIATRIC_ICU: 0.005,
      GENERAL_BED: 0.008
    } as any;

    const lambda = demandRates[category] || 0.015;

    if (currentFreeCount > 0) {
      // If units are free now, probability they remain free after etaMinutes
      // P = exp(-lambda * eta) with damping for multiple free units
      const baseProb = Math.exp(-lambda * (etaMinutes / Math.max(1, currentFreeCount)));
      return parseFloat(Math.min(0.99, Math.max(0.2, baseProb)).toFixed(3));
    } else {
      // If currently 0 free units, probability that an occupied unit is discharged/freed within etaMinutes
      // Weibull cumulative distribution: 1 - exp(-(t/beta)^alpha)
      const betaTurnover = category === 'TRAUMA_BAY' ? 45 : 180; // minutes
      const probFreed = 1 - Math.exp(-Math.pow(etaMinutes / betaTurnover, 1.2));
      return parseFloat(Math.min(0.85, Math.max(0.05, probFreed)).toFixed(3));
    }
  }

  /**
   * Queries Python ML Forecaster with automatic fallback to embedded engine.
   */
  static async predictAvailability(input: ForecasterInput): Promise<ForecasterOutput> {
    const hour = input.timeOfDayHour ?? new Date().getHours();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1-second timeout

      const res = await fetch(`${env.ML_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          hospital_id: input.hospitalId,
          resource_category: input.category,
          current_free_units: input.currentFreeCount,
          eta_minutes: input.etaMinutes,
          time_of_day_hour: hour
        })
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data: any = await res.json();
        return {
          pAvailable: data.p_available,
          source: 'PYTHON_ML_SERVICE',
          modelVersion: data.model_version || 'py-v1.0'
        };
      }
    } catch {
      // Python micro-service unreachable or timed out -> use embedded probabilistic engine
    }

    const p = this.calculateEmbeddedProbability(input);
    return {
      pAvailable: p,
      source: 'EMBEDDED_PROBABILISTIC_ENGINE',
      modelVersion: 'embedded-weibull-v1'
    };
  }
}
