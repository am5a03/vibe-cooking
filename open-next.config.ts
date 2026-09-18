import { defineCloudflareConfig } from '@opennextjs/cloudflare';
// Private API responses are dynamic/no-store. No R2/ISR cache is provisioned.
export default defineCloudflareConfig({});
