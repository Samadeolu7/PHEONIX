// Real-time stats integration service with WebSocket support
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';
import { statsPerformanceMonitor } from './statsPerformanceMonitor';

export interface RealTimeConfig {
  enabled: boolean;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  maxReconnectDelay: number;
  bufferSize: number;
}

export interface StatsUpdate {
  id: string;
  type: 'stats_update' | 'stats_batch_update' | 'stats_invalidate';
  timestamp: Date;
  data: StatsCardData | StatsCardData[] | { statsIds: string[] };
  source: 'calculation' | 'cache' | 'external';
  priority: 'low' | 'normal' | 'high';
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  lastConnected: Date | null;
  lastDisconnected: Date | null;
  reconnectAttempts: number;
  latency: number;
  error: string | null;
}

export interface RealTimeSubscription {
  id: string;
  role: UserRole;
  modules: string[];
  permissions: PageId[];
  statsIds: string[];
  callback: (updates: StatsUpdate[]) => void;
  filters?: {
    categories?: string[];
    minPriority?: number;
    updateTypes?: StatsUpdate['type'][];
  };
  active: boolean;
  createdAt: Date;
  lastUpdate: Date | null;
}

export class StatsRealTimeService {
  private ws: WebSocket | null = null;
  private config: RealTimeConfig;
  private connectionStatus: ConnectionStatus;
  private subscriptions: Map<string, RealTimeSubscription> = new Map();
  private updateBuffer: StatsUpdate[] = [];
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: any[] = [];
  private isReconnecting: boolean = false;

  constructor(config: Partial<RealTimeConfig> = {}) {
    this.config = {
      enabled: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      maxReconnectDelay: 30000,
      bufferSize: 100,
      ...config,
    };

    this.connectionStatus = {
      connected: false,
      connecting: false,
      lastConnected: null,
      lastDisconnected: null,
      reconnectAttempts: 0,
      latency: 0,
      error: null,
    };
  }

