/**
 * Apex Drive VFS Driver
 * 
 * This runs as a separate process and handles the low-level virtual file system operations.
 * It uses WinFsp via fuse-native to create a virtual drive on Windows.
 * 
 * Communication with the main process is via IPC.
 */

import Fuse from 'fuse-native';
import log from 'electron-log';

// Configure logging for this process
log.transports.file.fileName = 'vfs-driver.log';
log.transports.console.level = 'debug';

const driveLetter = process.env.APEX_DRIVE_LETTER || 'Z';
const mountPoint = `${driveLetter}:`;

let fuse: Fuse | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();

// Send request to main process and wait for response
function sendRequest(type: string, data: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Request timeout'));
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timeout });
    
    process.send?.({ type, id, ...data });
  });
}

// Handle responses from main process
process.on('message', (message: any) => {
  if (message.type === 'response') {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(message.id);
      
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message);
      }
    }
  } else if (message.type === 'init') {
    initializeFuse(message.driveLetter);
  } else if (message.type === 'unmount') {
    unmountFuse();
  }
});

// Convert POSIX error codes to errno values
const ERRNO = {
  ENOENT: -2,
  EIO: -5,
  EACCES: -13,
  EEXIST: -17,
  ENOTDIR: -20,
  EISDIR: -21,
  EINVAL: -22,
  ENOSPC: -28,
  ENOTEMPTY: -39,
  EBADF: -9,
};

