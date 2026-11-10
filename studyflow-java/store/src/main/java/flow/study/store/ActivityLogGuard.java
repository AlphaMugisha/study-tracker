package flow.study.store;

import org.h2.api.Trigger;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * The activity log is append-only here too.
 *
 * In the cloud this is enforced three ways: no UPDATE policy, no UPDATE
 * privilege to grant, and a BEFORE UPDATE trigger that raises even for the
 * service role. Locally the first two have nothing to attach to -- there are
 * no roles in a single-user file -- so the trigger carries it alone.
 *
 * DELETE is left alone, exactly as in migration 0002, so that clearing the
 * local copy and re-pulling still works. Rewriting history is the thing being
 * prevented; discarding a cache is not.
 */
public final class ActivityLogGuard implements Trigger {

    @Override
    public void fire(Connection conn, Object[] oldRow, Object[] newRow) throws SQLException {
        throw new SQLException(
                "activity_logs is append-only: an academic record is not edited after the fact",
                "23514");
    }
}
