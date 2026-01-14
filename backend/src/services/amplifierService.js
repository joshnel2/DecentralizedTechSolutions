/**
 * Amplifier Background Agent Service
 * 
 * This service wraps Microsoft Amplifier (https://github.com/microsoft/amplifier)
 * to provide background agent capabilities while keeping the normal AI agent unchanged.
 * 
 * It uses the same Azure OpenAI credentials as the main AI agent.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Store active tasks per user
const activeTasks = new Map();

// Task status types
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Generate a unique task ID
 */
function generateTaskId() {
  return `amp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get Amplifier binary path
 */
function getAmplifierPath() {
  const localBin = path.join(os.homedir(), '.local', 'bin', 'amplifier');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  // Fallback to PATH
  return 'amplifier';
}

/**
 * Create Amplifier configuration for Azure OpenAI
 */
function getAmplifierEnv() {
  const env = { ...process.env };
  
  // Map our Azure OpenAI env vars to Amplifier's expected format
  // Amplifier uses AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY
  env.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
  env.AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
  env.AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
  
  // Add PATH to include local bin
  env.PATH = `${path.join(os.homedir(), '.local', 'bin')}:${env.PATH}`;
  
  return env;
}

/**
 * Background Task class
 */
class BackgroundTask extends EventEmitter {
  constructor(taskId, userId, firmId, goal, options = {}) {
    super();
    this.id = taskId;
    this.userId = userId;
    this.firmId = firmId;
    this.goal = goal;
    this.options = options;
    this.status = TaskStatus.PENDING;
    this.progress = {
      currentStep: 'Initializing...',
      progressPercent: 0,
      iterations: 0
    };
    this.output = [];
    this.result = null;
    this.error = null;
    this.process = null;
    this.startTime = new Date();
    this.endTime = null;
  }

  /**
   * Start the background task using Amplifier
   */
  async start() {
    this.status = TaskStatus.RUNNING;
    this.progress.currentStep = 'Starting Amplifier agent...';
    this.emit('progress', this.getStatus());

    try {
      const amplifierPath = getAmplifierPath();
      const env = getAmplifierEnv();
      
      // Check if Amplifier is configured for Azure OpenAI
      // We'll run it in non-interactive mode with --yes
      const args = [
        'run',
        '--yes',  // Non-interactive mode
        this.goal
      ];

      console.log(`[Amplifier] Starting task ${this.id} with goal: ${this.goal}`);
      
      this.process = spawn(amplifierPath, args, {
        env,
        cwd: process.cwd(),
        shell: true
      });

      let outputBuffer = '';
      
      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        outputBuffer += text;
        this.output.push({ type: 'stdout', text, timestamp: new Date() });
        
        // Parse progress from output
        this.parseProgress(text);
        this.emit('progress', this.getStatus());
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        this.output.push({ type: 'stderr', text, timestamp: new Date() });
        console.log(`[Amplifier] stderr: ${text}`);
      });

      this.process.on('close', (code) => {
        this.endTime = new Date();
        
        if (this.status === TaskStatus.CANCELLED) {
          console.log(`[Amplifier] Task ${this.id} was cancelled`);
          return;
        }
        
        if (code === 0) {
          this.status = TaskStatus.COMPLETED;
          this.progress.progressPercent = 100;
          this.progress.currentStep = 'Completed';
          this.result = this.parseResult(outputBuffer);
          console.log(`[Amplifier] Task ${this.id} completed successfully`);
        } else {
          this.status = TaskStatus.FAILED;
          this.error = `Process exited with code ${code}`;
          this.progress.currentStep = 'Failed';
          console.log(`[Amplifier] Task ${this.id} failed with code ${code}`);
        }
        
        this.emit('complete', this.getStatus());
      });

      this.process.on('error', (err) => {
        this.status = TaskStatus.FAILED;
        this.error = err.message;
        this.progress.currentStep = 'Error';
        this.endTime = new Date();
        console.error(`[Amplifier] Task ${this.id} error:`, err);
        this.emit('error', err);
      });

    } catch (error) {
      this.status = TaskStatus.FAILED;
      this.error = error.message;
      this.endTime = new Date();
      console.error(`[Amplifier] Failed to start task ${this.id}:`, error);
      throw error;
    }
  }

  /**
   * Parse progress from Amplifier output
   */
  parseProgress(text) {
    // Look for common progress indicators
    const lines = text.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      // Update current step based on output
      if (line.includes('Thinking') || line.includes('thinking')) {
        this.progress.currentStep = 'Analyzing task...';
        this.progress.progressPercent = Math.min(this.progress.progressPercent + 10, 90);
      } else if (line.includes('Tool') || line.includes('tool')) {
        this.progress.currentStep = 'Executing action...';
        this.progress.progressPercent = Math.min(this.progress.progressPercent + 15, 90);
        this.progress.iterations++;
      } else if (line.includes('Result') || line.includes('result')) {
        this.progress.currentStep = 'Processing results...';
        this.progress.progressPercent = Math.min(this.progress.progressPercent + 5, 95);
      }
    }
    
    // Increment progress over time
    if (this.progress.progressPercent < 85) {
      this.progress.progressPercent = Math.min(this.progress.progressPercent + 2, 85);
    }
  }

  /**
   * Parse final result from output
   */
  parseResult(output) {
    // Try to extract a summary from the output
    const lines = output.split('\n').filter(l => l.trim());
    
    // Get the last substantive output
    const resultLines = lines.slice(-10).filter(l => 
      !l.startsWith('>') && 
      !l.includes('amplifier') &&
      l.length > 10
    );
    
    return {
      summary: resultLines.join('\n') || 'Task completed',
      fullOutput: output
    };
  }

  /**
   * Cancel the task
   */
  cancel() {
    if (this.status !== TaskStatus.RUNNING) {
      return false;
    }
    
    this.status = TaskStatus.CANCELLED;
    this.progress.currentStep = 'Cancelled';
    this.endTime = new Date();
    
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    
    console.log(`[Amplifier] Task ${this.id} cancelled`);
    this.emit('cancelled', this.getStatus());
    return true;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      id: this.id,
      userId: this.userId,
      firmId: this.firmId,
      goal: this.goal,
      status: this.status,
      progress: this.progress,
      result: this.result,
      error: this.error,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime 
        ? (this.endTime - this.startTime) / 1000 
        : (new Date() - this.startTime) / 1000
    };
  }
}

/**
 * AmplifierService - Main service class
 */
class AmplifierService {
  constructor() {
    this.tasks = new Map();
    this.configured = false;
  }

  /**
   * Check if Amplifier is available and configured
   */
  async checkAvailability() {
    return new Promise((resolve) => {
      const amplifierPath = getAmplifierPath();
      const process = spawn(amplifierPath, ['--version'], {
        env: getAmplifierEnv(),
        shell: true
      });
      
      process.on('close', (code) => {
        resolve(code === 0);
      });
      
      process.on('error', () => {
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  }

  /**
   * Configure Amplifier to use Azure OpenAI
   * This should be called on backend startup
   */
  async configure() {
    if (this.configured) return true;
    
    const available = await this.checkAvailability();
    if (!available) {
      console.warn('[AmplifierService] Amplifier CLI not available');
      return false;
    }

    // Check if Azure OpenAI credentials are set
    if (!process.env.AZURE_OPENAI_ENDPOINT || 
        !process.env.AZURE_OPENAI_API_KEY || 
        !process.env.AZURE_OPENAI_DEPLOYMENT) {
      console.warn('[AmplifierService] Azure OpenAI credentials not configured');
      return false;
    }

    return new Promise((resolve) => {
      const amplifierPath = getAmplifierPath();
      const env = getAmplifierEnv();
      
      // Configure Azure OpenAI provider non-interactively
      const process = spawn(amplifierPath, [
        'provider', 'use', 'azure-openai',
        '--endpoint', env.AZURE_OPENAI_ENDPOINT,
        '--deployment', env.AZURE_OPENAI_DEPLOYMENT,
        '--yes',
        '--global'
      ], {
        env,
        shell: true
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('[AmplifierService] Configured with Azure OpenAI');
          this.configured = true;
          resolve(true);
        } else {
          console.warn('[AmplifierService] Failed to configure Azure OpenAI provider');
          resolve(false);
        }
      });
      
      process.on('error', (err) => {
        console.error('[AmplifierService] Configuration error:', err);
        resolve(false);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => resolve(false), 30000);
    });
  }

  /**
   * Start a new background task
   */
  async startTask(userId, firmId, goal, options = {}) {
    // Check if user already has an active task
    const existingTask = this.getActiveTask(userId);
    if (existingTask) {
      throw new Error('User already has an active background task');
    }

    const taskId = generateTaskId();
    const task = new BackgroundTask(taskId, userId, firmId, goal, options);
    
    // Store task
    this.tasks.set(taskId, task);
    activeTasks.set(userId, taskId);
    
    // Set up event handlers
    task.on('complete', () => {
      activeTasks.delete(userId);
    });
    
    task.on('error', () => {
      activeTasks.delete(userId);
    });
    
    task.on('cancelled', () => {
      activeTasks.delete(userId);
    });
    
    // Start the task
    await task.start();
    
    return task.getStatus();
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? task.getStatus() : null;
  }

  /**
   * Get active task for user
   */
  getActiveTask(userId) {
    const taskId = activeTasks.get(userId);
    if (!taskId) return null;
    
    const task = this.tasks.get(taskId);
    if (!task) {
      activeTasks.delete(userId);
      return null;
    }
    
    // Check if task is still active
    if (task.status !== TaskStatus.RUNNING && task.status !== TaskStatus.PENDING) {
      activeTasks.delete(userId);
      return null;
    }
    
    return task.getStatus();
  }

  /**
   * Get all tasks for user
   */
  getUserTasks(userId, limit = 10) {
    const userTasks = [];
    
    for (const task of this.tasks.values()) {
      if (task.userId === userId) {
        userTasks.push(task.getStatus());
      }
    }
    
    // Sort by start time descending
    userTasks.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    return userTasks.slice(0, limit);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId, userId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    if (task.userId !== userId) {
      throw new Error('Not authorized to cancel this task');
    }
    
    return task.cancel();
  }

  /**
   * Clean up old completed tasks
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    const now = new Date();
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.endTime && (now - task.endTime) > maxAge) {
        this.tasks.delete(taskId);
      }
    }
  }
}

// Singleton instance
const amplifierService = new AmplifierService();

// Clean up old tasks periodically
setInterval(() => {
  amplifierService.cleanup();
}, 60 * 60 * 1000); // Every hour

export default amplifierService;
export { AmplifierService, BackgroundTask, TaskStatus };
