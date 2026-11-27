export interface FlagsmithProject {
  id: number;
  name: string;
  organisation: number;
}

export interface FlagsmithEnvironment {
  id: number;
  name: string;
  api_key: string;
  project: number;
  use_v2_feature_versioning?: boolean;
}

export interface MultivariateOption {
  id: number;
  type: string;
  string_value?: string | null;
  integer_value?: number | null;
  boolean_value?: boolean | null;
  default_percentage_allocation: number;
}

export interface MultivariateFeatureStateValue {
  id: number;
  multivariate_feature_option: number;
  percentage_allocation: number;
}

export interface FlagsmithFeature {
  id: number;
  name: string;
  description?: string | null;
  type: 'STANDARD' | 'MULTIVARIATE' | string;
  initial_value?: string | null;
  default_enabled: boolean;
  is_archived?: boolean;
  tags?: number[];
  multivariate_options?: MultivariateOption[];
}

export interface FlagsmithFeatureState {
  id: number;
  feature: number;
  environment: number;
  enabled: boolean;
  feature_state_value: string | number | boolean | null;
  multivariate_feature_state_values?: MultivariateFeatureStateValue[];
}

export interface EnvFlagState {
  environment: FlagsmithEnvironment;
  stateId: number;
  enabled: boolean;
  value: string | number | boolean | null;
  multivariateSplits: Array<{ label: string; percentage: number }>;
}

export interface ResolvedFlag {
  feature: FlagsmithFeature;
  /** Keyed by environment.api_key */
  statesByEnv: Record<string, EnvFlagState>;
}

export interface FlagReference {
  flagName: string;
  filePath: string;
  line: number;          // 0-based
  startCol: number;      // 0-based start of flag string literal
  endCol: number;        // 0-based end of flag string literal
  callPattern: string;   // e.g. hasFeature, getValue, useFlags
}

export interface GhostFlagIssue {
  reference: FlagReference;
  suggestion?: string;
}

export interface FlagHealthReport {
  ghostFlags: GhostFlagIssue[];
  staleFlags: ResolvedFlag[];
  referencesByFlag: Record<string, FlagReference[]>;
}
