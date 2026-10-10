/**
 * Geographic and travel-time calculation utilities.
 */

export class GeoUtils {
  private static readonly EARTH_RADIUS_KM = 6371;
  private static readonly AVERAGE_AMBULANCE_SPEED_KMPH = 32; // Pune urban emergency transit speed

  /**
   * Calculates Haversine great-circle distance between two GPS coordinates in kilometers.
   */
  static haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((this.EARTH_RADIUS_KM * c).toFixed(2));
  }

  /**
   * Estimates transit time in minutes given distance and traffic factor.
   */
  static estimateTravelMinutes(distanceKm: number, trafficFactor: number = 1.0): number {
    const effectiveSpeed = this.AVERAGE_AMBULANCE_SPEED_KMPH / trafficFactor;
    const hours = distanceKm / effectiveSpeed;
    const minutes = Math.max(2, Math.round(hours * 60)); // Minimum 2 minutes
    return minutes;
  }
}
