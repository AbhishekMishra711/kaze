import { db } from '../../config/database.js';
import { 
  Incident, 
  Hospital, 
  ResourceUnit, 
  BatchAllocationResult, 
  TriagePriority, 
  ResourceCategory 
} from '../../types/index.js';
import { GeoUtils } from './geoUtils.js';
import { FreshnessService } from './freshnessService.js';
import { ForecasterClient } from '../forecaster/forecasterClient.js';
import { ReservationService } from '../reservations/reservationService.js';
import { IncidentService } from '../incidents/incidentService.js';

export class BatchAllocatorService {
  private static readonly TRIAGE_WEIGHTS: Record<TriagePriority, number> = {
    RESUSCITATION: 120,
    EMERGENT: 90,
    URGENT: 60,
    LESS_URGENT: 30,
    NON_URGENT: 15
  };

  /**
   * Solves multi-patient batch allocation across the regional hospital network.
   * Maximizes survival probability, minimizes transit delay, and enforces hard constraints.
   */
  static async solveBatch(targetIncidentIds?: string[]): Promise<BatchAllocationResult> {
    // 1. Fetch target incidents
    let incidents: Incident[] = [];
    if (targetIncidentIds && targetIncidentIds.length > 0) {
      for (const id of targetIncidentIds) {
        const inc = await IncidentService.getIncidentById(id);
        if (inc && (inc.status === 'ALLOCATING' || inc.status === 'REPLANNING')) {
          incidents.push(inc);
        }
      }
    } else {
      const active = await IncidentService.listActiveIncidents();
      incidents = active.filter((i) => i.status === 'ALLOCATING' || i.status === 'REPLANNING');
    }

    if (incidents.length === 0) {
      return { assigned: [], unserved: [] };
    }

    // 2. Sort incidents by clinical urgency (Resuscitation first)
    incidents.sort((a, b) => {
      const wa = this.TRIAGE_WEIGHTS[a.triage_level] || 50;
      const wb = this.TRIAGE_WEIGHTS[b.triage_level] || 50;
      return wb - wa;
    });

    // 3. Fetch all hospitals
    const hospRes = await db.query<Hospital>(
      `SELECT * FROM hospitals WHERE is_active = TRUE ORDER BY name ASC`
    );
    const hospitals = hospRes.rows;

    // 4. Fetch available ambulances
    const ambRes = await db.query(
      `SELECT * FROM ambulances WHERE status = 'AVAILABLE' ORDER BY id ASC`
    );
    const availableAmbulances = ambRes.rows;

    const assigned: BatchAllocationResult['assigned'] = [];
    const unserved: BatchAllocationResult['unserved'] = [];

    // 5. Evaluate each incident in priority sequence
    for (const incident of incidents) {
      const requirements = incident.requirements || [];
      if (requirements.length === 0) {
        requirements.push({
          category: 'GENERAL_BED',
          quantity_needed: 1,
          is_mandatory: true
        });
      }

      // Find nearest ambulance
      let assignedAmbulance: any = null;
      if (availableAmbulances.length > 0) {
        let minAmbDist = Infinity;
        let bestAmbIdx = -1;
        for (let i = 0; i < availableAmbulances.length; i++) {
          const dist = GeoUtils.haversineDistanceKm(
            incident.latitude,
            incident.longitude,
            availableAmbulances[i].current_lat,
            availableAmbulances[i].current_lng
          );
          if (dist < minAmbDist) {
            minAmbDist = dist;
            bestAmbIdx = i;
          }
        }
        if (bestAmbIdx !== -1) {
          assignedAmbulance = availableAmbulances.splice(bestAmbIdx, 1)[0];
        }
      }

      // Score each hospital for this incident
      interface ScoredCandidate {
        hospital: Hospital;
        travelMinutes: number;
        pAvailable: number;
        stalenessPenalty: number;
        score: number;
      }

      const candidateScores: ScoredCandidate[] = [];

      for (const h of hospitals) {
        const distKm = GeoUtils.haversineDistanceKm(incident.latitude, incident.longitude, h.latitude, h.longitude);
        const travelMinutes = GeoUtils.estimateTravelMinutes(distKm);
        const freshness = FreshnessService.evaluateHospital(h.last_reported_at);

        // Check if hospital has free units for primary requirement
        const primaryCat = requirements[0].category;
        const countRes = await db.query(
          `SELECT COUNT(*) as free_count 
           FROM resource_units u
           WHERE u.hospital_id = $1 
             AND u.category = $2 
             AND u.status = 'FREE'
             AND u.id NOT IN (
               SELECT unit_id FROM reservations WHERE status IN ('HELD', 'CONFIRMED', 'ARRIVED')
             )`,
          [h.id, primaryCat]
        );
        const freeCount = parseInt(countRes.rows[0].free_count, 10);

        // Get arrival prediction P(available at ETA)
        const pred = await ForecasterClient.predictAvailability({
          hospitalId: h.id,
          category: primaryCat,
          currentFreeCount: freeCount,
          etaMinutes: travelMinutes
        });

        // Compute objective score:
        // Score = (UrgencyWeight * P(ETA)) - (0.5 * TravelMinutes) - StalenessPenalty
        const urgencyWeight = this.TRIAGE_WEIGHTS[incident.triage_level] || 50;
        const score = (urgencyWeight * pred.pAvailable) - (0.6 * travelMinutes) - freshness.penaltyScore;

        candidateScores.push({
          hospital: h,
          travelMinutes,
          pAvailable: pred.pAvailable,
          stalenessPenalty: freshness.penaltyScore,
          score
        });
      }

      // Sort candidate hospitals by highest score
      candidateScores.sort((a, b) => b.score - a.score);

      let allocated = false;

      // Attempt atomic hold on top candidates
      for (const cand of candidateScores) {
        const holdItems = requirements.map((r) => ({
          category: r.category as ResourceCategory,
          quantity: r.quantity_needed
        }));

        const holdRes = await ReservationService.holdUnitsAtomically(
          incident.id,
          cand.hospital.id,
          holdItems,
          300, // 5-minute hold TTL
          assignedAmbulance?.id
        );

        if (holdRes.success) {
          // Success! Update ambulance status
          if (assignedAmbulance) {
            await db.query(
              `UPDATE ambulances SET status = 'DISPATCHED', updated_at = NOW() WHERE id = $1`,
              [assignedAmbulance.id]
            );
          }

          assigned.push({
            incidentId: incident.id,
            hospitalId: cand.hospital.id,
            hospitalName: cand.hospital.name,
            ambulanceId: assignedAmbulance?.id,
            reservationIds: holdRes.reservationIds,
            heldUnitIds: holdRes.unitIds,
            travelMinutes: cand.travelMinutes,
            score: parseFloat(cand.score.toFixed(2))
          });

          allocated = true;
          break; // Stop evaluating hospitals for this incident
        }
      }

      if (!allocated) {
        // Return ambulance if not used
        if (assignedAmbulance) {
          availableAmbulances.push(assignedAmbulance);
        }

        const reason = `UNSERVED: NO_MATCHING_RESOURCES_WITHIN_MAX_ETA [${requirements.map(r => r.category).join(', ')}]`;
        await IncidentService.updateStatus(incident.id, 'UNSERVED', reason);

        unserved.push({
          incidentId: incident.id,
          reason
        });
      }
    }

    return { assigned, unserved };
  }
}
