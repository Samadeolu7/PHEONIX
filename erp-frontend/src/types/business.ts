export interface BusinessFunction {
  id: string;
  name: string;
  friendly_name: string;
  function_type: 'api' | 'database' | 'system' | 'custom';
  description?: string;
  config: Record<string, any>;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}
