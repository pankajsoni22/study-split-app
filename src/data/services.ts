import { config, missingConfig } from '../config.ts';
import { createSupabaseServices } from './adapters/supabase/index.ts';
import type { Services } from './ports.ts';

// The single place that chooses the backend. To migrate, swap this line for another adapter.
export const services: Services | null = missingConfig.length === 0
  ? createSupabaseServices(config.supabaseUrl, config.supabaseAnonKey)
  : null;

export function getServices(): Services {
  if (!services) throw new Error(`Missing configuration: ${missingConfig.join(', ')}`);
  return services;
}
