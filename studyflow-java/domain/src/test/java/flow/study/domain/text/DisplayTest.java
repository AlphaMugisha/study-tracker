package flow.study.domain.text;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DisplayTest {

    @Test
    void a_sync_that_just_landed_does_not_claim_a_minute() {
        assertEquals("just now", Display.agoLabel(Duration.ZERO));
        assertEquals("just now", Display.agoLabel(Duration.ofSeconds(44)));
    }

    @Test
    void the_first_minute_is_singular() {
        assertEquals("1 min ago", Display.agoLabel(Duration.ofSeconds(45)));
        assertEquals("1 min ago", Display.agoLabel(Duration.ofSeconds(89)));
    }

    @Test
    void minutes_round_to_the_nearest_rather_than_down() {
        assertEquals("2 min ago", Display.agoLabel(Duration.ofSeconds(90)));
        assertEquals("4 min ago", Display.agoLabel(Duration.ofMinutes(4)));
        assertEquals("59 min ago", Display.agoLabel(Duration.ofMinutes(59)));
    }

    @Test
    void an_hour_reads_as_an_hour() {
        assertEquals("1 hr ago", Display.agoLabel(Duration.ofMinutes(60)));
        assertEquals("1 hr ago", Display.agoLabel(Duration.ofMinutes(89)));
        assertEquals("2 hr ago", Display.agoLabel(Duration.ofMinutes(90)));
        assertEquals("23 hr ago", Display.agoLabel(Duration.ofHours(23)));
    }

    @Test
    void past_a_day_the_number_stops_being_the_point() {
        assertEquals("a while ago", Display.agoLabel(Duration.ofHours(24)));
        assertEquals("a while ago", Display.agoLabel(Duration.ofDays(9)));
    }

    @Test
    void a_clock_that_went_backwards_does_not_produce_a_negative() {
        // The laptop's clock is not authoritative and can be corrected by NTP
        // mid-session. "-3 min ago" would be the app looking broken over
        // something that is not its fault.
        assertEquals("just now", Display.agoLabel(Duration.ofSeconds(-30)));
    }
}
