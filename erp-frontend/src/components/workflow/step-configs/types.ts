// // src/components/workflow/types.ts
// export interface AvailableVariable {
//   name: string;
//   type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array';
//   source: 'form' | 'query' | 'calculation';
//   path: string;
//   allowed_in_trigger: ('event' | 'schedule' | 'manual')[];
// }

// export interface WorkflowSummary {
//   id: string;
//   name: string;
//   workflow_type: 'system' | 'template' | 'standard' | 'custom';
//   access_level: 'public' | 'internal' | 'restricted' | 'private';
//   version: number;
//   is_atomic: boolean;
//   category: string;

//   required_inputs: {
//     name: string;
//     type: string;
//     description: string;
//     validation?: string;
//   }[];

//   outputs: {
//     name: string;
//     type: string;
//     description: string;
//   }[];

//   description: string;
//   estimated_duration_ms: number;
//   usage_count: number;
// }

// export interface StepConfig {
//   id: string;
//   name: string;
//   type: string;
//   config: any;
// }

// // Common props for all step editors
// export interface BaseStepEditorProps {
//   config: any;
//   onChange: (config: any) => void;
//   availableVars: AvailableVariable[];
//   triggerType: 'event' | 'schedule' | 'manual';
// }
