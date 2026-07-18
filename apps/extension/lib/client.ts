import { RecallClient } from '@recall/api-client';
import { getAccessToken } from './supabase';

export const recall = new RecallClient({
  baseUrl: import.meta.env.WXT_API_BASE_URL,
  getToken: getAccessToken,
});
