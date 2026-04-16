import { inMemoryDb } from './in-memory-db'
import { firebaseDb } from './firebase-db'
import type { DatabaseService } from './db-interface'

// Single point of TEST_MODE switching.
// All features import `db` from here — never directly from the implementations.
export const db: DatabaseService =
  import.meta.env.VITE_TEST_MODE === 'true' ? inMemoryDb : firebaseDb

export type { DatabaseService } from './db-interface'
export { setChurchId, getChurchId, TEST_CHURCH_ID } from './church-context'
