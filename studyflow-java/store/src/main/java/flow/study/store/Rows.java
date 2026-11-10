package flow.study.store;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * JDBC to java.time, in one place.
 *
 * Every nullable column in this schema is nullable for a reason the domain
 * cares about -- a due time that means end of day, a subject that means no
 * subject -- so getters that silently turn null into zero would quietly
 * change behaviour. These return null and let the records say what that
 * means.
 */
final class Rows {
    private Rows() {}

    static String text(ResultSet rows, String column) throws SQLException {
        return rows.getString(column);
    }

    static Instant instant(ResultSet rows, String column) throws SQLException {
        Timestamp value = rows.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    /** By index, for an aggregate that has no column name to speak of. */
    static Instant instant(ResultSet rows, int index) throws SQLException {
        Timestamp value = rows.getTimestamp(index);
        return value == null ? null : value.toInstant();
    }

    static LocalDate date(ResultSet rows, String column) throws SQLException {
        java.sql.Date value = rows.getDate(column);
        return value == null ? null : value.toLocalDate();
    }

    static LocalTime time(ResultSet rows, String column) throws SQLException {
        java.sql.Time value = rows.getTime(column);
        return value == null ? null : value.toLocalTime();
    }

    /** Null-aware: an Integer column that is SQL NULL comes back as null. */
    static Integer integer(ResultSet rows, String column) throws SQLException {
        int value = rows.getInt(column);
        return rows.wasNull() ? null : value;
    }

    static void setInstant(PreparedStatement statement, int index, Instant value)
            throws SQLException {
        if (value == null) statement.setNull(index, java.sql.Types.TIMESTAMP);
        else statement.setTimestamp(index, Timestamp.from(value));
    }

    static void setDate(PreparedStatement statement, int index, LocalDate value)
            throws SQLException {
        if (value == null) statement.setNull(index, java.sql.Types.DATE);
        else statement.setDate(index, java.sql.Date.valueOf(value));
    }

    static void setTime(PreparedStatement statement, int index, LocalTime value)
            throws SQLException {
        if (value == null) statement.setNull(index, java.sql.Types.TIME);
        else statement.setTime(index, java.sql.Time.valueOf(value));
    }

    static void setInteger(PreparedStatement statement, int index, Integer value)
            throws SQLException {
        if (value == null) statement.setNull(index, java.sql.Types.INTEGER);
        else statement.setInt(index, value);
    }

    /** A new id for a row the cloud has never seen. */
    static String localId() {
        return flow.study.domain.model.Ids.LOCAL_PREFIX
                + java.util.UUID.randomUUID();
    }
}
