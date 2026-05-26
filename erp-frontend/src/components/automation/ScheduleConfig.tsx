import React, { useState } from 'react';
import { ScheduleConfig } from '../../types/automation';

interface ScheduleConfigProps {
  schedule?: ScheduleConfig;
  automationId: string;
  onSave: (schedule: Partial<ScheduleConfig>) => void;
  onCancel: () => void;
}

export const ScheduleConfigComponent: React.FC<ScheduleConfigProps> = ({
  schedule,
  automationId,
  onSave,
  onCancel,
}) => {
  const [config, setConfig] = useState<Partial<ScheduleConfig>>({
    name: schedule?.name || '',
    type: schedule?.type || 'once',
    startDate: schedule?.startDate || new Date().toISOString().split('T')[0],
    endDate: schedule?.endDate || '',
    automationId,
    isActive: schedule?.isActive ?? true,
    cronExpression: schedule?.cronExpression || '',
  });

  const handleTypeChange = (type: ScheduleConfig['type']) => {
    let cronExpression = '';

    switch (type) {
      case 'daily':
        cronExpression = '0 9 * * *'; // 9 AM daily
        break;
      case 'weekly':
        cronExpression = '0 9 * * 1'; // 9 AM every Monday
        break;
      case 'monthly':
        cronExpression = '0 9 1 * *'; // 9 AM on 1st of every month
        break;
      default:
        cronExpression = '';
    }

    setConfig(prev => ({
      ...prev,
      type,
      cronExpression,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(config);
  };

  const renderScheduleOptions = () => {
    switch (config.type) {
      case 'daily':
        return (
          <div className="schedule-options">
            <div className="option-group">
              <label htmlFor="daily-time">Time of day:</label>
              <input
                id="daily-time"
                type="time"
                value={config.cronExpression?.split(' ')[1] === '9' ? '09:00' : '09:00'}
                onChange={e => {
                  const [hours, minutes] = e.target.value.split(':');
                  setConfig(prev => ({
                    ...prev,
                    cronExpression: `${minutes} ${hours} * * *`,
                  }));
                }}
                aria-label="Select time of day"
                title="Select time of day for daily schedule"
              />
            </div>
          </div>
        );

      case 'weekly':
        return (
          <div className="schedule-options">
            <div className="option-group">
              <label htmlFor="weekly-day">Day of week:</label>
              <select
                id="weekly-day"
                value={config.cronExpression?.split(' ')[4] || '1'}
                onChange={e => {
                  const cronParts = config.cronExpression?.split(' ') || ['0', '9', '*', '*', '1'];
                  cronParts[4] = e.target.value;
                  setConfig(prev => ({
                    ...prev,
                    cronExpression: cronParts.join(' '),
                  }));
                }}
                aria-label="Select day of week"
                title="Select day of week for weekly schedule"
              >
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
              </select>
            </div>
            <div className="option-group">
              <label>Time:</label>
              <input
                type="time"
                value="09:00"
                onChange={e => {
                  const [hours, minutes] = e.target.value.split(':');
                  const cronParts = config.cronExpression?.split(' ') || ['0', '9', '*', '*', '1'];
                  cronParts[0] = minutes;
                  cronParts[1] = hours;
                  setConfig(prev => ({
                    ...prev,
                    cronExpression: cronParts.join(' '),
                  }));
                }}
              />
            </div>
          </div>
        );

      case 'monthly':
        return (
          <div className="schedule-options">
            <div className="option-group">
              <label htmlFor="monthly-day">Day of month:</label>
              <select
                id="monthly-day"
                value={config.cronExpression?.split(' ')[2] || '1'}
                onChange={e => {
                  const cronParts = config.cronExpression?.split(' ') || ['0', '9', '1', '*', '*'];
                  cronParts[2] = e.target.value;
                  setConfig(prev => ({
                    ...prev,
                    cronExpression: cronParts.join(' '),
                  }));
                }}
                aria-label="Select day of month"
                title="Select which day of the month to run the schedule"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="option-group">
              <label>Time:</label>
              <input
                type="time"
                value="09:00"
                onChange={e => {
                  const [hours, minutes] = e.target.value.split(':');
                  const cronParts = config.cronExpression?.split(' ') || ['0', '9', '1', '*', '*'];
                  cronParts[0] = minutes;
                  cronParts[1] = hours;
                  setConfig(prev => ({
                    ...prev,
                    cronExpression: cronParts.join(' '),
                  }));
                }}
              />
            </div>
          </div>
        );

      case 'custom':
        return (
          <div className="schedule-options">
            <div className="option-group">
              <label>Cron Expression:</label>
              <input
                type="text"
                value={config.cronExpression || ''}
                onChange={e => setConfig(prev => ({ ...prev, cronExpression: e.target.value }))}
                placeholder="0 9 * * * (9 AM daily)"
              />
              <small>Format: minute hour day month dayOfWeek</small>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="schedule-config">
      <div className="config-header">
        <h3>{schedule ? 'Edit' : 'Create'} Schedule</h3>
        <p>Configure when this automation should run automatically</p>
      </div>

      <form onSubmit={handleSubmit} className="config-form">
        <div className="form-group">
          <label>Schedule Name:</label>
          <input
            type="text"
            value={config.name}
            onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter schedule name"
            required
          />
        </div>

        <div className="form-group">
          <label>Schedule Type:</label>
          <div className="schedule-types">
            {[
              { value: 'once', label: 'One-time', description: 'Run once at specified date/time' },
              { value: 'daily', label: 'Daily', description: 'Run every day at specified time' },
              { value: 'weekly', label: 'Weekly', description: 'Run weekly on specified day' },
              { value: 'monthly', label: 'Monthly', description: 'Run monthly on specified date' },
              { value: 'custom', label: 'Custom', description: 'Use custom cron expression' },
            ].map(type => (
              <div
                key={type.value}
                className={`schedule-type ${config.type === type.value ? 'selected' : ''}`}
                onClick={() => handleTypeChange(type.value as ScheduleConfig['type'])}
              >
                <div className="type-header">
                  <input
                    type="radio"
                    id={`schedule-type-${type.value}`}
                    name="scheduleType"
                    value={type.value}
                    checked={config.type === type.value}
                    onChange={() => handleTypeChange(type.value as ScheduleConfig['type'])}
                    aria-label={`Select ${type.label} schedule type`}
                    title={type.description}
                  />
                  <strong>{type.label}</strong>
                </div>
                <small>{type.description}</small>
              </div>
            ))}
          </div>
        </div>

        {renderScheduleOptions()}

        <div className="form-group">
          <label htmlFor="schedule-start-date">Start Date:</label>
          <input
            id="schedule-start-date"
            type="date"
            value={config.startDate}
            onChange={e => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
            required
            aria-label="Select schedule start date"
            title="Select the date when this schedule should start"
          />
        </div>

        {config.type !== 'once' && (
          <div className="form-group">
            <label htmlFor="schedule-end-date">End Date (optional):</label>
            <input
              id="schedule-end-date"
              type="date"
              value={config.endDate || ''}
              onChange={e => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
              aria-label="Select schedule end date"
              title="Select the date when this schedule should end (optional)"
            />
            <small>Leave empty for indefinite schedule</small>
          </div>
        )}

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={e => setConfig(prev => ({ ...prev, isActive: e.target.checked }))}
            />
            Active (schedule will run automatically)
          </label>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
          <button type="submit" className="save-btn">
            {schedule ? 'Update' : 'Create'} Schedule
          </button>
        </div>
      </form>

      <style jsx>{`
        .schedule-config {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .config-header {
          background: #f8f9fa;
          padding: 24px;
          border-bottom: 1px solid #dee2e6;
        }

        .config-header h3 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 24px;
        }

        .config-header p {
          margin: 0;
          color: #666;
          line-height: 1.5;
        }

        .config-form {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 2px solid #dee2e6;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #007bff;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          color: #666;
          font-size: 12px;
        }

        .schedule-types {
          display: grid;
          gap: 12px;
        }

        .schedule-type {
          padding: 16px;
          border: 2px solid #dee2e6;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .schedule-type:hover {
          border-color: #007bff;
        }

        .schedule-type.selected {
          border-color: #007bff;
          background: #f8f9ff;
        }

        .type-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .type-header input[type='radio'] {
          width: auto;
          margin: 0;
        }

        .schedule-options {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          margin-top: 16px;
        }

        .option-group {
          margin-bottom: 16px;
        }

        .option-group:last-child {
          margin-bottom: 0;
        }

        .option-group label {
          margin-bottom: 4px;
          font-size: 14px;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-label input[type='checkbox'] {
          width: auto !important;
          margin: 0;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #dee2e6;
        }

        .cancel-btn,
        .save-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-btn {
          background: #6c757d;
          color: white;
        }

        .cancel-btn:hover {
          background: #5a6268;
        }

        .save-btn {
          background: #007bff;
          color: white;
        }

        .save-btn:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  );
};