  // Initialize real-time connection
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('📡 Real-time stats service disabled');
      return;
    }

    try {
      await this.connect();
      console.log('📡 Real-time stats service initialized');
    } catch (error) {
      console.error('📡 Failed to initialize real-time stats service:', error);
      throw error;
    }
  }

  // Connect to WebSocket
  private async connect(): Promise<void> {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.connectionStatus.connecting = true;
    this.connectionStatus.error = null;

    try {
      // Determine WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/stats/`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws!.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws!.addEventListener('error', error => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.connectionStatus.connecting = false;
      this.connectionStatus.error = error instanceof Error ? error.message : 'Connection failed';
      throw error;
    }
  }

  // Handle WebSocket open
  private handleOpen(): void {
    console.log('📡 WebSocket connected');

    this.connectionStatus.connected = true;
    this.connectionStatus.connecting = false;
    this.connectionStatus.lastConnected = new Date();
    this.connectionStatus.reconnectAttempts = 0;
    this.connectionStatus.error = null;

    // Start heartbeat
    this.startHeartbeat();

    // Send queued messages
    this.flushMessageQueue();

    // Resubscribe to active subscriptions
    this.resubscribeAll();

    // Update performance metrics
    statsPerformanceMonitor.updateRealTimeMetrics(
      this.subscriptions.size,
      this.config.heartbeatInterval / 1000,
      0
    );
  }

  // Handle WebSocket message
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      // Handle different message types
      switch (message.type) {
        case 'stats_update':
        case 'stats_batch_update':
        case 'stats_invalidate':
          this.handleStatsUpdate(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        case 'subscription_confirmed':
          this.handleSubscriptionConfirmed(message);
          break;
        case 'error':
          this.handleServerError(message);
          break;
        default:
          console.warn('📡 Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('📡 Failed to parse WebSocket message:', error);
    }
  }

  // Handle WebSocket close
  private handleClose(event: CloseEvent): void {
    console.log('📡 WebSocket disconnected:', event.code, event.reason);

    this.connectionStatus.connected = false;
    this.connectionStatus.lastDisconnected = new Date();

    this.stopHeartbeat();

    // Attempt reconnection if not intentional
    if (!this.isReconnecting && event.code !== 1000) {
      this.attemptReconnection();
    }
  }

  // Handle WebSocket error
  private handleError(event: Event): void {
    console.error('📡 WebSocket error:', event);
    this.connectionStatus.error = 'WebSocket error occurred';
  }

  // Handle stats update message
  private handleStatsUpdate(message: any): void {
    const update: StatsUpdate = {
      id: message.id || `update-${Date.now()}`,
      type: message.type,
      timestamp: new Date(message.timestamp),
      data: message.data,
      source: message.source || 'external',
      priority: message.priority || 'normal',
    };

    // Add to buffer
    this.updateBuffer.push(update);

    // Keep buffer size manageable
    if (this.updateBuffer.length > this.config.bufferSize) {
      this.updateBuffer = this.updateBuffer.slice(-this.config.bufferSize);
    }

    // Notify relevant subscriptions
    this.notifySubscriptions(update);
  }

  // Handle pong message (heartbeat response)
  private handlePong(message: any): void {
    if (message.timestamp) {
      const latency = Date.now() - message.timestamp;
      this.connectionStatus.latency = latency;
    }
  }

  // Handle subscription confirmation
  private handleSubscriptionConfirmed(message: any): void {
    const subscription = this.subscriptions.get(message.subscriptionId);
    if (subscription) {
      console.log(`📡 Subscription confirmed: ${subscription.id}`);
    }
  }

  // Handle server error
  private handleServerError(message: any): void {
    console.error('📡 Server error:', message.error);
    this.connectionStatus.error = message.error;
  }

  // Notify relevant subscriptions of updates
  private notifySubscriptions(update: StatsUpdate): void {
    const relevantSubscriptions = Array.from(this.subscriptions.values()).filter(sub => {
      if (!sub.active) return false;

      // Check if update matches subscription filters
      if (sub.filters) {
        if (sub.filters.updateTypes && !sub.filters.updateTypes.includes(update.type)) {
          return false;
        }

        if (sub.filters.minPriority) {
          const priorityValues = { low: 1, normal: 2, high: 3 };
          if (priorityValues[update.priority] < priorityValues[sub.filters.minPriority]) {
            return false;
          }
        }
      }

      // Check if update is for subscribed stats
      if (update.type === 'stats_update' && Array.isArray(update.data)) {
        return false; // Single update should have single data
      }

      if (update.type === 'stats_batch_update' && !Array.isArray(update.data)) {
        return false; // Batch update should have array data
      }

      // Check stats IDs
      const updateStatsIds = this.extractStatsIds(update);
      return updateStatsIds.some(id => sub.statsIds.includes(id));
    });

    // Notify each relevant subscription
    relevantSubscriptions.forEach(subscription => {
      try {
        subscription.callback([update]);
        subscription.lastUpdate = new Date();
      } catch (error) {
        console.error(`📡 Error in subscription callback ${subscription.id}:`, error);
      }
    });
  }

  // Extract stats IDs from update
  private extractStatsIds(update: StatsUpdate): string[] {
    switch (update.type) {
      case 'stats_update':
        return [(update.data as StatsCardData).id];
      case 'stats_batch_update':
        return (update.data as StatsCardData[]).map(stat => stat.id);
      case 'stats_invalidate':
        return (update.data as { statsIds: string[] }).statsIds;
      default:
        return [];
    }
  }

  // Start heartbeat
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'ping',
          timestamp: Date.now(),
        });
      }
    }, this.config.heartbeatInterval);
  }

  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Attempt reconnection
  private attemptReconnection(): void {
    if (this.connectionStatus.reconnectAttempts >= this.config.reconnectAttempts) {
      console.error('📡 Max reconnection attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.connectionStatus.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.connectionStatus.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    console.log(
      `📡 Attempting reconnection in ${delay}ms (attempt ${this.connectionStatus.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.isReconnecting = false;
      } catch (error) {
        console.error('📡 Reconnection failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  // Send message to server
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  // Flush message queue
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  // Resubscribe all active subscriptions
  private resubscribeAll(): void {
    this.subscriptions.forEach(subscription => {
      if (subscription.active) {
        this.sendSubscription(subscription);
      }
    });
  }

  // Send subscription to server
  private sendSubscription(subscription: RealTimeSubscription): void {
    this.send({
      type: 'subscribe',
      subscriptionId: subscription.id,
      role: subscription.role,
      modules: subscription.modules,
      permissions: subscription.permissions,
      statsIds: subscription.statsIds,
      filters: subscription.filters,
    });
  }

  // Public API methods

  // Subscribe to real-time stats updates
  subscribe(
    role: UserRole,
    modules: string[],
    permissions: PageId[],
    statsIds: string[],
    callback: (updates: StatsUpdate[]) => void,
    filters?: RealTimeSubscription['filters']
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const subscription: RealTimeSubscription = {
      id: subscriptionId,
      role,
      modules,
      permissions,
      statsIds,
      callback,
      filters,
      active: true,
      createdAt: new Date(),
      lastUpdate: null,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send subscription to server if connected
    if (this.connectionStatus.connected) {
      this.sendSubscription(subscription);
    }

    console.log(`📡 Created subscription: ${subscriptionId}`);
    return subscriptionId;
  }

  // Unsubscribe from real-time updates
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.active = false;
    this.subscriptions.delete(subscriptionId);

    // Send unsubscribe to server
    this.send({
      type: 'unsubscribe',
      subscriptionId,
    });

    console.log(`📡 Removed subscription: ${subscriptionId}`);
    return true;
  }

  // Update subscription
  updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<RealTimeSubscription, 'statsIds' | 'filters'>>
  ): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Update subscription
    if (updates.statsIds) {
      subscription.statsIds = updates.statsIds;
    }
    if (updates.filters) {
      subscription.filters = updates.filters;
    }

    // Send updated subscription to server
    if (this.connectionStatus.connected) {
      this.sendSubscription(subscription);
    }

    return true;
  }

  // Get connection status
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  // Get active subscriptions
  getSubscriptions(): RealTimeSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.active);
  }

  // Get recent updates from buffer
  getRecentUpdates(limit: number = 10): StatsUpdate[] {
    return this.updateBuffer.slice(-limit);
  }

  // Manually trigger stats refresh
  refreshStats(statsIds: string[]): void {
    this.send({
      type: 'refresh_stats',
      statsIds,
    });
  }

  // Disconnect and cleanup
  disconnect(): void {
    this.isReconnecting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Clear subscriptions
    this.subscriptions.clear();
    this.updateBuffer = [];
    this.messageQueue = [];

    console.log('📡 Real-time stats service disconnected');
  }

  // Enable/disable real-time service
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (enabled && !this.connectionStatus.connected) {
      this.initialize();
    } else if (!enabled && this.connectionStatus.connected) {
      this.disconnect();
    }
  }

  // Get service statistics
  getStatistics(): {
    connected: boolean;
    subscriptions: number;
    bufferSize: number;
    latency: number;
    reconnectAttempts: number;
    uptime: number | null;
  } {
    const uptime = this.connectionStatus.lastConnected
      ? Date.now() - this.connectionStatus.lastConnected.getTime()
      : null;

    return {
      connected: this.connectionStatus.connected,
      subscriptions: this.subscriptions.size,
      bufferSize: this.updateBuffer.length,
      latency: this.connectionStatus.latency,
      reconnectAttempts: this.connectionStatus.reconnectAttempts,
      uptime,
    };
  }
}

// Export singleton instance
export const statsRealTimeService = new StatsRealTimeService();
