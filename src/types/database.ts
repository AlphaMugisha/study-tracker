/**
 * Database types.
 *
 * Hand-written for now, matching supabase/migrations/. Once the schema grows
 * in Phase 2 this should be generated instead:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */

export type UserRole = "student" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        /** Inserts happen via the on_auth_user_created trigger, not the client. */
        Insert: Pick<Profile, "id"> & Partial<Omit<Profile, "id">>;
        /** Only full_name and timezone are grantable to `authenticated`. */
        Update: Partial<Pick<Profile, "full_name" | "timezone">>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<never, never>;
  };
};
