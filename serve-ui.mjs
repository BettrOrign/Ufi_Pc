import 'dotenv/config';
import { loadCredentialsIntoEnv } from './src/auth/auth-store.mjs';
import { Core } from './src/core/index.mjs';

// Load stored credentials (overrides .env for connected services)
loadCredentialsIntoEnv();

const core = new Core({ port: 3000 });
core.start().catch(err => {
  console.error('Failed to start Core:', err);
  process.exit(1);
});
