/**
 * Hospital Data Freshness & Liveness Monitoring Service
 * Enforces PS rule: stale data (>15m) receives ranking penalty and requires manual verification.
 */

export class FreshnessService {
  public static readonly STALE_THRESHOLD_MINUTES = 15;

  /**
   * Evaluates how fresh the hospital's capacity report is.
   */
  static evaluateHospital(lastReportedAt: string | Date): {
    isStale: boolean;
    minutesSinceReport: number;
    penaltyScore: number;
  } {
    const reportTime = new Date(lastReportedAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - reportTime);
    const minutesSinceReport = Math.round(diffMs / (60 * 1000));

    const isStale = minutesSinceReport > this.STALE_THRESHOLD_MINUTES;

    // Penalty increases linearly beyond 15 minutes up to 100 points
    let penaltyScore = 0;
    if (isStale) {
      penaltyScore = Math.min(100, (minutesSinceReport - this.STALE_THRESHOLD_MINUTES) * 4);
    }

    return {
      isStale,
      minutesSinceReport,
      penaltyScore
    };
  }
}