// FUSE operations
const ops: Fuse.FuseOps = {
  readdir: async (path, cb) => {
    try {
      log.debug(`readdir: ${path}`);
      const result = await sendRequest('readdir', { path });
      cb(0, result.entries);
    } catch (error) {
      log.error(`readdir error: ${path}`, error);
      cb(Fuse.ENOENT);
    }
  },

  getattr: async (path, cb) => {
    try {
      log.debug(`getattr: ${path}`);
      const result = await sendRequest('getattr', { path });
      
      cb(0, {
        mtime: new Date(result.mtime),
        atime: new Date(result.atime),
        ctime: new Date(result.ctime),
        size: result.size,
        mode: result.mode,
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0,
        nlink: result.nlink || 1,
      });
    } catch (error: any) {
      log.debug(`getattr not found: ${path}`);
      cb(Fuse.ENOENT);
    }
  },

  open: async (path, flags, cb) => {
    try {
      log.debug(`open: ${path} (flags: ${flags})`);
      const result = await sendRequest('open', { path, flags });
      cb(0, result.handle);
    } catch (error: any) {
      log.error(`open error: ${path}`, error);
      cb(error.message === 'ENOENT' ? Fuse.ENOENT : Fuse.EIO);
    }
  },

  read: async (path, fd, buf, len, pos, cb) => {
    try {
      log.debug(`read: ${path} (fd: ${fd}, len: ${len}, pos: ${pos})`);
      const result = await sendRequest('read', { handle: fd, offset: pos, length: len });
      
      const data = Buffer.from(result.data, 'base64');
      data.copy(buf);
      cb(data.length);
    } catch (error) {
      log.error(`read error: ${path}`, error);
      cb(Fuse.EIO);
    }
  },

  write: async (path, fd, buf, len, pos, cb) => {
    try {
      log.debug(`write: ${path} (fd: ${fd}, len: ${len}, pos: ${pos})`);
      const data = buf.slice(0, len).toString('base64');
      const result = await sendRequest('write', { handle: fd, data, offset: pos });
      cb(result.bytesWritten);
    } catch (error) {
      log.error(`write error: ${path}`, error);
      cb(Fuse.EIO);
    }
  },

  release: async (path, fd, cb) => {
    try {
      log.debug(`release: ${path} (fd: ${fd})`);
      await sendRequest('release', { handle: fd });
      cb(0);
    } catch (error) {
      log.error(`release error: ${path}`, error);
      cb(0); // Always succeed
    }
  },

  create: async (path, mode, cb) => {
    try {
      log.debug(`create: ${path} (mode: ${mode})`);
      const result = await sendRequest('create', { path, mode });
      cb(0, result.handle);
    } catch (error: any) {
      log.error(`create error: ${path}`, error);
      cb(error.message === 'EACCES' ? Fuse.EACCES : Fuse.EIO);
    }
  },

  unlink: async (path, cb) => {
    try {
      log.debug(`unlink: ${path}`);
      await sendRequest('unlink', { path });
      cb(0);
    } catch (error) {
      log.error(`unlink error: ${path}`, error);
      cb(Fuse.EIO);
    }
  },

  mkdir: async (path, mode, cb) => {
    try {
      log.debug(`mkdir: ${path} (mode: ${mode})`);
      await sendRequest('mkdir', { path, mode });
      cb(0);
    } catch (error: any) {
      log.error(`mkdir error: ${path}`, error);
      cb(error.message === 'EACCES' ? Fuse.EACCES : Fuse.EIO);
    }
  },

  rmdir: async (path, cb) => {
    try {
      log.debug(`rmdir: ${path}`);
      await sendRequest('rmdir', { path });
      cb(0);
    } catch (error: any) {
      log.error(`rmdir error: ${path}`, error);
      cb(error.message === 'ENOTEMPTY' ? Fuse.ENOTEMPTY : Fuse.EIO);
    }
  },

  rename: async (src, dest, cb) => {
    try {
      log.debug(`rename: ${src} -> ${dest}`);
      await sendRequest('rename', { srcPath: src, dstPath: dest });
      cb(0);
    } catch (error) {
      log.error(`rename error: ${src} -> ${dest}`, error);
      cb(Fuse.EIO);
    }
  },

  truncate: async (path, size, cb) => {
    try {
      log.debug(`truncate: ${path} (size: ${size})`);
      await sendRequest('truncate', { path, size });
      cb(0);
    } catch (error) {
      log.error(`truncate error: ${path}`, error);
      cb(Fuse.EIO);
    }
  },

  flush: async (path, fd, cb) => {
    log.debug(`flush: ${path} (fd: ${fd})`);
    cb(0);
  },

  fsync: async (path, fd, datasync, cb) => {
    log.debug(`fsync: ${path} (fd: ${fd})`);
    cb(0);
  },

  statfs: (path, cb) => {
    log.debug(`statfs: ${path}`);
    cb(0, {
      bsize: 4096,
      frsize: 4096,
      blocks: 1000000,
      bfree: 500000,
      bavail: 500000,
      files: 100000,
      ffree: 50000,
      favail: 50000,
      fsid: 0,
      flag: 0,
      namemax: 255,
    });
  },

  access: (path, mode, cb) => {
    log.debug(`access: ${path} (mode: ${mode})`);
    cb(0);
  },
};

async function initializeFuse(letter: string): Promise<void> {
  const mount = `${letter}:`;
  
  log.info(`Initializing FUSE at ${mount}`);

  try {
    fuse = new Fuse(mount, ops, {
      debug: false,
      force: true,
      mkdir: true,
    });

    fuse.mount((err) => {
      if (err) {
        log.error('Failed to mount:', err);
        process.send?.({ type: 'error', error: err.message });
        return;
      }

      log.info(`FUSE mounted at ${mount}`);
      process.send?.({ type: 'ready' });
    });
  } catch (error: any) {
    log.error('Failed to initialize FUSE:', error);
    process.send?.({ type: 'error', error: error.message });
  }
}

async function unmountFuse(): Promise<void> {
  if (!fuse) {
    process.exit(0);
    return;
  }

  log.info('Unmounting FUSE...');

  fuse.unmount((err) => {
    if (err) {
      log.error('Failed to unmount:', err);
    } else {
      log.info('FUSE unmounted');
    }
    
    fuse = null;
    process.exit(0);
  });
}

// Handle process termination
process.on('SIGINT', unmountFuse);
process.on('SIGTERM', unmountFuse);
process.on('exit', () => {
  if (fuse) {
    fuse.unmount(() => {});
  }
});

// Notify main process we're ready to receive commands
process.send?.({ type: 'started' });
