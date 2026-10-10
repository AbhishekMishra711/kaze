import { db } from '../../config/database.js';
import { IncidentService } from '../incidents/incidentService.js';
import { BatchAllocatorService } from '../allocator/batchAllocator.js';

export interface ReplanResult {
  incidentId: string;
  reallocated: boolean;
  newHospitalId?: string;
  newHospitalName?: string;
  newTravelMinutes?: number;
  unservedReason?: string;
}

export class DynamicReplannerService {
  /**
   * Dynamically replans an in-transit patient when disruption occurs.
   * Safety invariant: already handed-over or locked patients are strictly preserved.
   */
  static async replanIncident(
    incidentId: string, 
    triggerReason: string, 
    failedHospitalId?: string
  ): Promise<ReplanResult> {
    console.log(`[REPLANNER] Triggered replanning for incident ${incidentId}. Reason: ${triggerReason}`);

    // 1. Fetch incident and verify state
    const incident = await IncidentService.getIncidentById(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    if (incident.status === 'HANDED_OVER') {
      console.warn(`[REPLANNER] Invariant Guard: Incident ${incidentId} already handed over. Cannot replan.`);
      return { incidentId, reallocated: false, unservedReason: 'ALREADY_HANDED_OVER' };
    }

    // 2. Release / cancel existing HELD or CONFIRMED reservations for this incident at the failing hospital
    if (failedHospitalId) {
      await db.query(
        `UPDATE reservations 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE incident_id = $1 AND hospital_id = $2 AND status IN ('HELD', 'CONFIRMED')`,
        [incidentId, failedHospitalId]
      );
    } else {
      await db.query(
        `UPDATE reservations 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE incident_id = $1 AND status IN ('HELD', 'CONFIRMED')`,
        [incidentId]
      );
    }

    // 3. Mark incident as REPLANNING
    await IncidentService.updateStatus(incidentId, 'REPLANNING');

    await db.query(
      `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
      [incidentId, 'REPLAN_INITIATED', JSON.stringify({ triggerReason, failedHospitalId })]
    );

    // 4. Re-solve allocation for this patient
    const solveRes = await BatchAllocatorService.solveBatch([incidentId]);

    if (solveRes.assigned.length > 0) {
      const match = solveRes.assigned[0];
      await db.query(
        `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
        [
          incidentId,
          'REPLAN_SUCCEEDED',
          JSON.stringify({
            newHospitalId: match.hospitalId,
            newHospitalName: match.hospitalName,
            travelMinutes: match.travelMinutes
          })
        ]
      );

      console.log(`[REPLANNER] Incident ${incidentId} rerouted to ${match.hospitalName} (${match.travelMinutes}m)`);
      return {
        incidentId,
        reallocated: true,
        newHospitalId: match.hospitalId,
        newHospitalName: match.hospitalName,
        newTravelMinutes: match.travelMinutes
      };
    } else {
      const unservedReason = solveRes.unserved[0]?.reason || 'UNSERVED: NO_ALTERNATIVE_FACILITY_AVAILABLE';
      console.warn(`[REPLANNER] Incident ${incidentId} could not be reallocated. Flagged unserved.`);
      return {
        incidentId,
        reallocated: false,
        unservedReason
      };
    }
  }
}
