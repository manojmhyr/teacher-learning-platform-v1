import { config } from '@/config/env';
import { azureProvider } from './azureProvider';
import { mockProvider } from './mockProvider';
import type { ContentProvider } from './types';

/**
 * Resolves the active content provider from configuration.
 *
 * This is the ONLY place the app decides where lesson content comes from.
 * Flipping VITE_CONTENT_SOURCE from `mock` to `azure` switches the whole
 * application over with no other code change.
 */
export const contentProvider: ContentProvider = config.contentSource === 'azure' ? azureProvider : mockProvider;

export type { ContentProvider };
export { ContentError } from './types';
