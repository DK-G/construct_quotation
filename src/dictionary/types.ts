export interface ReferenceSource {
  type: "standard_spec" | "jass" | "practical_knowledge";
  doc_id: string;         // e.g., "JASS 26", "標準仕様書 19章"
  section?: string;       // e.g., "5.3.2" or "5.2"
  memo?: string;          // Optional comment/rationale
}

export type ConfidenceLevel = "standard" | "conditional" | "to_confirm" | "low";

export interface ProcessStep {
  step: number;                // Step number in sequence, e.g. 1, 2, 3...
  process_name: string;        // Name of the process (e.g. "ボードジョイント処理")
  sources: ReferenceSource[];  // Reference sources justifying this process
  required_by_default: boolean;// Is it always required for this finish?
  confidence: ConfidenceLevel; // Confidence level
  conditions: string | null;   // Conditions under which this step is required/excluded
}

export interface FinishTrigger {
  finish_trigger: string;      // Unique identifier (e.g. "cross_cloth")
  display_name: string;        // User-friendly display name (e.g. "ビニルクロス貼り")
  common_spec_ref: string;     // Reference to the General Building Construction Standard Specification
  jass_ref: string;            // Reference to the JASS standard
  process_chain: ProcessStep[];// List of steps in the process chain
}
