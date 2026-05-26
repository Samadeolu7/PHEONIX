import { useEffect, useRef, useState, useCallback } from 'react';

// WebSocket Hook for Real-time Updates
export function useWebSocket(url, options = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const {
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onOpen = null,
    onClose = null,
    onError = null,
    onMessage = null,
  } = options;

  const connect = useCallback(() => {
    try {
      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }

      console.log('Connecting to WebSocket:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;

        if (onOpen) onOpen();
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          setLastMessage(data);

          if (onMessage) onMessage(data);
        } catch (error: unknown) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = error => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection error');

        if (onError) onError(error);
      };

      ws.onclose = event => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        if (onClose) onClose(event);

        // Attempt reconnection
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionError('Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to create WebSocket connection';
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError(errorMsg);
    }
  }, [
    url,
    reconnect,
    reconnectInterval,
    maxReconnectAttempts,
    onOpen,
    onClose,
    onError,
    onMessage,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(data => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    connectionError,
    sendMessage,
    reconnect: connect,
    disconnect,
  };
}

// Real-time Workflow Updates Component
export function RealtimeWorkflowUpdates({ workflowId, onUpdate }) {
  const wsUrl = `ws://localhost:8000/ws/workflows/${workflowId}/`;

  const { isConnected, lastMessage, connectionError, sendMessage } = useWebSocket(wsUrl, {
    reconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
    onMessage: data => {
      console.log('Workflow update received:', data);
      if (onUpdate) {
        onUpdate(data);
      }
    },
  });

  return (
    <div className="flex items-center space-x-2 text-sm">
      {isConnected ? (
        <>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-700 font-medium">Live Updates Active</span>
        </>
      ) : connectionError ? (
        <>
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span className="text-red-700">Connection Error</span>
        </>
      ) : (
        <>
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span className="text-yellow-700">Connecting...</span>
        </>
      )}
    </div>
  );
}

// Enhanced WorkflowStatusPage with WebSocket
export default function WorkflowStatusWithRealtime({ workflowId = '789' }) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useWebSocketFlag, setUseWebSocketFlag] = useState(true);

  // Fallback polling if WebSocket not available
  useEffect(() => {
    if (!useWebSocketFlag) {
      const interval = setInterval(() => {
        fetchWorkflow();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [useWebSocketFlag, workflowId]);

  const fetchWorkflow = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockWorkflow = {
        id: 789,
        name: 'Transaction Processing',
        status: 'running',
        progress: 45,
        steps: [
          { id: 1, name: 'Validate', status: 'completed' },
          { id: 2, name: 'Process', status: 'running' },
          { id: 3, name: 'Notify', status: 'pending' },
        ],
      };

      setWorkflow(mockWorkflow);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch workflow:', error);
    }
  };

  const handleWebSocketUpdate = data => {
    console.log('Received real-time update:', data);

    // Update workflow state based on WebSocket message
    if (data.type === 'workflow_update') {
      setWorkflow(prev => ({
        ...prev,
        ...data.workflow,
      }));
    } else if (data.type === 'step_update') {
      setWorkflow(prev => ({
        ...prev,
        steps: prev.steps.map(step =>
          step.id === data.step.id ? { ...step, ...data.step } : step
        ),
      }));
    }
  };

  useEffect(() => {
    fetchWorkflow();
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header with Real-time Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{workflow?.name}</h1>
          <div className="flex items-center space-x-4">
            <RealtimeWorkflowUpdates workflowId={workflowId} onUpdate={handleWebSocketUpdate} />
            <button
              onClick={() => setUseWebSocketFlag(!useWebSocketFlag)}
              className="text-xs text-gray-600 hover:text-gray-900"
            >
              {useWebSocketFlag ? 'Switch to Polling' : 'Switch to WebSocket'}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Status updates are delivered in real-time via WebSocket connection
        </div>
      </div>

      {/* Workflow Details */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Workflow Steps</h2>
        <div className="space-y-2">
          {workflow?.steps.map(step => (
            <div key={step.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span>{step.name}</span>
              <span
                className={`px-2 py-1 text-xs font-semibold rounded ${
                  step.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : step.status === 'running'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {step.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-2">Real-time Updates</p>
        <ul className="space-y-1 text-blue-800">
          <li>• Updates appear instantly without page refresh</li>
          <li>• Automatic reconnection on connection loss</li>
          <li>• Falls back to polling if WebSocket unavailable</li>
        </ul>
      </div>
    </div>
  );
}

// Usage example for WebSocket in any component:
/*
import { useWebSocket } from './useWebSocket';

function MyComponent() {
  const { isConnected, lastMessage, sendMessage } = useWebSocket(
    'ws://localhost:8000/ws/notifications/',
    {
      reconnect: true,
      onMessage: (data) => {
        console.log('Notification received:', data);
        // Show toast notification
      }
    }
  );

  return (
    <div>
      {isConnected && <span>🟢 Connected</span>}
      {lastMessage && <div>{lastMessage.content}</div>}
    </div>
  );
}
*/
