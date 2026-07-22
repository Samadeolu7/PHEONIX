import React, { useState } from 'react';
import { RefreshCw, Play, Power } from 'lucide-react';
import { useScheduledJobs, useToggleJob, useRunJob } from '../../hooks/useScheduledJobs';
import { ScheduledJob } from '../../services/scheduledJobsService';
import { useToast } from '../../hooks/useToast';
import { Badge } from '../../components/ui/Badge';
import LoadingState from '../../components/ui/LoadingState';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/Table';

function statusVariant(status: string | undefined): 'success' | 'error' | 'default' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILURE') return 'error';
  return 'default';
}

const ScheduledJobsPage: React.FC = () => {
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: jobs = [], isLoading: loading, refetch } = useScheduledJobs();
  const toggleJob = useToggleJob();
  const runJob = useRunJob();

  const handleToggle = async (job: ScheduledJob) => {
    setBusyId(job.id);
    try {
      await toggleJob.mutateAsync(job.id);
      toast.success(`'${job.name}' ${job.enabled ? 'disabled' : 'enabled'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update job');
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (job: ScheduledJob) => {
    setBusyId(job.id);
    try {
      await runJob.mutateAsync(job.id);
      toast.success(`'${job.name}' queued to run now — check back shortly for the result.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to queue job');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <LoadingState message="Loading scheduled jobs..." fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scheduled Jobs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Celery Beat periodic tasks — schedule, last run, and manual controls.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    No scheduled jobs found.
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((job) => (
                <React.Fragment key={job.id}>
                  <TableRow>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-gray-600">{job.task}</code>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{job.schedule}</TableCell>
                    <TableCell>
                      <Badge variant={job.enabled ? 'success' : 'outline'}>
                        {job.enabled ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {job.last_result?.date_done
                        ? new Date(job.last_result.date_done).toLocaleString()
                        : 'Never (or run history unavailable)'}
                    </TableCell>
                    <TableCell>
                      {job.last_result ? (
                        <Badge variant={statusVariant(job.last_result.status)}>
                          {job.last_result.status}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(job)}
                          disabled={busyId === job.id}
                          title={job.enabled ? 'Disable' : 'Enable'}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {job.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleRunNow(job)}
                          disabled={busyId === job.id}
                          title="Run now"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Run now
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {job.last_result?.traceback && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-red-50">
                        <details>
                          <summary className="text-sm text-red-700 cursor-pointer">
                            Last failure traceback
                          </summary>
                          <pre className="text-xs whitespace-pre-wrap mt-2 text-red-900">
                            {job.last_result.traceback}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default ScheduledJobsPage;
