package flow.study.domain.model;

import java.time.Instant;

public record Subject(
        String id,
        String userId,
        String name,
        String shortName,
        /** A palette slot (chart-1 through chart-5), never a raw hex value. */
        String colorToken,
        Instant createdAt,
        Instant updatedAt) {
}
