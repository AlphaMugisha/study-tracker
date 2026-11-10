package flow.study.domain.model;

import java.time.Instant;

/**
 * The stuck-on list: a topic she has said she does not understand.
 *
 * Both links are optional on purpose. An entry can hang off one assignment, a
 * whole subject, both, or neither -- not understanding quadratics belongs to
 * no single piece of homework.
 */
public record HelpRequest(
        String id,
        String userId,
        String subjectId,
        String assignmentId,
        String topic,
        String detail,
        HelpStatus status,
        Instant resolvedAt,
        Instant createdAt,
        Instant updatedAt) {
}
