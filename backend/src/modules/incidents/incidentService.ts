import { db, IDatabaseClient } from '../../config/database.js';
import { Incident, IncidentRequirement, IncidentStatus } from '../../types/index.js';
import { TriageService } from './triageService.js';

export class IncidentService {
  /**
   * Creates an incident from an SOS trigger with idempotency guarantee.
   */
  static async createSOS(params: {
    idempotencyKey: string;
    latitude: number;
    longitude: number;
    addressText?: string;
    description?: string;
    callerId?: string;
    audioUrl?: string;
  }): Promise<Incident> {
    // 1. Check idempotency
    const existing = await db.query(
      `SELECT * FROM incidents WHERE idempotency_key = $1`,
      [params.idempotencyKey]
    );
    if (existing.rows.length > 0) {
      return this.getIncidentById(existing.rows[0].id) as Promise<Incident>;
    }

    // 2. Perform clinical triage (Claude Haiku or fallback)
    const triage = await TriageService.parseIncident(params.description || 'Emergency SOS trigger');

    return db.transaction(async (client: IDatabaseClient) => {
      const incRes = await client.query(
        `INSERT INTO incidents (
          idempotency_key, latitude, longitude, address_text, 
          description_raw, audio_url, triage_level, status, caller_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ALLOCATING', $8)
        RETURNING *;`,
        [
          params.idempotencyKey,
          params.latitude,
          params.longitude,
          params.addressText || 'Pune Metro Area',
          params.description || '',
          params.audioUrl || null,
          triage.triageLevel,
          params.callerId || null
        ]
      );

      const incident = incRes.rows[0];

      // Insert requirements
      for (const req of triage.requirements) {
        await client.query(
          `INSERT INTO incident_requirements (incident_id, category, quantity_needed, justification)
           VALUES ($1, $2, $3, $4);`,
          [incident.id, req.category, req.quantity, req.justification]
        );
      }

      // Log event
      await client.query(
        `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
        [
          incident.id,
          'INCIDENT_CREATED',
          JSON.stringify({
            triageLevel: triage.triageLevel,
            requirements: triage.requirements,
            source: triage.source
          })
        ]
      );

      return {
        ...incident,
        requirements: triage.requirements
      };
    });
  }

  static async getIncidentById(incidentId: string): Promise<Incident | null> {
    const incRes = await db.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    if (incRes.rows.length === 0) return null;
    const incident = incRes.rows[0];

    const reqRes = await db.query(
      `SELECT * FROM incident_requirements WHERE incident_id = $1`,
      [incidentId]
    );
    incident.requirements = reqRes.rows;
    return incident;
  }

  static async listActiveIncidents(): Promise<Incident[]> {
    const res = await db.query(
      `SELECT * FROM incidents 
       WHERE status NOT IN ('HANDED_OVER', 'CANCELLED') 
       ORDER BY 
         CASE triage_level 
           WHEN 'RESUSCITATION' THEN 1 
           WHEN 'EMERGENT' THEN 2 
           WHEN 'URGENT' THEN 3 
           WHEN 'LESS_URGENT' THEN 4 
           ELSE 5 
         END, 
         created_at ASC`
    );

    const list: Incident[] = [];
    for (const row of res.rows) {
      const reqRes = await db.query(
        `SELECT * FROM incident_requirements WHERE incident_id = $1`,
        [row.id]
      );
      row.requirements = reqRes.rows;
      list.push(row);
    }
    return list;
  }

  static async updateStatus(incidentId: string, status: IncidentStatus, unservedReason?: string): Promise<void> {
    await db.query(
      `UPDATE incidents SET status = $1, unserved_reason = $2, updated_at = NOW() WHERE id = $3`,
      [status, unservedReason || null, incidentId]
    );
  }
}
