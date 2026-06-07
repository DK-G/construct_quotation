import { FinishTrigger, ProcessStep } from '../dictionary/types';
import crossData from '../dictionary/data/cross.json';
import flooringData from '../dictionary/data/flooring.json';
import paintingData from '../dictionary/data/painting.json';

// Registered static dictionaries (can be expanded easily in the future)
export const DICTIONARIES: Record<string, FinishTrigger> = {
  [crossData.finish_trigger]: crossData as FinishTrigger,
  [flooringData.finish_trigger]: flooringData as FinishTrigger,
  [paintingData.finish_trigger]: paintingData as FinishTrigger
};

/**
 * Detects matching finish triggers within a given text string dynamically.
 */
export function detectFinishTriggersDynamic(
  text: string, 
  allDictionaries: Record<string, FinishTrigger>
): string[] {
  if (!text) return [];
  const normalizedText = text.toLowerCase();
  const matchedIds: string[] = [];

  for (const [triggerId, dict] of Object.entries(allDictionaries)) {
    // Build keywords list from trigger ID and display name
    const keywords: string[] = [
      dict.display_name,
      triggerId
    ];

    // Add common fallback variations
    if (triggerId === "cross_cloth") {
      keywords.push("クロス", "壁紙", "布クロス", "ビニルクロス", "織物クロス");
    } else if (triggerId === "wood_flooring") {
      keywords.push("フローリング", "木床", "木質", "複合フローリング");
    } else if (triggerId === "painting_ep_sop") {
      keywords.push("塗装", "EP", "SOP", "ペンキ", "エマルションペイント");
    } else {
      // For custom triggers, also search for name without common endings like "貼り" or "仕上げ"
      const cleanName = dict.display_name.replace(/(貼り|貼|仕上げ|仕上|工事)/g, "");
      if (cleanName.length >= 2) {
        keywords.push(cleanName);
      }
    }

    for (const keyword of keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        matchedIds.push(triggerId);
        break;
      }
    }
  }

  return Array.from(new Set(matchedIds));
}

// Deprecated: Kept for backwards compatibility in tests if any import directly
export function detectFinishTriggers(text: string): string[] {
  return detectFinishTriggersDynamic(text, DICTIONARIES);
}

export interface GeneratedProcessItem extends ProcessStep {
  finishTriggerId: string;
  finishDisplayName: string;
  roomName: string;
  location: "床" | "壁" | "天井" | "巾木" | "その他";
  excludeReason?: string;
}

/**
 * Generates the complete, expanded list of process steps from the parsed rooms.
 */
export function generateProcessList(
  rooms: Array<{
    roomName: string;
    floor: string;
    baseboard: string;
    wall: string;
    ceiling: string;
    remarks: string;
  }>,
  customDictionaries?: Record<string, FinishTrigger>
): GeneratedProcessItem[] {
  const allDicts = { ...DICTIONARIES, ...customDictionaries };
  const result: GeneratedProcessItem[] = [];

  for (const room of rooms) {
    const locations: Array<{ name: "床" | "壁" | "天井" | "巾木"; value: string }> = [
      { name: "床", value: room.floor },
      { name: "巾木", value: room.baseboard },
      { name: "壁", value: room.wall },
      { name: "天井", value: room.ceiling }
    ];

    for (const loc of locations) {
      const matchedTriggers = detectFinishTriggersDynamic(loc.value, allDicts);
      
      for (const triggerId of matchedTriggers) {
        const dict = allDicts[triggerId];
        if (!dict) continue;

        // Clone each step and attach room, location, etc.
        const steps: GeneratedProcessItem[] = dict.process_chain.map(step => ({
          ...step,
          finishTriggerId: triggerId,
          finishDisplayName: dict.display_name,
          roomName: room.roomName,
          location: loc.name
        }));

        result.push(...steps);
      }
    }
  }

  return result;
}

