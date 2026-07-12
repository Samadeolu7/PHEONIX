// src/services/scheduledJobsService.ts
import { api } from './api';

export interface LastTaskResult {
  status: string;
  date_done: string;
  traceback: string | null;
}

export interface ScheduledJob {
  id: number;
  name: string;
  task: string;
  schedule: string;
  enabled: boolean;
  last_result: LastTaskResult | null;
}

class ScheduledJobsService {
  async getJobs(): Promise<ScheduledJob[]> {
    const response = await api.get('/jobs/scheduled/');
    if (Array.isArray(response)) return response;
    return (response as unknown as { results?: ScheduledJob[] })?.results ?? [];
  }

  async toggleJob(id: number): Promise<{ id: number; enabled: boolean }> {
    return api.post(`/jobs/scheduled/${id}/toggle/`, {});
  }

  async runNow(id: number): Promise<{ id: number; task_id: string; queued: boolean }> {
    return api.post(`/jobs/scheduled/${id}/run-now/`, {});
  }
}

export const scheduledJobsService = new ScheduledJobsService();
