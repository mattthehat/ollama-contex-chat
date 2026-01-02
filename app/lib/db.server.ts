import { MySQLORM } from 'atlas-mysql';
import type { MySQLORMConfig } from 'atlas-mysql';

// Create ORM instance with configuration
// Note: mysql2 doesn't support compression disabling via atlas-mysql config
// We'll need to use environment variables or modify the mysql2 pool directly
const config: MySQLORMConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'ollama-chat',
    port: parseInt(process.env.DB_PORT || '3306'),
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
};

const db = new MySQLORM(config);

// Access the internal pool to disable compression
// @ts-ignore - accessing private property to disable compression
if (db.pool && typeof db.pool.config === 'object') {
    // @ts-ignore
    db.pool.config.compress = false;
}

export { db };
