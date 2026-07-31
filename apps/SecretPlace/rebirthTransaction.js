import fs from 'node:fs';

export class FileRollbackTransaction {
  constructor(fileSystem = fs) {
    this.fileSystem = fileSystem;
    this.snapshots = new Map();
  }

  capture(filePath) {
    if (this.snapshots.has(filePath)) return;

    const exists = this.fileSystem.existsSync(filePath);
    this.snapshots.set(filePath, {
      exists,
      content: exists ? this.fileSystem.readFileSync(filePath) : null,
    });
  }

  rollback() {
    const errors = [];
    const snapshots = [...this.snapshots.entries()].reverse();

    for (const [filePath, snapshot] of snapshots) {
      try {
        if (snapshot.exists) {
          writeFileAtomically(filePath, snapshot.content, this.fileSystem);
        } else if (this.fileSystem.existsSync(filePath)) {
          this.fileSystem.unlinkSync(filePath);
        }
      } catch (err) {
        errors.push(new Error(`恢复文件失败：${filePath}`, { cause: err }));
      }
    }

    this.snapshots.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, '轮回文件回滚失败');
    }
  }

  commit() {
    this.snapshots.clear();
  }
}

export function writeJsonAtomically(filePath, value, fileSystem = fs) {
  const content = JSON.stringify(value, null, '\t');
  writeFileAtomically(filePath, content, fileSystem);
}

function writeFileAtomically(filePath, content, fileSystem = fs) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tempPath = `${filePath}.${suffix}.tmp`;

  try {
    fileSystem.writeFileSync(tempPath, content, 'utf8');
    fileSystem.renameSync(tempPath, filePath);
  } finally {
    if (fileSystem.existsSync(tempPath)) {
      fileSystem.unlinkSync(tempPath);
    }
  }
}
