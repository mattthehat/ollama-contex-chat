import { createMySQLORMFromEnv } from 'atlas-mysql';

const db = createMySQLORMFromEnv();

export { db };
