import { ResourceCategory, TriagePriority } from '../../types/index.js';
import { env } from '../../config/env.js';

export interface TriageResult {
  triageLevel: TriagePriority;
  requirements: Array<{
    category: ResourceCategory;
    quantity: number;
    justification: string;
  }>;
  source: 'CLAUDE_HAIKU' | 'DETERMINISTIC_FALLBACK';
}

// In-memory cache to guarantee zero redundant token consumption on repeated queries
const triageCache = new Map<string, TriageResult>();

export class TriageService {
  /**
   * Deterministic clinical rule matcher (Zero tokens consumed).
   */
  static parseDeterministic(text: string): TriageResult {
    const lower = text.toLowerCase();
    const requirements: Array<{ category: ResourceCategory; quantity: number; justification: string }> = [];
    let triageLevel: TriagePriority = 'EMERGENT';

    if (
      lower.includes('unconscious') ||
      lower.includes('cardiac arrest') ||
      lower.includes('not breathing') ||
      lower.includes('massive bleeding') ||
      lower.includes('head trauma') ||
      lower.includes('crush')
    ) {
      triageLevel = 'RESUSCITATION';
      requirements.push({ category: 'TRAUMA_BAY', quantity: 1, justification: 'Life-threatening trauma / resuscitation protocol' });
      requirements.push({ category: 'VENTILATOR', quantity: 1, justification: 'Airway / breathing compromise' });
      requirements.push({ category: 'ICU_BED', quantity: 1, justification: 'Critical care admission' });
    } else if (lower.includes('infant') || lower.includes('child') || lower.includes('pediatric') || lower.includes('baby')) {
      triageLevel = 'EMERGENT';
      requirements.push({ category: 'PEDIATRIC_ICU', quantity: 1, justification: 'Pediatric emergency care' });
    } else if (lower.includes('chest pain') || lower.includes('heart') || lower.includes('breathless') || lower.includes('oxygen')) {
      triageLevel = 'EMERGENT';
      requirements.push({ category: 'ICU_BED', quantity: 1, justification: 'Cardiac / respiratory critical monitoring' });
      requirements.push({ category: 'OXYGEN_BED', quantity: 1, justification: 'Supplemental high-flow oxygen' });
    } else if (lower.includes('fracture') || lower.includes('dislocation') || lower.includes('fever') || lower.includes('vomit')) {
      triageLevel = 'URGENT';
      requirements.push({ category: 'GENERAL_BED', quantity: 1, justification: 'Observation and supportive clinical care' });
    } else {
      // Default safe emergent intake
      triageLevel = 'EMERGENT';
      requirements.push({ category: 'GENERAL_BED', quantity: 1, justification: 'General acute clinical intake' });
      requirements.push({ category: 'OXYGEN_BED', quantity: 1, justification: 'Emergency baseline oxygenation' });
    }

    return { triageLevel, requirements, source: 'DETERMINISTIC_FALLBACK' };
  }

  /**
   * Parses unstructured caller descriptions using Claude 3.5 Haiku.
   * Employs strict token minimization: concise prompt, max_tokens 200, system caching.
   */
  static async parseIncident(description: string): Promise<TriageResult> {
    const cleanDesc = description.trim();
    if (!cleanDesc) {
      return this.parseDeterministic('general emergent injury');
    }

    // Check cache
    const cacheKey = cleanDesc.toLowerCase();
    if (triageCache.has(cacheKey)) {
      return triageCache.get(cacheKey)!;
    }

    // If API key is missing, use deterministic fallback
    if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.trim() === '') {
      const fallback = this.parseDeterministic(cleanDesc);
      triageCache.set(cacheKey, fallback);
      return fallback;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          temperature: 0.1,
          system: 'Emergency clinical triage. Output ONLY raw JSON matching: {"triageLevel":"RESUSCITATION"|"EMERGENT"|"URGENT"|"LESS_URGENT"|"NON_URGENT","requirements":[{"category":"ICU_BED"|"VENTILATOR"|"TRAUMA_BAY"|"OXYGEN_BED"|"PEDIATRIC_ICU"|"GENERAL_BED","quantity":1,"justification":"string"}]}',
          messages: [
            { role: 'user', content: cleanDesc }
          ]
        })
      });

      if (!response.ok) {
        console.warn(`[TRIAGE] Claude API returned HTTP ${response.status}. Using deterministic fallback.`);
        const fallback = this.parseDeterministic(cleanDesc);
        triageCache.set(cacheKey, fallback);
        return fallback;
      }

      const json: any = await response.json();
      const content = json.content?.[0]?.text;
      if (!content) {
        return this.parseDeterministic(cleanDesc);
      }

      // Parse JSON from response
      const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const result: TriageResult = {
        triageLevel: parsed.triageLevel || 'EMERGENT',
        requirements: (parsed.requirements || []).map((r: any) => ({
          category: r.category as ResourceCategory,
          quantity: Number(r.quantity) || 1,
          justification: r.justification || 'Extracted requirement'
        })),
        source: 'CLAUDE_HAIKU'
      };

      if (result.requirements.length === 0) {
        result.requirements.push({ category: 'GENERAL_BED', quantity: 1, justification: 'General bed support' });
      }

      triageCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('[TRIAGE] Claude call failed, gracefully using deterministic fallback:', err);
      const fallback = this.parseDeterministic(cleanDesc);
      triageCache.set(cacheKey, fallback);
      return fallback;
    }
  }
}
