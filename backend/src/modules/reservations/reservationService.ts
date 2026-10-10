import { db, IDatabaseClient } from '../../config/database.js';
import { ResourceCategory, ReservationStatus } from '../../types/index.js';

export interface HoldRequestItem {
  category: ResourceCategory;
  quantity: number;
}

export interface HoldResult {
  success: boolean;
  hospitalId: string;
  incidentId: string;
  reservationIds: string[];
  unitIds: string[];
  expiresAt?: string;
  error?: string;
}

export class ReservationService {
  /**
   * Atomically locks discrete resource units at a specific hospital for an incident.
   * If ANY requested resource cannot be locked, the transaction rolls back completely.
   */
  static async holdUnitsAtomically(
    incidentId: string,
    hospitalId: string,
    requirements: HoldRequestItem[],
    holdDurationSeconds: number = 300,
    ambulanceId?: string
  ): Promise<HoldResult> {
    return db.transaction(async (client: IDatabaseClient) => {
      const heldUnitIds: string[] = [];
      const reservationIds: string[] = [];
      const expiresAt = new Date(Date.now() + holdDurationSeconds * 1000).toISOString();

      for (const req of requirements) {
        // Query candidate units that are FREE and have NO active reservation
        // FOR UPDATE SKIP LOCKED guarantees mutual exclusion at the database row level
        const selectSql = `
          SELECT u.id 
          FROM resource_units u
          WHERE u.hospital_id = $1 
            AND u.category = $2 
            AND u.status = 'FREE'
            AND u.id NOT IN (
              SELECT unit_id FROM reservations 
              WHERE status IN ('HELD', 'CONFIRMED', 'ARRIVED')
            )
          ORDER BY u.id
          LIMIT $3
          FOR UPDATE SKIP LOCKED;
        `;

        const res = await client.query(selectSql, [hospitalId, req.category, req.quantity]);

        if (res.rows.length < req.quantity) {
          // Cannot fulfill this category -> rollback entire atomic hold
          return {
            success: false,
            hospitalId,
            incidentId,
            reservationIds: [],
            unitIds: [],
            error: `INSUFFICIENT_CAPACITY_${req.category}`
          };
        }

        for (const row of res.rows) {
          heldUnitIds.push(row.id);
          const insertSql = `
            INSERT INTO reservations (incident_id, unit_id, hospital_id, ambulance_id, status, hold_expires_at)
            VALUES ($1, $2, $3, $4, 'HELD', $5)
            RETURNING id;
          `;
          const insertRes = await client.query(insertSql, [
            incidentId,
            row.id,
            hospitalId,
            ambulanceId || null,
            expiresAt
          ]);
          reservationIds.push(insertRes.rows[0].id);
        }
      }

      // Log event
      await client.query(
        `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
        [
          incidentId,
          'RESERVATION_HELD',
          JSON.stringify({ hospitalId, unitIds: heldUnitIds, reservationIds, expiresAt })
        ]
      );

      // Update incident status to RESERVED
      await client.query(
        `UPDATE incidents SET status = 'RESERVED', updated_at = NOW() WHERE id = $1`,
        [incidentId]
      );

      return {
        success: true,
        hospitalId,
        incidentId,
        reservationIds,
        unitIds: heldUnitIds,
        expiresAt
      };
    });
  }

  /**
   * Hospital staff confirms the reservation.
   */
  static async confirmReservation(reservationId: string): Promise<boolean> {
    const res = await db.query(
      `UPDATE reservations 
       SET status = 'CONFIRMED', updated_at = NOW() 
       WHERE id = $1 AND status = 'HELD' 
       RETURNING incident_id, hospital_id, unit_id`,
      [reservationId]
    );

    if (res.rows.length === 0) return false;

    const row = res.rows[0];
    await db.query(
      `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
      [row.incident_id, 'RESERVATION_CONFIRMED', JSON.stringify({ reservationId, unitId: row.unit_id })]
    );

    return true;
  }

  /**
   * Hospital staff rejects reservation (triggers immediate replanning).
   */
  static async rejectReservation(reservationId: string, reason: string): Promise<{ success: boolean; incidentId?: string }> {
    const res = await db.query(
      `UPDATE reservations 
       SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW() 
       WHERE id = $2 AND status IN ('HELD', 'CONFIRMED')
       RETURNING incident_id, hospital_id, unit_id`,
      [reason, reservationId]
    );

    if (res.rows.length === 0) return { success: false };

    const row = res.rows[0];
    await db.query(
      `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
      [row.incident_id, 'RESERVATION_REJECTED', JSON.stringify({ reservationId, reason })]
    );

    // Update incident status to REPLANNING
    await db.query(
      `UPDATE incidents SET status = 'REPLANNING', updated_at = NOW() WHERE id = $1`,
      [row.incident_id]
    );

    return { success: true, incidentId: row.incident_id };
  }

  /**
   * Completes patient handover upon arrival at ER.
   * Marks reservation as HANDED_OVER and sets unit status to OCCUPIED.
   */
  static async completeHandover(reservationId: string): Promise<boolean> {
    return db.transaction(async (client: IDatabaseClient) => {
      const res = await client.query(
        `UPDATE reservations 
         SET status = 'HANDED_OVER', updated_at = NOW() 
         WHERE id = $1 AND status IN ('CONFIRMED', 'HELD')
         RETURNING incident_id, hospital_id, unit_id, ambulance_id`,
        [reservationId]
      );

      if (res.rows.length === 0) return false;
      const row = res.rows[0];

      // Mark unit as occupied
      await client.query(
        `UPDATE resource_units SET status = 'OCCUPIED', updated_at = NOW() WHERE id = $1`,
        [row.unit_id]
      );

      // Free ambulance back to AVAILABLE
      if (row.ambulance_id) {
        await client.query(
          `UPDATE ambulances SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
          [row.ambulance_id]
        );
      }

      // Mark incident as HANDED_OVER
      await client.query(
        `UPDATE incidents SET status = 'HANDED_OVER', updated_at = NOW() WHERE id = $1`,
        [row.incident_id]
      );

      await client.query(
        `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
        [row.incident_id, 'HANDOVER_COMPLETED', JSON.stringify(row)]
      );

      return true;
    });
  }

  /**
   * Background TTL cleaner: expires abandoned holds that exceeded 5 minutes.
   */
  static async expireStaleHolds(): Promise<number> {
    const res = await db.query(
      `UPDATE reservations 
       SET status = 'EXPIRED', updated_at = NOW() 
       WHERE status = 'HELD' AND hold_expires_at < NOW()
       RETURNING id, incident_id, unit_id`
    );

    for (const row of res.rows) {
      await db.query(
        `INSERT INTO audit_event_logs (incident_id, event_type, payload) VALUES ($1, $2, $3)`,
        [row.incident_id, 'HOLD_EXPIRED', JSON.stringify(row)]
      );
    }

    return res.rows.length;
  }
}
