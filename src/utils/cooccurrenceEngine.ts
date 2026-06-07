import { GeneratedProcessItem } from './matcher';
import rulesData from '../dictionary/cooccurrenceRules.json';

export interface CooccurrenceRule {
  id: string;
  triggerFinishId: string;
  requiredProcessName: string;
  alertMessage: string;
}

export interface CooccurrenceAlert {
  ruleId: string;
  roomName: string;
  location: string;
  requiredProcessName: string;
  alertMessage: string;
}

const RULES: CooccurrenceRule[] = rulesData as CooccurrenceRule[];

/**
 * Scans the generated process list and its active state (not excluded)
 * to identify missing but required pre-requisite steps (cooccurrence rules).
 */
export function checkCooccurrence(
  processList: GeneratedProcessItem[],
  excludedIndices: Set<string>
): CooccurrenceAlert[] {
  const alerts: CooccurrenceAlert[] = [];

  // Group processes by Room and Location (e.g. "リビング::床")
  const roomGroups: Record<string, {
    roomName: string;
    location: string;
    activeSteps: GeneratedProcessItem[];
    hasTrigger: Record<string, boolean>;
  }> = {};

  processList.forEach(item => {
    const key = `${item.roomName}::${item.location}`;
    if (!roomGroups[key]) {
      roomGroups[key] = {
        roomName: item.roomName,
        location: item.location,
        activeSteps: [],
        hasTrigger: {}
      };
    }

    const id = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
    const active = !excludedIndices.has(id);

    // Track if this finish trigger was expanded for this location
    roomGroups[key].hasTrigger[item.finishTriggerId] = true;

    if (active) {
      roomGroups[key].activeSteps.push(item);
    }
  });

  // Evaluate rules for each Room and Location group
  Object.values(roomGroups).forEach(group => {
    for (const rule of RULES) {
      // If this location has the target finish trigger...
      if (group.hasTrigger[rule.triggerFinishId]) {
        // ...check if the required process name is present in active steps
        const isPresent = group.activeSteps.some(step => 
          step.process_name === rule.requiredProcessName || 
          step.process_name.includes(rule.requiredProcessName)
        );

        if (!isPresent) {
          alerts.push({
            ruleId: rule.id,
            roomName: group.roomName,
            location: group.location,
            requiredProcessName: rule.requiredProcessName,
            alertMessage: rule.alertMessage
          });
        }
      }
    }
  });

  return alerts;
}
